import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, Star, Bell, StickyNote, Newspaper, Activity, TrendingUp, TrendingDown,
  AlertCircle, ExternalLink, RefreshCw, Trash2, Calendar, Sparkles,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { useAuth, isPro } from '@/store/auth';

// lightweight-charts heavy (~200KB) — lazy load
const LiveChart = lazy(() => import('@/components/domain/LiveChart').then((m) => ({ default: m.LiveChart })));
import { PeriodReturns } from '@/components/domain/PeriodReturns';
import { Sparkline } from '@/components/domain/Sparkline';
import { NewsCard } from '@/components/domain/NewsCard';
import { AlertButton } from '@/components/domain/AlertButton';
import { NoteButton } from '@/components/domain/NoteButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { fetchHistoricalYahoo, fetchIndexYahoo, computePeriodReturns, type HistoricalSeries, type PeriodReturns as PeriodReturnsT } from '@/data/api/yahoo';
import { loadStocks, loadNews } from '@/data/services';
import { rsi, macd, ema, sma, bollinger, adx, rsiSignal, bollingerLabel, adxLabel, supportResistance, type OHLC } from '@/lib/indicators';
import { analyzeTimeframe, aggregateTo4h, computeBigPlayerLean, buildVerdict, type MultiTimeframeResult, type TimeframeAnalysis } from '@/lib/multiTimeframe';
import { MultiTimeframeCard } from '@/components/domain/MultiTimeframeCard';
import { PositionSizer } from '@/components/domain/PositionSizer';
import { notesRepo, alertsRepo, activityRepo } from '@/data/repositories';
import { MiniMarkdown } from '@/lib/miniMarkdown';
import { useWatchlist } from '@/store/watchlist';
import type { Stock, NewsItem } from '@/data/types';
import { MOCK_STOCKS } from '@/data/mock';
import { findUsStock } from '@/data/usStocks';
import { findBistStock } from '@/data/bistAll';
import { formatMoney, formatNumber, formatCompact } from '@/lib/format';
import { formatRelative, formatDateTR } from '@/lib/date';
import { cn } from '@/lib/utils';
import { kapDetailUrl } from '@/data/kapSlugs';

