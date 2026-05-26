import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Gem, ExternalLink, RefreshCw, Activity,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { fetchHistoricalYahoo, fetchIndexYahoo, computePeriodReturns, ouncePriceToGramTRY, type HistoricalSeries, type PeriodReturns as PeriodReturnsT } from '@/data/api/yahoo';
import { loadMacroAll } from '@/data/services';
import { rsi, macd, bollinger, adx, ema, sma, rsiSignal, bollingerLabel, adxLabel, supportResistance, type OHLC } from '@/lib/indicators';
import { analyzeTimeframe, aggregateTo4h, computeBigPlayerLean, buildVerdict, type MultiTimeframeResult, type TimeframeAnalysis } from '@/lib/multiTimeframe';
import { MultiTimeframeCard } from '@/components/domain/MultiTimeframeCard';
import { PeriodReturns } from '@/components/domain/PeriodReturns';
import { PositionSizer } from '@/components/domain/PositionSizer';
import { cn } from '@/lib/utils';

const LiveChart = lazy(() => import('@/components/domain/LiveChart').then((m) => ({ default: m.LiveChart })));

// Yahoo spot XA?USD=X için historical / chart veri yok — futures'a fallback (yön/yapı için yeterli)
const SPOT_TO_FUTURES: Record<string, string> = {
  'XAUUSD=X': 'GC=F',
  'XAGUSD=X': 'SI=F',
  'XPTUSD=X': 'PL=F',
};

const COMMODITY_META: Record<string, { label: string; description: string; unit: string; category: string; precious: boolean }> = {
  // Spot (OTC) — panel ile ayni kaynak
  'XAUUSD=X': { label: 'Altın',  description: 'OTC Spot Altın (XAU/USD)',  unit: '$ / ons', category: 'Kıymetli Maden', precious: true },
  'XAGUSD=X': { label: 'Gümüş',  description: 'OTC Spot Gümüş (XAG/USD)',  unit: '$ / ons', category: 'Kıymetli Maden', precious: true },
  'XPTUSD=X': { label: 'Platin', description: 'OTC Spot Platin (XPT/USD)', unit: '$ / ons', category: 'Kıymetli Maden', precious: true },
  // Futures — eski linkler ic in geriye uyumlu
  'GC=F':  { label: 'Altın',          description: 'COMEX Altın Vadeli',            unit: '$ / ons',     category: 'Kıymetli Maden', precious: true },
  'SI=F':  { label: 'Gümüş',          description: 'COMEX Gümüş Vadeli',            unit: '$ / ons',     category: 'Kıymetli Maden', precious: true },
  'PL=F':  { label: 'Platin',         description: 'NYMEX Platin Vadeli',           unit: '$ / ons',     category: 'Kıymetli Maden', precious: true },
  'PA=F':  { label: 'Paladyum',       description: 'NYMEX Paladyum Vadeli',         unit: '$ / ons',     category: 'Kıymetli Maden', precious: true },
  'BZ=F':  { label: 'Brent Petrol',   description: 'ICE Brent Vadeli',              unit: '$ / varil',   category: 'Enerji',         precious: false },
  'CL=F':  { label: 'WTI Ham Petrol', description: 'NYMEX WTI Vadeli',              unit: '$ / varil',   category: 'Enerji',         precious: false },
  'NG=F':  { label: 'Doğal Gaz',      description: 'Henry Hub Doğal Gaz Vadeli',    unit: '$ / MMBtu',   category: 'Enerji',         precious: false },
  'HG=F':  { label: 'Bakır',          description: 'COMEX Bakır Vadeli',            unit: '$ / lb',      category: 'Endüstri',       precious: false },
  'ZW=F':  { label: 'Buğday',         description: 'CBOT Buğday Vadeli',            unit: '$ / bushel',  category: 'Tarım',          precious: false },
  'ZC=F':  { label: 'Mısır',          description: 'CBOT Mısır Vadeli',             unit: '$ / bushel',  category: 'Tarım',          precious: false },
};

