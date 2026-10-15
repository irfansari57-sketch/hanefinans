import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, Star, Bell, StickyNote, Newspaper, Activity, TrendingUp, TrendingDown,
  AlertCircle, ExternalLink, RefreshCw, Trash2, Calendar, Sparkles,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { useAuth, isElite } from '@/store/auth';

// lightweight-charts heavy (~200KB) — lazy load
const LiveChart = lazy(() => import('@/components/domain/LiveChart').then((m) => ({ default: m.LiveChart })));
import { PanelStyleChart } from '@/components/domain/PanelStyleChart';
import { ShareButton } from '@/components/ui/ShareButton';
import { PeriodReturns } from '@/components/domain/PeriodReturns';
import { Sparkline } from '@/components/domain/Sparkline';
import { NewsCard } from '@/components/domain/NewsCard';
import { AlertButton } from '@/components/domain/AlertButton';
import { NoteButton } from '@/components/domain/NoteButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { fetchHistoricalYahoo, fetchIndexYahoo, computePeriodReturns, type HistoricalSeries, type PeriodReturns as PeriodReturnsT } from '@/data/api/yahoo';
import { loadStocks, loadNews } from '@/data/services';
import { useKatilim } from '@/hooks/useKatilim';
import { EvidenceLink } from '@/components/ui/EvidenceLink';
import { computeRegime, type RegimeResult } from '@/lib/regime';
import { fetchRegime, type RegimeApi } from '@/data/api/regime';
import { buildChartEvents } from '@/lib/chartEvents';
import { evaluateSignals, type Signal } from '@/lib/signals';
import { KatilimBadge } from '@/components/domain/KatilimBadge';
import { rsi, macd, ema, sma, bollinger, adx, rsiSignal, bollingerLabel, adxLabel, supportResistance, closedBarsOnly, type OHLC } from '@/lib/indicators';
import { isBistOpen } from '@/lib/marketCalendar';
import { analyzeTimeframe, aggregateTo4h, BIST_4H, computeBigPlayerLean, buildVerdict, type MultiTimeframeResult, type TimeframeAnalysis } from '@/lib/multiTimeframe';
import { MultiTimeframeCard } from '@/components/domain/MultiTimeframeCard';
import { DeepAnalysisCard } from './sections/DeepAnalysisCard';
import { FinancialStatementsCard } from './sections/FinancialStatementsCard';
import { PinnableAccordion } from '@/components/domain/PinnableAccordion';
import { Sparkles as SparklesIcon } from 'lucide-react';
import { notesRepo, alertsRepo, activityRepo } from '@/data/repositories';
import { MiniMarkdown } from '@/lib/miniMarkdown';
import { useWatchlist } from '@/store/watchlist';
import type { Stock, NewsItem } from '@/data/types';
import { MOCK_STOCKS } from '@/data/mock';
import { findUsStock } from '@/data/usStocks';
import { findBistStock } from '@/data/bistAll';
import { formatMoney, formatNumber, formatCompact } from '@/lib/format';
import { validateStockQuote, dqLog } from '@/lib/dataQuality';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { DataFreshness } from '@/components/ui/DataFreshness';
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

  // 13 Eki 2026: hisse başına haber/KAP akışı (/api/stocks/:symbol/news — Google News,
  // şirket adı + sembol). Genel akıştaki sembol filtresi (news) yedek olarak kalır.
  const [symbolNews, setSymbolNews] = useState<NewsItem[] | null>(null);
  useEffect(() => {
    if (isUs) { setSymbolNews(null); return; }
    let alive = true;
    const name = initialBistStock?.name ?? '';
    fetch(`/api/stocks/${encodeURIComponent(sym)}/news?name=${encodeURIComponent(name)}&max=20`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok: boolean; items?: Array<NewsItem & { isKap?: boolean }> } | null) => {
        if (!alive || !j?.ok || !Array.isArray(j.items)) return;
        setSymbolNews(j.items.map((it) => ({ ...it, symbols: [sym], importance: it.critical ? 10 : it.isKap ? 8 : 6 })));
      })
      .catch(() => { /* yedek: genel akış filtresi */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym, isUs]);

  // AI Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const user = useAuth((s) => s.user);
  const proUser = isElite(user);

  // User-specific data from IndexedDB
  const notes = useLiveQuery(() => notesRepo.bySymbol(sym), [sym]) ?? [];
  const alerts = useLiveQuery(() => alertsRepo.bySymbol(sym), [sym]) ?? [];
  const { map: katilimMap } = useKatilim();
  // Hafta 2 rejim: hissenin kendi rejimi (1y Yahoo barlarından, deterministik) + XU100 bağlamı
  const [indexRegime, setIndexRegime] = useState<RegimeApi | null>(null);
  useEffect(() => {
    let alive = true;
    if (!isUs) fetchRegime('XU100').then((r) => { if (alive) setIndexRegime(r); });
    return () => { alive = false; };
  }, [isUs]);
  // Design 03: katmanlı detay — 4 sekme, URL'de (?tab=)
  const [searchParams, setSearchParams] = useSearchParams();
  type DetailTab = 'genel' | 'teknik' | 'temel' | 'haber';
  const tabParam = searchParams.get('tab');
  const tab: DetailTab = tabParam === 'teknik' || tabParam === 'temel' || tabParam === 'haber' ? tabParam : 'genel';
  const setTab = (t: DetailTab) => {
    const next = new URLSearchParams(searchParams);
    if (t === 'genel') next.delete('tab'); else next.set('tab', t);
    setSearchParams(next, { replace: true });
  };

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
      const found: Stock | undefined = liveStocks.find((s) => s.symbol === sym);
      if (found) setStock(found);
      if (hist) {
        // Yahoo bazen son seans barını eksik verir (TKFEN 12 Eki 2026 vakası):
        // grafik ve dönem getirileri 1-2 gün geride kalır. Snapshot (FVT /
        // İş Yatırım) daha yeni bir kapanış taşıyorsa seriye ekle ki grafik,
        // sparkline ve 1 HAFTA/1 AY aynı son fiyattan hesaplansın.
        let series: HistoricalSeries = hist;
        const lastBar = hist.closes.at(-1);
        const snapMs = found?.asOf ? Date.parse(found.asOf) : NaN;
        const dayTR = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
        if (found && Number.isFinite(snapMs) && lastBar && dayTR(snapMs) > dayTR(lastBar.date) && found.price > 0) {
          series = { ...hist, closes: [...hist.closes, { date: snapMs, close: found.price }] };
        }
        setHistorical(series);
        const r = computePeriodReturns(series.closes);
        // 1 GÜN: başlıkla aynı kaynak (snapshot changePct = dünkü kapanışa göre).
        // Grafikten türetilen değer eksik bar yüzünden 2 günlük değişimi gösterebilir.
        if (found && Number.isFinite(found.changePct) && (found.feedSource === 'fvt' || found.feedSource === 'isyatirim')) {
          r['1g'] = found.changePct;
        }
        setReturns(r);
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
          // BIST: TR saati (UTC+3), seans 10:00 → 10-13 / 14-17 / 18 kovaları. US: NY seansı 09:30 ≈ UTC-4 (EDT) kaba yaklaşım.
          const agg = isUs ? aggregateTo4h(hist1h.bars, { tzOffsetHours: -4, sessionStartHour: 9 }) : aggregateTo4h(hist1h.bars, BIST_4H);
          tf4h = analyzeTimeframe(agg.map((b) => b.close), [5, 8, 13, 21]);
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
    }).catch((e: unknown) => {
      // 13 Eki 2026: Promise.all'dan biri reject olunca (429/ağ hatası) sayfa
      // sonsuz skeleton'da kalıyordu — catch yoktu. Artık yükleme kapanır,
      // elde ne varsa (statik meta) gösterilir.
      if (!alive) return;
      console.warn('[StockDetail] load failed:', e);
      setLoading(false);
      toast.error('Veri alınamadı — kısa süre sonra tekrar dene.');
    });
    return () => {
      alive = false;
    };
  }, [sym]);

  // Teknik analiz — historical varsa hesapla.
  // Hook order'ı stabil tutmak için early return'dan ÖNCE çağırılmalı
  // (aksi halde stock null → null değil arası render'da React #310).
  // Hisse haberleri: sembol akışı geldiyse o, yoksa genel akış filtresi. Hook sırası sabit.
  // Hafta 3: hissenin kendi sinyalleri — aynı kütüphane, kapanmış 1y barları, XU100 rejim bağlamı
  const stockSignals = useMemo<Signal[]>(() => {
    if (!historical || historical.bars.length < 60) return [];
    const bars = closedBarsOnly(historical.bars, isBistOpen()).map((b) => ({
      date: new Date(b.time).toISOString().slice(0, 10), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0,
    }));
    return evaluateSignals(bars, indexRegime?.trend.regime ?? null, 'yahoo 1y');
  }, [historical, indexRegime]);

  const stockRegime = useMemo<RegimeResult | null>(() => {
    if (!historical || historical.closes.length < 60) return null;
    return computeRegime(historical.closes.map((c) => ({ date: new Date(c.date).toISOString().slice(0, 10), close: c.close })), null, 'yahoo 1y');
  }, [historical]);

  const displayNews = useMemo<NewsItem[]>(() => {
    if (symbolNews && symbolNews.length > 0) {
      // Genel akıştan gelen ve sembol akışında olmayan başlıkları da ekle (dedupe başlıkla)
      const seen = new Set(symbolNews.map((n) => n.title.toLowerCase().slice(0, 60)));
      const extra = news.filter((n) => !seen.has(n.title.toLowerCase().slice(0, 60)));
      return [...symbolNews, ...extra];
    }
    return news;
  }, [symbolNews, news]);

  // Grafik olayları — sembol haberlerinden (son 1 yıl), deterministik sınıflandırma
  const chartEvents = useMemo(
    () => buildChartEvents(displayNews, { from: Date.now() - 370 * 86400_000, max: 8 }),
    [displayNews],
  );


  const technicalAnalysis = useMemo(() => {
    if (!historical || historical.bars.length < 25) return null;
    // 13 Eki 2026: BIST seansı açıkken son günlük bar kapanmamış → göstergeden hariç
    // (repaint koruması). US/kripto için dokunulmaz (seans mantığı farklı).
    const todayTR = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const srcBars = !isUs ? closedBarsOnly(historical.bars, isBistOpen(), todayTR) : historical.bars;
    if (srcBars.length < 25) return null;
    const closes = srcBars.map((b) => b.close);
    const bars: OHLC[] = srcBars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
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

  // GUVENILIRLIK: merkezi data quality lib'i kullan — snapshot cross-check + auto-correct.
  // Historical bars'ın son bar tarihini de gonder ki lib "stale historical" durumunu tespit etsin.
  // Ornek: Hafta sonu snapshot Cuma verisi doğru, historical Perşembeye kadar → stale.
  const lastBar = historical?.bars.at(-1);
  const histLast = lastBar?.close;
  // OhlcvBar.time seconds cinsinden (Yahoo standardı) → ms'e cevir.
  const histLastDate = lastBar?.time ? lastBar.time * 1000 : undefined;
  const period1g = returns['1g'];
  const dq = validateStockQuote({
    symbol: stock.symbol,
    price: stock.price,
    changePct: stock.changePct,
    updatedAt: stock.updatedAt ? +new Date(stock.updatedAt) : undefined,
    histLastClose: histLast,
    histLastDate: histLastDate,
    period1G: period1g,
  }, isUs);
  // Telemetriye kaydet (sadece uyari/duzeltme varsa yazilir)
  dqLog('stock-quote', stock.symbol, dq);

  const displayPrice = dq.corrected?.price ?? stock.price;
  // Snapshot changePct (Yahoo prev close bug) ile period 1G (adjusted closes) uyusmuyorsa
  // period'u tercih et. BIMAS gibi hisselerde snapshot yanlış prev close alıp +9% gibi
  // sahte günlük hareket üretiyor; period 1G daima closes[-1] vs closes[-2] hesabıdır.
  let displayChangePct = dq.corrected?.changePct ?? stock.changePct;
  if (
    dq.corrected?.changePct == null &&
    Number.isFinite(period1g) &&
    Number.isFinite(stock.changePct)
  ) {
    const dev = Math.abs(stock.changePct - (period1g as number));
    if (dev > 3) {
      displayChangePct = period1g as number;
    }
  }
  const tone = displayChangePct >= 0 ? 'text-success' : 'text-danger';
  const sign = displayChangePct >= 0 ? '+' : '';

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
          <ShareButton
            title={`${stock.symbol} — ${stock.name} · ${sign}${displayChangePct.toFixed(2)}% | InvestliQ`}
            text={`${stock.name} (${stock.symbol}) fiyat, teknik analiz ve grafik`}
          />
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
              {!isUs && <KatilimBadge indices={katilimMap[sym]} size="md" />}
            </div>
            <p className="mt-1 text-lg text-slate-300">{stock.name}</p>
          </div>
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-3">
              <span className="text-4xl font-bold tabular-nums text-slate-100">
                {isUs
                  ? `$${displayPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                  : formatMoney(displayPrice)}
              </span>
              {sparklineData.length > 1 && (
                <Sparkline
                  data={sparklineData}
                  width={120}
                  height={36}
                  positive={displayChangePct >= 0}
                />
              )}
            </div>
            <div className={cn('mt-1 flex items-center justify-end gap-2 text-lg font-semibold tabular-nums', tone)}>
              <span>{sign}{displayChangePct.toFixed(2)}%</span>
              <ConfidenceBadge dq={dq} compact />
            </div>
            <div className="mt-1 flex justify-end">
              {/* 13 Eki 2026: kaynak · veri anı · gecikme — "şimdi" uydurma yok */}
              <DataFreshness
                source={stock.feedSource ?? (isUs ? 'yahoo' : undefined)}
                asOf={stock.asOf}
                delayMin={stock.delayMin ?? (isUs ? 15 : 15)}
              />
            </div>
          </div>
        </div>

        {/* Period returns */}
        <div className="mt-5">
          <PeriodReturns returns={returns} />
        </div>
      </div>

      {/* Sekmeler — Design 03 katmanlı detay (15 Eki 2026) */}
      <div className="mb-4 flex gap-5 overflow-x-auto border-b border-border text-[13px] [scrollbar-width:none]" role="tablist">
        {([
          ['genel', 'Genel'],
          ['teknik', 'Teknik'],
          ['temel', 'Temel'],
          ['haber', 'Haber & KAP'],
        ] as const).filter(([k]) => !(k === 'temel' && (isUs || bistIndexMeta[sym]))).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              'whitespace-nowrap border-b-2 pb-2 pt-1 transition',
              tab === k ? 'border-accent text-fg' : 'border-transparent text-fg-2 hover:text-fg',
            )}
          >
            {label}{k === 'haber' && displayNews.length > 0 ? <span className="ml-1 text-[11px] text-fg-3">{displayNews.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'genel' && (<>
      {stockRegime && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg">
          <span className={cn('font-medium', stockRegime.trend.regime === 'yükseliş' ? 'text-success' : stockRegime.trend.regime === 'düşüş' ? 'text-danger' : 'text-fg')}>
            {stockRegime.trend.regime === 'yükseliş' ? 'Yükseliş trendi' : stockRegime.trend.regime === 'düşüş' ? 'Düşüş trendi' : 'Yatay seyir'}
          </span>
          {stockRegime.trend.distToSma50Pct != null && (
            <span className="text-fg-2">· SMA50'ye göre <span className={cn('font-mono', stockRegime.trend.distToSma50Pct >= 0 ? 'text-success' : 'text-danger')}>{stockRegime.trend.distToSma50Pct >= 0 ? '+' : ''}{stockRegime.trend.distToSma50Pct.toFixed(1)}%</span></span>
          )}
          {stockRegime.vol.percentile1y != null && (
            <span className="text-fg-2">· {stockRegime.vol.regime === 'yüksek' ? 'yüksek' : stockRegime.vol.regime === 'düşük' ? 'düşük' : 'normal'} oynaklık (%{stockRegime.vol.realized20?.toFixed(0)} yıllık)</span>
          )}
          {indexRegime && indexRegime.bars >= 60 && (
            <span className="text-fg-3">· XU100: {indexRegime.trend.regime}</span>
          )}
          <EvidenceLink title={`Rejim · ${sym}`} rows={[...stockRegime.trend.evidence, ...stockRegime.vol.evidence, ...(indexRegime ? [{ label: 'XU100 trend', value: indexRegime.trend.regime, source: 'bars_daily' }] : [])]} />
          <span className="text-[11px] text-fg-3">· yatırım tavsiyesi değildir</span>
        </div>
      )}
      {historical && historical.bars.length >= 60 && (
        <div className="mb-4 rounded-xl border border-border bg-bg-soft px-4 py-3">
          <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg-3">
            Teknik durum <span className="font-normal normal-case tracking-normal">· tanımlı kurallar · kapanış verisi</span>
            <Link to="/signals" className="ml-auto text-accent normal-case tracking-normal hover:underline">Tüm sinyaller →</Link>
          </div>
          {stockSignals.length === 0 ? (
            <div className="text-[12px] text-fg-2">Bugünkü kapanışta tanımlı kurallardan geçen sinyal yok.</div>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {stockSignals.map((sg, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-[13px] text-fg">
                  <span className={cn('rounded border px-1 text-[10px] font-semibold', sg.direction === 'yukarı' ? 'border-success/40 bg-success/10 text-success' : sg.direction === 'aşağı' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-warning/40 bg-warning/10 text-warning')}>
                    {sg.direction === 'yukarı' ? '▲' : sg.direction === 'aşağı' ? '▼' : '!'}
                  </span>
                  {sg.title}
                  <span className="inline-flex gap-0.5" title={`Güç ${sg.strength}/3`}>{[1, 2, 3].map((k) => <span key={k} className={cn('h-1.5 w-1.5 rounded-sm', k <= sg.strength ? 'bg-accent' : 'bg-bg-card')} />)}</span>
                  {sg.regimeFit !== 'nötr' && <span className={cn('text-[10px]', sg.regimeFit === 'uyumlu' ? 'text-fg-3' : 'text-warning')}>{sg.regimeFit === 'uyumlu' ? 'rejime uyumlu' : 'rejime karşı'}</span>}
                  <EvidenceLink title={sg.title} rows={sg.evidence} />
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chart — Panel Hero stilinde emerald/red area chart. Kullanici talebi
          11 Eyl 2026: ana sayfayla tutarli gorsel, TradingView agir chart yerine
          hafif SVG. Detay isteyen "TradingView'de aç" ile external gider. */}
      <div className="card mb-4 overflow-hidden p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Canlı Grafik</h2>
          <a
            href={`https://tr.tradingview.com/chart/?symbol=${isUs ? sym : `BIST:${sym}`}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-slate-500 hover:text-accent"
          >
            TradingView'de aç ↗
          </a>
        </div>
        <PanelStyleChart symbol={sym} isBist={!isUs} defaultPeriod="1Y" events={chartEvents} dailyPositive={displayChangePct >= 0} />
        {chartEvents.length > 0 && (
          <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-2" aria-label="Grafik olayları">
            {chartEvents.map((e) => (
              <li key={e.n} className="inline-flex max-w-full items-center gap-1.5">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-accent text-[9px] font-bold text-accent">{e.n}</span>
                <span className={cn('font-medium', e.kind === 'kritik' ? 'text-danger' : 'text-fg')}>{e.label}</span>
                <span className="text-fg-3">{new Date(e.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer" className="truncate hover:text-accent" title={e.title}>{e.title}</a>
                ) : (
                  <span className="truncate" title={e.title}>{e.title}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Kompakt ozet — chart altinda tek tek accordion yerine, hepsi bir satirda gozet
          Kartlar: RSI+MACD birlesik + EMA yon | Destek+Direnc birlesik | Bugunku yorum */}
      {technicalAnalysis && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {/* Sol: RSI + MACD + EMA yon */}
          <div className="rounded-xl border border-border bg-bg-soft/50 p-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              RSI · MACD · EMA
            </div>
            <div className="flex items-baseline gap-3">
              <span className={cn(
                'text-2xl font-bold tabular-nums',
                (technicalAnalysis.rsi ?? 0) >= 70 ? 'text-warning' :
                (technicalAnalysis.rsi ?? 0) <= 30 ? 'text-success' : 'text-slate-100',
              )}>
                RSI {technicalAnalysis.rsi != null ? technicalAnalysis.rsi.toFixed(1) : '—'}
              </span>
              <span className="text-xs text-slate-400">· {technicalAnalysis.rsiNote}</span>
            </div>
            <div className="mt-2 text-xs text-slate-300">
              MACD:{' '}
              {technicalAnalysis.macdBullish ? <span className="text-success font-semibold">Bullish ✓</span>
                : technicalAnalysis.macdBearish ? <span className="text-danger font-semibold">Bearish ✗</span>
                : <span className="text-slate-400">Nötr</span>}
              {' · '}EMA:{' '}
              <span className={cn(
                'font-semibold',
                (technicalAnalysis.emas[0]?.abovePct ?? 0) >= 0 ? 'text-success' : 'text-danger',
              )}>
                {(technicalAnalysis.emas[0]?.abovePct ?? 0) >= 0 ? 'Yukarı ↑' : 'Aşağı ↓'}
              </span>
            </div>
          </div>
          {/* Sag: Destek/Direnc birlesik */}
          <div className="rounded-xl border border-border bg-bg-soft/50 p-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              Destek / Direnç
            </div>
            <div className="flex items-baseline gap-2 text-lg font-bold tabular-nums">
              <span className="text-success">
                {isUs ? `$${technicalAnalysis.support.toFixed(2)}` : `${technicalAnalysis.support.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}₺`}
              </span>
              <span className="text-slate-500 text-xs">—</span>
              <span className="text-danger">
                {isUs ? `$${technicalAnalysis.resistance.toFixed(2)}` : `${technicalAnalysis.resistance.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}₺`}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              %{(((technicalAnalysis.cur - technicalAnalysis.support) / technicalAnalysis.cur) * 100).toFixed(1)} alt · %{(((technicalAnalysis.resistance - technicalAnalysis.cur) / technicalAnalysis.cur) * 100).toFixed(1)} üst uzakta
            </div>
          </div>
        </div>
      )}

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

      </>)}

      {tab === 'teknik' && (<>
      {/* Teknik Analiz — accordion, kompakt UX: kullanici isterse acar */}
      {technicalAnalysis && (
        <PinnableAccordion
          id={`ta-${stock.symbol}`}
          title="Teknik Analiz Detayı"
          defaultOpen
          description={`RSI · MACD · Bollinger · ADX · EMA (${historical?.bars.length ?? 0} günlük veri)`}
          icon={<Activity size={14} />}
          iconColorClass="bg-accent/15 text-accent"
        >
          <div className="p-1">

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
        </PinnableAccordion>
      )}

      </>)}

      {tab === 'temel' && (<>
      {/* Şirket Finansalları — sadece BIST hisseleri için (US/endeks hariç) */}
      {!isUs && !bistIndexMeta[sym] && (
        <div className="mb-4">
          <FinancialStatementsCard symbol={sym} />
        </div>
      )}

      </>)}

      {tab === 'haber' && (<>
      <div className="grid gap-4 lg:grid-cols-3">
        {/* News mentioning this symbol */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Newspaper size={14} /> Bu Sembolü İçeren Gelişmeler ({displayNews.length})
            {symbolNews && symbolNews.length > 0 && (
              <span className="ml-1 rounded border border-border bg-bg-soft px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-slate-500" title="Google News arşivi (son 3 hafta) — şirket adı + sembol + KAP">
                Google News · 3 hafta
              </span>
            )}
          </h2>
          {displayNews.length === 0 ? (
            <div className="card p-6 text-center text-xs text-slate-500">
              {loading ? 'Yükleniyor…' : `${sym} hakkında haber bulunamadı.`}
            </div>
          ) : (
            <div className="space-y-3">
              {displayNews.slice(0, 12).map((n) => (
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
      </>)}
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