export function StockDetailPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const sym = symbol.toUpperCase();

  const watchlistAdd = useWatchlist((s) => s.add);
  const watchlistRemove = useWatchlist((s) => s.remove);
  const watchlistHas = useWatchlist((s) => s.has(sym));

  const usMeta = findUsStock(sym);
  const isUs = !!usMeta;
  // BIST endeksleri (XU100, XU030, vb.) için özel meta
  const bistIndexMeta: Record<string, { name: string; sector: string }> = {
    XU100: { name: 'BIST 100 Endeksi', sector: 'Endeks' },
    XU030: { name: 'BIST 30 Endeksi', sector: 'Endeks' },
    XUSIN: { name: 'BIST Sınai Endeksi', sector: 'Endeks' },
    XUMAL: { name: 'BIST Mali Endeksi', sector: 'Endeks' },
    XUTUM: { name: 'BIST Tüm Endeksi', sector: 'Endeks' },
  };
  // BIST sembolü: önce MOCK_STOCKS (zengin), yoksa BIST_UNIQUE, yoksa endeks fallback
  const initialBistStock = !isUs
    ? (MOCK_STOCKS.find((s) => s.symbol === sym) ?? (() => {
        const bist = findBistStock(sym);
        if (bist) {
          return {
            symbol: bist.symbol,
            name: bist.name,
            sector: bist.sector,
            price: 0,
            changePct: 0,
            updatedAt: new Date().toISOString(),
          } as Stock;
        }
        const idx = bistIndexMeta[sym];
        if (idx) {
          return {
            symbol: sym,
            name: idx.name,
            sector: idx.sector,
            price: 0,
            changePct: 0,
            updatedAt: new Date().toISOString(),
          } as Stock;
        }
        return null;
      })())
    : null;

  const [stock, setStock] = useState<Stock | null>(() => {
    if (initialBistStock) return initialBistStock;
    if (usMeta) {
      return {
        symbol: usMeta.symbol,
        name: usMeta.name,
        sector: usMeta.sector,
        price: 0,
        changePct: 0,
        updatedAt: new Date().toISOString(),
      };
    }
    return null;
  });
  const [historical, setHistorical] = useState<HistoricalSeries | null>(null);
  const [returns, setReturns] = useState<PeriodReturnsT>({});
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mtResult, setMtResult] = useState<MultiTimeframeResult | null>(null);

  // AI Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const user = useAuth((s) => s.user);
  const proUser = isPro(user);

  // User-specific data from IndexedDB
  const notes = useLiveQuery(() => notesRepo.bySymbol(sym), [sym]) ?? [];
  const alerts = useLiveQuery(() => alertsRepo.bySymbol(sym), [sym]) ?? [];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // ABD hisseleri için `.IS` suffix kapalı + Yahoo quote direkt
    const fetchQuote = isUs
      ? fetchIndexYahoo(sym).then((r) => r ? [{
          symbol: sym,
          name: usMeta?.name ?? sym,
          sector: usMeta?.sector,
          price: r.value,
          changePct: r.changePct,
          updatedAt: new Date().toISOString(),
        } satisfies Stock] : [])
      : loadStocks([sym]).then((r) => r.data);

    Promise.all([
      fetchQuote,
      fetchHistoricalYahoo(sym, '1y', '1d', { bistSuffix: !isUs }),
      loadNews({ max: 30 }),
      fetchHistoricalYahoo(sym, '1mo', '60m', { bistSuffix: !isUs }),
    ]).then(([liveStocks, hist, allNews, hist1h]) => {
      if (!alive) return;
      const found = liveStocks.find((s) => s.symbol === sym);
      if (found) setStock(found);
      if (hist) {
        setHistorical(hist);
        setReturns(computePeriodReturns(hist.closes));
      }
      setNews(allNews.data.filter((n) => n.symbols.includes(sym)));
      setLoading(false);

      // Multi-timeframe analizi
      try {
        const price = found?.price ?? hist?.bars.at(-1)?.close ?? 0;
        const changePct = found?.changePct ?? 0;
        let tf1h: TimeframeAnalysis | null = null;
        let tf4h: TimeframeAnalysis | null = null;
        let tf1d: TimeframeAnalysis | null = null;
        let lean: 'alıcı' | 'satıcı' | 'kararsız' = 'kararsız';
        if (hist1h && hist1h.bars.length > 0) {
          tf1h = analyzeTimeframe(hist1h.bars.map((b) => b.close), [5, 8, 13, 21, 55]);
          tf4h = analyzeTimeframe(aggregateTo4h(hist1h.bars).map((b) => b.close), [5, 8, 13, 21]);
        }
        if (hist && hist.bars.length > 0) {
          const closes1d = hist.bars.map((b) => b.close);
          tf1d = analyzeTimeframe(closes1d, [5, 8, 13, 21, 55, 200]);
          const ohlc: OHLC[] = hist.bars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
          lean = computeBigPlayerLean(ohlc);
        }
        const base: Omit<MultiTimeframeResult, 'verdict'> = {
          symbol: sym, label: found?.name ?? sym, price, changePct,
          tf1h, tf4h, tf1d, bigPlayerLean: lean,
        };
        setMtResult({ ...base, verdict: buildVerdict(base) });
      } catch { /* ignore */ }

      // Log view
      activityRepo.log({ type: 'page-view', symbol: sym, detail: `/stock/${sym}` }).catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [sym]);

  // Teknik analiz — historical varsa hesapla.
  // Hook order'ı stabil tutmak için early return'dan ÖNCE çağırılmalı
  // (aksi halde stock null → null değil arası render'da React #310).
  const technicalAnalysis = useMemo(() => {
    if (!historical || historical.bars.length < 25) return null;
    const closes = historical.bars.map((b) => b.close);
    const bars: OHLC[] = historical.bars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
    const cur = closes[closes.length - 1];
    const r = rsi(closes, 14).at(-1);
    const macdR = macd(closes);
    const boll = bollinger(closes);
    const adxR = adx(bars);
    const sr = supportResistance(bars, 60);
    const emaPeriods = [5, 8, 13, 21, 55, 200];
    const emas = emaPeriods
      .map((p) => {
        const v = ema(closes, p).at(-1);
        if (!Number.isFinite(v)) return null;
        return { period: p, value: v as number, abovePct: ((cur - (v as number)) / (v as number)) * 100 };
      })
      .filter((x): x is { period: number; value: number; abovePct: number } => x !== null);
    const ma8Val = sma(closes, 8).at(-1);
    return {
      rsi: r,
      rsiNote: r != null ? rsiSignal(r) : '',
      macdBullish: macdR.recentBullishCross,
      macdBearish: macdR.recentBearishCross,
      bollingerLabel: bollingerLabel(boll.position),
      adxLabel: adxLabel(adxR.lastTrendStrength),
      support: sr.support,
      resistance: sr.resistance,
      emas,
      ma8: Number.isFinite(ma8Val) ? (ma8Val as number) : undefined,
      cur,
    };
  }, [historical]);

  if (!stock) {
    return (
      <>
        <button onClick={() => navigate(-1)} className="btn-ghost mb-3">
          <ArrowLeft size={14} /> Geri
        </button>
        <EmptyState
          icon={<AlertCircle size={28} />}
          title="Sembol bulunamadı"
          description={`"${sym}" için veri yok.`}
        />
      </>
    );
  }

  const sparklineData = historical ? historical.closes.slice(-30).map((c) => c.close) : [];
  const tone = stock.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = stock.changePct >= 0 ? '+' : '';

  const generateAiAnalysis = async () => {
    if (!stock) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const r = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: stock.symbol,
          name: stock.name,
          price: stock.price,
          changePct: stock.changePct,
          rsi: technicalAnalysis?.rsi,
          macd: technicalAnalysis?.macdBullish ? 'bullish' : technicalAnalysis?.macdBearish ? 'bearish' : 'neutral',
          emaPositions: technicalAnalysis?.emas.map((e) => ({ period: e.period, above: e.abovePct >= 0 })),
          sector: stock.sector,
          news: news.slice(0, 3).map((n) => ({ title: n.title, source: n.source })),
        }),
      });
      const json = await r.json() as { ok: boolean; analysis?: string; error?: string };
      if (!json.ok) {
        setAiError(json.error || 'AI analiz alınamadı');
        toast.error('AI analiz hatası', json.error);
        return;
      }
      setAiAnalysis(json.analysis ?? '');
      toast.success('AI analizi hazır', `${stock.symbol} için 1 saat cache'lenir`);
    } catch (e) {
      const msg = (e as Error).message;
      setAiError(msg);
      toast.error('Ağ hatası', msg);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="btn-ghost">
          <ArrowLeft size={14} /> Geri
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (watchlistHas ? watchlistRemove(sym) : watchlistAdd(sym))}
            className={cn(
              'btn-secondary',
              watchlistHas && 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/20',
            )}
          >
            <Star size={14} fill={watchlistHas ? 'currentColor' : 'none'} />
            {watchlistHas ? 'Takipte' : 'Takip et'}
          </button>
          <AlertButton stock={stock} />
          <NoteButton symbol={sym} hint={`${stock.name} için not`} />
        </div>
      </div>

      {/* Hero */}
      <div className="card relative mb-4 overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-3xl font-bold tracking-tight text-slate-100">{sym}</h1>
              {stock.sector && (
                <span className="rounded-md border border-border bg-bg-soft px-2 py-0.5 text-xs text-slate-300">
                  {stock.sector}
                </span>
              )}
              <span className="rounded-md bg-bg-soft px-2 py-0.5 text-xs text-slate-400">
                {isUs ? (usMeta?.exchange ?? 'NYSE/NASDAQ') : 'BIST'}
              </span>
            </div>
            <p className="mt-1 text-lg text-slate-300">{stock.name}</p>
          </div>
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-3">
              <span className="text-4xl font-bold tabular-nums text-slate-100">
                {isUs
                  ? `$${stock.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                  : formatMoney(stock.price)}
              </span>
              {sparklineData.length > 1 && (
                <Sparkline
                  data={sparklineData}
                  width={120}
                  height={36}
                  positive={stock.changePct >= 0}
                />
              )}
            </div>
            <div className={cn('mt-1 text-lg font-semibold tabular-nums', tone)}>
              {sign}
              {stock.changePct.toFixed(2)}%
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              <Calendar size={10} className="mr-1 inline" />
              {formatRelative(stock.updatedAt)}
            </div>
          </div>
        </div>

        {/* Period returns */}
        <div className="mt-5">
          <PeriodReturns returns={returns} />
        </div>
      </div>

      {/* Chart */}
      <div className="card mb-4 overflow-hidden p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          Canlı Grafik <span className="text-slate-500">(Yahoo Finance + lightweight-charts)</span>
        </h2>
        <Suspense fallback={<Skeleton variant="rect" className="w-full" height={520} />}>
          <LiveChart symbol={sym} height={520} bistSuffix={!isUs} />
        </Suspense>
      </div>

      {/* Multi-Timeframe Trend Analizi */}
      {mtResult && (
        <div className="card mb-4 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Activity size={14} className="text-accent" /> Çoklu Zaman Dilimi Yön Analizi
            <span className="ml-auto text-[10px] text-slate-500">1H / 4H / 1D</span>
          </h2>
          <MultiTimeframeCard r={mtResult} currency={isUs ? '$' : '₺'} hideHeader />
        </div>
      )}

      {/* Teknik Analiz — Fintables tarzı */}
      {technicalAnalysis && (
        <div className="card mb-4 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Activity size={14} className="text-accent" /> Teknik Analiz
            <span className="ml-auto text-[10px] text-slate-500">{historical?.bars.length} günlük veri</span>
          </h2>

          {/* RSI / MACD / Bollinger / ADX */}
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 mb-4">
            <div className="rounded-lg border border-border bg-bg-soft p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">RSI (14)</div>
              <div className={cn(
                'mt-1 text-lg font-bold tabular-nums',
                (technicalAnalysis.rsi ?? 0) >= 70 ? 'text-warning' :
                (technicalAnalysis.rsi ?? 0) <= 30 ? 'text-success' : 'text-slate-100',
              )}>
                {technicalAnalysis.rsi != null ? technicalAnalysis.rsi.toFixed(1) : '—'}
              </div>
              <div className="text-[10px] text-slate-400">{technicalAnalysis.rsiNote}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-soft p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">MACD</div>
              <div className="mt-1 text-base font-bold">
                {technicalAnalysis.macdBullish ? <span className="text-success">Bullish ✓</span>
                  : technicalAnalysis.macdBearish ? <span className="text-danger">Bearish ✗</span>
                  : <span className="text-slate-400">Nötr</span>}
              </div>
              <div className="text-[10px] text-slate-400">12-26-9 kesişim</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-soft p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Bollinger</div>
              <div className="mt-1 text-xs font-semibold text-slate-100 leading-tight">
                {technicalAnalysis.bollingerLabel}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-soft p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">ADX (Trend)</div>
              <div className="mt-1 text-sm font-bold text-slate-100">{technicalAnalysis.adxLabel}</div>
            </div>
          </div>

          {/* Destek / Direnç */}
          <div className="grid gap-2 grid-cols-2 mb-4">
            <div className="rounded-lg border border-success/30 bg-success/5 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-success">Destek</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">
                {isUs ? `$${technicalAnalysis.support.toFixed(2)}` : `${technicalAnalysis.support.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`}
              </div>
              <div className="text-[10px] text-slate-400">
                %{(((technicalAnalysis.cur - technicalAnalysis.support) / technicalAnalysis.cur) * 100).toFixed(2)} uzakta
              </div>
            </div>
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-danger">Direnç</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">
                {isUs ? `$${technicalAnalysis.resistance.toFixed(2)}` : `${technicalAnalysis.resistance.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`}
              </div>
              <div className="text-[10px] text-slate-400">
                %{(((technicalAnalysis.resistance - technicalAnalysis.cur) / technicalAnalysis.cur) * 100).toFixed(2)} uzakta
              </div>
            </div>
          </div>

          {/* EMA Pozisyonları */}
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            EMA Pozisyonları {technicalAnalysis.ma8 != null && (
              <span className="text-accent">• MA8: {isUs ? `$${technicalAnalysis.ma8.toFixed(2)}` : `${technicalAnalysis.ma8.toFixed(2)}₺`}</span>
            )}
          </h3>
          <div className="grid gap-2 grid-cols-3 lg:grid-cols-6">
            {technicalAnalysis.emas.map((e) => {
              const above = e.abovePct >= 0;
              return (
                <div key={e.period} className={cn(
                  'rounded border p-1.5',
                  above ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5',
                )}>
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">EMA {e.period}</div>
                  <div className="text-xs font-bold tabular-nums text-slate-100">
                    {e.value.toFixed(2)}
                  </div>
                  <div className={cn('text-[10px] tabular-nums font-semibold', above ? 'text-success' : 'text-danger')}>
                    {above ? '↑ +' : '↓ '}{e.abovePct.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pozisyon Hesaplayıcı + Stop/TP — BIST için TL bazlı; US için gizli */}
      {technicalAnalysis && !isUs && (
        <div className="mb-4">
          <PositionSizer
            symbol={sym}
            currentPrice={stock.price}
            support={technicalAnalysis.support}
            resistance={technicalAnalysis.resistance}
          />
        </div>
      )}

      {/* AI Hisse Analizi — PRO/ELITE özellik */}
      <div className="card mb-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Sparkles size={14} className="text-warning" /> AI Hisse Analizi
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">
              PRO
            </span>
          </h2>
          {!aiAnalysis && (
            <button
              className="btn-primary"
              onClick={generateAiAnalysis}
              disabled={aiLoading || (!proUser && !!user)}
              title={!proUser && user ? 'PRO/ELITE üyelere özel' : 'AI analiz üret'}
            >
              {aiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {aiLoading ? 'Analiz üretiliyor…' : 'AI Analizi Üret'}
            </button>
          )}
          {aiAnalysis && (
            <button className="btn-secondary" onClick={generateAiAnalysis} disabled={aiLoading}>
              <RefreshCw size={14} className={aiLoading ? 'animate-spin' : ''} /> Yenile
            </button>
          )}
        </div>

        {!proUser && user && !aiAnalysis && (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            🔒 AI analiz PRO/ELITE üyelere özel.{' '}
            <Link to="/uyelik" className="underline">PRO'ya yükselt →</Link>
          </div>
        )}

        {!user && !aiAnalysis && (
          <p className="mt-3 text-xs text-slate-400">
            Bu hisse için Claude AI ile teknik göstergeler + son haberlerden üretilen Türkçe analiz almak için PRO üyeliğe geç.
          </p>
        )}

        {aiAnalysis && (
          <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-4">
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-200">{aiAnalysis}</p>
            <p className="mt-3 text-[10px] text-slate-500">
              AI tarafından üretildi (Claude Haiku 4.5). Yatırım tavsiyesi değildir; bilgi amaçlıdır. 1 saat cache'lenir.
            </p>
          </div>
        )}

        {aiError && (
          <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
            ⚠️ {aiError}
          </div>
        )}
      </div>

      {/* Stats grid */}
      {historical && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="52 Hafta En Yüksek"
            value={historical.meta.fiftyTwoWeekHigh
              ? (isUs ? `$${historical.meta.fiftyTwoWeekHigh.toFixed(2)}` : formatMoney(historical.meta.fiftyTwoWeekHigh))
              : '—'}
            tone="success"
          />
          <Stat
            label="52 Hafta En Düşük"
            value={historical.meta.fiftyTwoWeekLow
              ? (isUs ? `$${historical.meta.fiftyTwoWeekLow.toFixed(2)}` : formatMoney(historical.meta.fiftyTwoWeekLow))
              : '—'}
            tone="danger"
          />
          <Stat
            label="Hacim"
            value={historical.meta.regularMarketVolume ? formatCompact(historical.meta.regularMarketVolume) : '—'}
          />
          <Stat
            label="Ort. Hacim (3A)"
            value={historical.meta.averageDailyVolume3Month ? formatCompact(historical.meta.averageDailyVolume3Month) : '—'}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* News mentioning this symbol */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Newspaper size={14} /> Bu Sembolü İçeren Gelişmeler ({news.length})
          </h2>
          {news.length === 0 ? (
            <div className="card p-6 text-center text-xs text-slate-500">
              {loading ? 'Yükleniyor…' : `${sym} hakkında haber bulunamadı.`}
            </div>
          ) : (
            <div className="space-y-3">
              {news.slice(0, 10).map((n) => (
                <NewsCard key={n.id} item={n} />
              ))}
            </div>
          )}
        </section>

        {/* Right panel: notes, alerts, activity */}
        <aside className="space-y-4">
          {/* Notes */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <StickyNote size={12} /> Notlarım
              </h3>
              <span className="text-[10px] text-slate-500">{notes.length}</span>
            </div>
            {notes.length === 0 ? (
              <p className="px-4 py-4 text-center text-xs text-slate-500">
                Henüz not yok. Üst menüden "Not" tuşuna bas.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {notes.slice(0, 5).map((n) => (
                  <div key={n.id} className="p-3">
                    <MiniMarkdown text={n.body} className="space-y-1 text-xs text-slate-300" />
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{formatDateTR(new Date(n.updatedAt).toISOString())}</span>
                      <button
                        onClick={() => n.id && notesRepo.remove(n.id)}
                        className="text-danger/70 hover:text-danger"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
                {notes.length > 5 && (
                  <Link to="/history" className="block px-3 py-2 text-center text-[11px] text-accent hover:bg-bg-soft">
                    +{notes.length - 5} not daha — Geçmiş'te gör
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Alerts */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <Bell size={12} /> Alarmlarım
              </h3>
              <span className="text-[10px] text-slate-500">{alerts.length}</span>
            </div>
            {alerts.length === 0 ? (
              <p className="px-4 py-4 text-center text-xs text-slate-500">Alarm yok.</p>
            ) : (
              <div className="divide-y divide-border">
                {alerts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3">
                    <div>
                      <div className="text-xs text-slate-200">
                        {a.direction === 'above' ? '≥' : '≤'} {formatMoney(a.threshold)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {a.enabled ? 'Aktif' : 'Pasif'} • {formatRelative(new Date(a.createdAt).toISOString())}
                      </div>
                    </div>
                    <button
                      onClick={() => a.id && alertsRepo.remove(a.id)}
                      className="text-danger/70 hover:text-danger"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* External links */}
          <div className="card p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Dış Bağlantılar</h3>
            <div className="space-y-1.5">
              {isUs ? (
                <>
                  <a
                    href={`https://www.tradingview.com/symbols/${usMeta?.exchange ?? 'NASDAQ'}-${sym}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-md bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:bg-bg-card"
                  >
                    <span>TradingView</span>
                    <ExternalLink size={11} />
                  </a>
                  <a
                    href={`https://finance.yahoo.com/quote/${sym}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-md bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:bg-bg-card"
                  >
                    <span>Yahoo Finance</span>
                    <ExternalLink size={11} />
                  </a>
                  <a
                    href={`https://seekingalpha.com/symbol/${sym}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-md bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:bg-bg-card"
                  >
                    <span>Seeking Alpha</span>
                    <ExternalLink size={11} />
                  </a>
                  <a
                    href={`https://www.google.com/finance/quote/${sym}:${usMeta?.exchange ?? 'NASDAQ'}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-md bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:bg-bg-card"
                  >
                    <span>Google Finance</span>
                    <ExternalLink size={11} />
                  </a>
                </>
              ) : (
                <>
                  <a
                    href={`https://www.tradingview.com/symbols/BIST-${sym}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-md bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:bg-bg-card"
                  >
                    <span>TradingView</span>
                    <ExternalLink size={11} />
                  </a>
                  <a
                    href={kapDetailUrl(sym)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-md bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:bg-bg-card"
                    title={`KAP — ${sym} şirket detay sayfası`}
                  >
                    <span>KAP Şirket Bilgileri</span>
                    <ExternalLink size={11} />
                  </a>
                  <a
                    href={`https://fintables.com/sirketler/${sym}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-md bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:bg-bg-card"
                  >
                    <span>Fintables (Detay)</span>
                    <ExternalLink size={11} />
                  </a>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-slate-100';
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tabular-nums', toneClass)}>{value}</div>
    </div>
  );
}
