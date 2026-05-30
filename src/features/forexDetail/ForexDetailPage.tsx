import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Coins, RefreshCw, Activity, ExternalLink } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { LiveBadge } from '@/components/domain/LiveBadge';
import {
  fetchHistoricalYahoo, fetchIndexYahoo, computePeriodReturns,
  type HistoricalSeries, type PeriodReturns as PeriodReturnsT,
} from '@/data/api/yahoo';
import {
  rsi, macd, bollinger, adx, ema, sma, rsiSignal, bollingerLabel, adxLabel, supportResistance, type OHLC,
} from '@/lib/indicators';
import {
  analyzeTimeframe, aggregateTo4h, computeBigPlayerLean, buildVerdict,
  type MultiTimeframeResult, type TimeframeAnalysis,
} from '@/lib/multiTimeframe';
import { MultiTimeframeCard } from '@/components/domain/MultiTimeframeCard';
import { PeriodReturns } from '@/components/domain/PeriodReturns';
import { findForex } from '@/data/forexSymbols';
import { cn } from '@/lib/utils';

const LiveChart = lazy(() => import('@/components/domain/LiveChart').then((m) => ({ default: m.LiveChart })));

export function ForexDetailPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const sym = symbol.toUpperCase();
  const meta = findForex(sym);

  const [spot, setSpot] = useState<{ value: number; changePct: number } | null>(null);
  const [historical, setHistorical] = useState<HistoricalSeries | null>(null);
  const [returns, setReturns] = useState<PeriodReturnsT>({});
  const [mtResult, setMtResult] = useState<MultiTimeframeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();

  const refresh = async () => {
    if (!meta) return;
    setLoading(true);
    try {
      const [spotR, hist1d, hist1h] = await Promise.all([
        fetchIndexYahoo(meta.yahoo),
        fetchHistoricalYahoo(meta.yahoo, '1y', '1d', { bistSuffix: false }),
        fetchHistoricalYahoo(meta.yahoo, '1mo', '60m', { bistSuffix: false }),
      ]);
      setSpot(spotR);
      if (hist1d) {
        setHistorical(hist1d);
        setReturns(computePeriodReturns(hist1d.closes));
      }

      // Multi-timeframe
      if (hist1d || hist1h) {
        const price = spotR?.value ?? hist1d?.bars.at(-1)?.close ?? 0;
        const changePct = spotR?.changePct ?? 0;
        let tf1h: TimeframeAnalysis | null = null;
        let tf4h: TimeframeAnalysis | null = null;
        let tf1d: TimeframeAnalysis | null = null;
        let lean: 'alıcı' | 'satıcı' | 'kararsız' = 'kararsız';
        if (hist1h && hist1h.bars.length > 0) {
          tf1h = analyzeTimeframe(hist1h.bars.map((b) => b.close), [5, 8, 13, 21, 55]);
          tf4h = analyzeTimeframe(aggregateTo4h(hist1h.bars).map((b) => b.close), [5, 8, 13, 21]);
        }
        if (hist1d && hist1d.bars.length > 0) {
          const closes1d = hist1d.bars.map((b) => b.close);
          tf1d = analyzeTimeframe(closes1d, [5, 8, 13, 21, 55, 200]);
          const ohlc: OHLC[] = hist1d.bars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
          lean = computeBigPlayerLean(ohlc);
        }
        const base: Omit<MultiTimeframeResult, 'verdict'> = {
          symbol: meta.symbol, label: meta.label, price, changePct, tf1h, tf4h, tf1d, bigPlayerLean: lean,
        };
        setMtResult({ ...base, verdict: buildVerdict(base) });
      }

      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym]);

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

  if (!meta) {
    return (
      <>
        <button onClick={() => navigate(-1)} className="btn-ghost mb-3">
          <ArrowLeft size={14} /> Geri
        </button>
        <EmptyState
          icon={<Coins size={28} />}
          title="Döviz bulunamadı"
          description={`"${sym}" desteklenmiyor. Tam liste için Döviz Kurları sayfasına dön.`}
        />
      </>
    );
  }

  const price = spot?.value ?? 0;
  const change = spot?.changePct ?? 0;
  const tone = change >= 0 ? 'text-success' : 'text-danger';
  const sign = change >= 0 ? '+' : '';
  const fmtPrice = (v: number) =>
    v.toLocaleString('tr-TR', { maximumFractionDigits: v < 10 ? 6 : 4 });

  // TradingView için sembol formatı (FX_IDC: prefix forex çiftleri için)
  const tvSym = meta.symbol === 'DXY' ? 'TVC:DXY' : `FX_IDC:${meta.symbol}`;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="btn-ghost">
          <ArrowLeft size={14} /> Geri
        </button>
        <div className="flex items-center gap-2">
          <LiveBadge updatedAt={updatedAt} refreshing={loading} />
          <button className="btn-secondary" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="card relative mb-4 overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {meta.flag && <span className="text-2xl">{meta.flag}</span>}
              <h1 className="font-mono text-3xl font-bold tracking-tight text-slate-100">{meta.label}</h1>
              <span className="rounded-md border border-border bg-bg-soft px-2 py-0.5 text-xs text-slate-300">
                {meta.group === 'TRY' ? 'TL Paritesi' : meta.group === 'MAJOR' ? 'Major Pair' : 'Endeks'}
              </span>
              <span className="rounded-md bg-bg-soft px-2 py-0.5 text-xs text-slate-400">FOREX</span>
            </div>
            <p className="mt-1 text-sm text-slate-300">{meta.name}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums text-slate-100">{fmtPrice(price)}</div>
            <div className={cn('mt-1 text-lg font-semibold tabular-nums', tone)}>
              {sign}{change.toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="mt-5">
          <PeriodReturns returns={returns} />
        </div>
      </div>

      {/* Live Chart */}
      <div className="card mb-4 overflow-hidden p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          Canlı Grafik <span className="text-slate-500">(Yahoo Finance + lightweight-charts)</span>
        </h2>
        <Suspense fallback={<Skeleton variant="rect" className="w-full" height={460} />}>
          <LiveChart symbol={meta.yahoo} height={460} bistSuffix={false} />
        </Suspense>
      </div>

      {/* Multi-Timeframe */}
      {mtResult && (
        <div className="card mb-4 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Activity size={14} className="text-accent" /> Çoklu Zaman Dilimi Yön Analizi
            <span className="ml-auto text-[10px] text-slate-500">1H / 4H / 1D</span>
          </h2>
          <MultiTimeframeCard r={mtResult} currency="" hideHeader />
        </div>
      )}

      {/* Teknik Analiz */}
      {technicalAnalysis && (
        <div className="card mb-4 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Activity size={14} className="text-accent" /> Teknik Analiz
            <span className="ml-auto text-[10px] text-slate-500">{historical?.bars.length} günlük veri</span>
          </h2>
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
            </div>
            <div className="rounded-lg border border-border bg-bg-soft p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Bollinger</div>
              <div className="mt-1 text-xs font-semibold text-slate-100 leading-tight">{technicalAnalysis.bollingerLabel}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-soft p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">ADX (Trend)</div>
              <div className="mt-1 text-sm font-bold text-slate-100">{technicalAnalysis.adxLabel}</div>
            </div>
          </div>

          <div className="grid gap-2 grid-cols-2 mb-4">
            <div className="rounded-lg border border-success/30 bg-success/5 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-success">Destek</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">
                {fmtPrice(technicalAnalysis.support)}
              </div>
            </div>
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-danger">Direnç</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">
                {fmtPrice(technicalAnalysis.resistance)}
              </div>
            </div>
          </div>

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            EMA Pozisyonları {technicalAnalysis.ma8 != null && (
              <span className="text-accent">• MA8: {fmtPrice(technicalAnalysis.ma8)}</span>
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
                  <div className="text-xs font-bold tabular-nums text-slate-100">{fmtPrice(e.value)}</div>
                  <div className={cn('text-[10px] tabular-nums font-semibold', above ? 'text-success' : 'text-danger')}>
                    {above ? '↑ +' : '↓ '}{e.abovePct.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dış Linkler */}
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Dış Kaynaklar</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <a
            href={`https://finance.yahoo.com/quote/${encodeURIComponent(meta.yahoo)}`}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
          >
            <span>Yahoo Finance</span><ExternalLink size={11} />
          </a>
          <a
            href={`https://www.tradingview.com/symbols/${encodeURIComponent(tvSym)}/`}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
          >
            <span>TradingView</span><ExternalLink size={11} />
          </a>
          <a
            href={`https://www.investing.com/currencies/${meta.symbol.toLowerCase()}`}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
          >
            <span>Investing.com</span><ExternalLink size={11} />
          </a>
        </div>
      </div>
    </>
  );
}