export function CommodityDetailPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ySym = decodeURIComponent(symbol).toUpperCase();
  const meta = COMMODITY_META[ySym];

  const unitParam = searchParams.get('u');
  const initialUnit: 'ons' | 'gram' = unitParam === 'gram' && COMMODITY_META[ySym]?.precious ? 'gram' : 'ons';
  const [unit, setUnit] = useState<'ons' | 'gram'>(initialUnit);

  const setUnitAndUrl = (next: 'ons' | 'gram') => {
    setUnit(next);
    const sp = new URLSearchParams(searchParams);
    if (next === 'gram') sp.set('u', 'gram');
    else sp.delete('u');
    setSearchParams(sp, { replace: true });
  };

  const [spot, setSpot] = useState<{ value: number; changePct: number } | null>(null);
  const [historical, setHistorical] = useState<HistoricalSeries | null>(null);
  const [returns, setReturns] = useState<PeriodReturnsT>({});
  const [mtResult, setMtResult] = useState<MultiTimeframeResult | null>(null);
  const [usdTry, setUsdTry] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();

  // Spot semboller icin backend Stooq endpoint'i kullan (panel ile ayni veri)
  const fetchSpotPrice = async (): Promise<{ value: number; changePct: number } | null> => {
    if (ySym === 'XAUUSD=X' || ySym === 'XAGUSD=X' || ySym === 'XPTUSD=X') {
      try {
        const r = await fetch('/api/spot-metals');
        if (r.ok) {
          const j = (await r.json()) as { ok: boolean; XAU?: { value: number; changePct: number }; XAG?: { value: number; changePct: number }; XPT?: { value: number; changePct: number } };
          if (j.ok) {
            const map: Record<string, { value: number; changePct: number } | undefined> = {
              'XAUUSD=X': j.XAU, 'XAGUSD=X': j.XAG, 'XPTUSD=X': j.XPT,
            };
            const s = map[ySym];
            if (s && Number.isFinite(s.value) && s.value > 0) return s;
          }
        }
      } catch { /* yahoo'ya dus */ }
    }
    return fetchIndexYahoo(ySym);
  };

  const fetchHistoricalWithFallback = async (range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'ytd', interval: '1m' | '5m' | '15m' | '30m' | '60m' | '1d' | '1wk' | '1mo') => {
    const primary = await fetchHistoricalYahoo(ySym, range, interval, { bistSuffix: false });
    if (primary && primary.bars.length > 0) return primary;
    const futSym = SPOT_TO_FUTURES[ySym];
    if (futSym) {
      return fetchHistoricalYahoo(futSym, range, interval, { bistSuffix: false });
    }
    return null;
  };

  const refresh = async () => {
    if (!meta) return;
    setLoading(true);
    try {
      const [spotR, hist1d, hist1h, macroR] = await Promise.all([
        fetchSpotPrice(),
        fetchHistoricalWithFallback('1y', '1d'),
        fetchHistoricalWithFallback('1mo', '60m'),
        loadMacroAll(),
      ]);
      setSpot(spotR);
      if (hist1d) {
        setHistorical(hist1d);
        setReturns(computePeriodReturns(hist1d.closes));
      }
      setUsdTry(macroR.data.find((m) => m.key === 'USD/TRY')?.value ?? null);

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
          symbol: ySym, label: meta.label, price, changePct, tf1h, tf4h, tf1d, bigPlayerLean: lean,
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
  }, [ySym]);

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
        <EmptyState icon={<Gem size={28} />} title="Emtia bulunamadı" description={`"${ySym}" desteklenmiyor.`} />
      </>
    );
  }

  const price = spot?.value ?? 0;
  const change = spot?.changePct ?? 0;
  const tone = change >= 0 ? 'text-success' : 'text-danger';
  const sign = change >= 0 ? '+' : '';
  const gramTRY = meta.precious && usdTry ? ouncePriceToGramTRY(price, usdTry) : null;
  const showGramAsPrimary = meta.precious && unit === 'gram' && gramTRY != null;

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

      <div className="card relative mb-4 overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-warning/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-warning/15 text-warning">
                <Gem size={20} />
              </span>
              <h1 className="font-mono text-2xl font-bold tracking-tight text-slate-100">{meta.label}</h1>
              <span className="rounded-md border border-border bg-bg-soft px-2 py-0.5 text-xs text-slate-300">{meta.category}</span>
              <span className="rounded-md bg-bg-soft px-2 py-0.5 text-xs text-slate-400">{ySym}</span>
            </div>
            <p className="mt-1 text-sm text-slate-300">{meta.description}</p>
          </div>
          <div className="text-right">
            {meta.precious && gramTRY != null && (
              <div className="mb-2 inline-flex rounded-md border border-border bg-bg-soft p-0.5">
                <button
                  type="button"
                  onClick={() => setUnitAndUrl('ons')}
                  className={cn(
                    'rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wider transition',
                    unit === 'ons' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
                  )}
                >
                  Ons USD
                </button>
                <button
                  type="button"
                  onClick={() => setUnitAndUrl('gram')}
                  className={cn(
                    'rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wider transition',
                    unit === 'gram' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
                  )}
                >
                  Gram TL
                </button>
              </div>
            )}
            {showGramAsPrimary ? (
              <>
                <div className="text-3xl font-bold tabular-nums text-slate-100">
                  ₺{gramTRY!.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-500">₺ / gram</div>
                <div className={cn('mt-1 text-lg font-semibold tabular-nums', tone)}>
                  {sign}{change.toFixed(2)}%
                </div>
                <div className="mt-1 text-sm text-accent">
                  ≈ ${price.toLocaleString('en-US', { maximumFractionDigits: 2 })} / ons
                </div>
              </>
            ) : (
              <>
                <div className="text-3xl font-bold tabular-nums text-slate-100">
                  ${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-500">{meta.unit}</div>
                <div className={cn('mt-1 text-lg font-semibold tabular-nums', tone)}>
                  {sign}{change.toFixed(2)}%
                </div>
                {gramTRY != null && (
                  <div className="mt-1 text-sm text-accent">
                    ≈ ₺{gramTRY.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} / gram
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-5">
          <PeriodReturns returns={returns} />
        </div>
      </div>

      <div className="card mb-4 overflow-hidden p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-300">
          Canlı Grafik <span className="text-slate-500">(Yahoo Finance + lightweight-charts)</span>
        </h2>
        {showGramAsPrimary && (
          <p className="mb-3 text-[11px] text-slate-500">
            Grafik <span className="text-accent">₺/gram</span> bazlı (her bar: USD/ons ÷ 31.1035 × USD/TRY).
            {usdTry && <> Anlık USD/TRY: <span className="tabular-nums text-slate-300">{usdTry.toFixed(2)}</span></>}
          </p>
        )}
        <Suspense fallback={<Skeleton variant="rect" className="w-full" height={460} />}>
          <LiveChart
            symbol={SPOT_TO_FUTURES[ySym] ?? ySym}
            height={460}
            priceTransform={
              showGramAsPrimary && usdTry
                ? (p: number) => (p / 31.1035) * usdTry
                : undefined
            }
          />
        </Suspense>
      </div>

      {mtResult && (
        <div className="card mb-4 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Activity size={14} className="text-accent" /> Çoklu Zaman Dilimi Yön Analizi
            <span className="ml-auto text-[10px] text-slate-500">1H / 4H / 1D</span>
          </h2>
          <MultiTimeframeCard r={mtResult} currency="$" hideHeader />
        </div>
      )}

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
                ${technicalAnalysis.support.toFixed(2)}
              </div>
            </div>
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-danger">Direnç</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">
                ${technicalAnalysis.resistance.toFixed(2)}
              </div>
            </div>
          </div>

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            EMA Pozisyonları {technicalAnalysis.ma8 != null && <span className="text-accent">• MA8: ${technicalAnalysis.ma8.toFixed(2)}</span>}
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
                  <div className="text-xs font-bold tabular-nums text-slate-100">${e.value.toFixed(2)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {technicalAnalysis && (
        <div className="mb-4">
          <PositionSizer
            symbol={meta.label}
            currentPrice={price}
            support={technicalAnalysis.support}
            resistance={technicalAnalysis.resistance}
          />
        </div>
      )}

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Dış Kaynaklar</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <a
            href={`https://finance.yahoo.com/quote/${encodeURIComponent(ySym)}`}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
          >
            <span>Yahoo Finance</span><ExternalLink size={11} />
          </a>
          <a
            href={`https://www.tradingview.com/symbols/${encodeURIComponent(ySym.replace('=F', '').replace('=X', ''))}/`}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
          >
            <span>TradingView</span><ExternalLink size={11} />
          </a>
          <a
            href={`https://www.investing.com/search/?q=${encodeURIComponent(meta.label)}`}
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
