import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, RefreshCw, ChevronRight, Lock, Sparkles, Star, Zap, ArrowUpDown } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { fetchIndexYahoo, fetchHistoricalYahoo } from '@/data/api/yahoo';
import { analyzeTimeframe, aggregateTo4h, computeBigPlayerLean, buildVerdict, type MultiTimeframeResult, type TimeframeAnalysis } from '@/lib/multiTimeframe';
import { ema, type OHLC } from '@/lib/indicators';
import { US_STOCKS } from '@/data/usStocks';
import { useAuth, isPro } from '@/store/auth';
import { useWatchlist } from '@/store/watchlist';
import { RecPoolStats, type PoolStatBoxData } from '@/components/domain/RecPoolStats';
import { cn } from '@/lib/utils';

type UsSortBy = 'score' | 'change' | 'alpha';
type UsFilter = 'all' | 'longonly' | 'nyse' | 'nasdaq';

const INDICES: { ySym: string; label: string }[] = [
  { ySym: '^GSPC', label: 'S&P 500' },
  { ySym: '^DJI',  label: 'Dow Jones' },
  { ySym: '^IXIC', label: 'NASDAQ' },
  { ySym: '^RUT',  label: 'Russell 2000' },
];

interface UsStockRec {
  sym: string;
  name: string;
  sector: string;
  exchange: 'NYSE' | 'NASDAQ';
  price: number;
  changePct: number;
  trend1h: TimeframeAnalysis | null;
  trend4h: TimeframeAnalysis | null;
  trend1d: TimeframeAnalysis | null;
  emas?: { period: number; value: number }[];
  longScore: number; // sıralama için
}

export function UsMarketsPage() {
  const user = useAuth((s) => s.user);
  const proUser = isPro(user);

  const [indexResults, setIndexResults] = useState<MultiTimeframeResult[]>([]);
  const [stockRecs, setStockRecs] = useState<UsStockRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();

  // Sıralama + filtre + arama state
  const [sortBy, setSortBy] = useState<UsSortBy>('score');
  const [filter, setFilter] = useState<UsFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const watchlistHas = useWatchlist((s) => s.has);
  const toggleWatch = useWatchlist((s) => s.toggle);

  // Sıralanmış + filtrelenmiş liste
  const visibleStocks = useMemo(() => {
    let list = [...stockRecs];
    // Filter
    if (filter === 'longonly') list = list.filter((s) => (s.trend1h?.trend === 'long' || s.trend4h?.trend === 'long' || s.trend1d?.trend === 'long'));
    else if (filter === 'nyse') list = list.filter((s) => s.exchange === 'NYSE');
    else if (filter === 'nasdaq') list = list.filter((s) => s.exchange === 'NASDAQ');
    // Search
    const q = searchQuery.trim().toUpperCase();
    if (q.length > 0) {
      list = list.filter((s) => s.sym.toUpperCase().includes(q) || s.name.toUpperCase().includes(q));
    }
    // Sort
    if (sortBy === 'score') list.sort((a, b) => b.longScore - a.longScore);
    else if (sortBy === 'change') list.sort((a, b) => b.changePct - a.changePct);
    else if (sortBy === 'alpha') list.sort((a, b) => a.sym.localeCompare(b.sym));
    return list;
  }, [stockRecs, sortBy, filter, searchQuery]);

  const refresh = async () => {
    setLoading(true);
    try {
      // Endeksler
      const indexPromises = INDICES.map(async ({ ySym, label }) => {
        const [spot, hist1h, hist1d] = await Promise.all([
          fetchIndexYahoo(ySym),
          fetchHistoricalYahoo(ySym, '1mo', '60m'),
          fetchHistoricalYahoo(ySym, '1y', '1d'),
        ]);
        const price = spot?.value ?? hist1d?.bars.at(-1)?.close ?? 0;
        const changePct = spot?.changePct ?? 0;
        let tf1h: TimeframeAnalysis | null = null;
        let tf4h: TimeframeAnalysis | null = null;
        let tf1d: TimeframeAnalysis | null = null;
        let bigPlayerLean: 'alıcı' | 'satıcı' | 'kararsız' = 'kararsız';
        if (hist1h && hist1h.bars.length > 0) {
          tf1h = analyzeTimeframe(hist1h.bars.map((b) => b.close), [5, 8, 13, 21, 55]);
          tf4h = analyzeTimeframe(aggregateTo4h(hist1h.bars).map((b) => b.close), [5, 8, 13, 21]);
        }
        if (hist1d && hist1d.bars.length > 0) {
          const closes1d = hist1d.bars.map((b) => b.close);
          tf1d = analyzeTimeframe(closes1d, [5, 8, 13, 21, 55, 200]);
          const ohlc: OHLC[] = hist1d.bars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
          bigPlayerLean = computeBigPlayerLean(ohlc);
        }
        const base: Omit<MultiTimeframeResult, 'verdict'> = {
          symbol: ySym, label, price, changePct,
          tf1h, tf4h, tf1d, bigPlayerLean,
        };
        return { ...base, verdict: buildVerdict(base) };
      });
      const indexRes = await Promise.all(indexPromises);
      setIndexResults(indexRes);

      // Hisseler — fiyat ve multi-TF
      const stockPromises = US_STOCKS.map(async ({ symbol: sym, name, sector, exchange }) => {
        const [spot, hist1h, hist1d] = await Promise.all([
          fetchIndexYahoo(sym),
          fetchHistoricalYahoo(sym, '1mo', '60m', { bistSuffix: false }),
          fetchHistoricalYahoo(sym, '6mo', '1d', { bistSuffix: false }),
        ]);
        const price = spot?.value ?? 0;
        const changePct = spot?.changePct ?? 0;
        let tf1h: TimeframeAnalysis | null = null;
        let tf4h: TimeframeAnalysis | null = null;
        let tf1d: TimeframeAnalysis | null = null;
        const emas: { period: number; value: number }[] = [];

        if (hist1h && hist1h.bars.length > 0) {
          tf1h = analyzeTimeframe(hist1h.bars.map((b) => b.close), [5, 8, 13, 21, 55]);
          tf4h = analyzeTimeframe(aggregateTo4h(hist1h.bars).map((b) => b.close), [5, 8, 13, 21]);
        }
        if (hist1d && hist1d.bars.length > 0) {
          const closes1d = hist1d.bars.map((b) => b.close);
          tf1d = analyzeTimeframe(closes1d, [5, 8, 13, 21, 55, 200]);
          [5, 8, 13, 21, 55, 200].forEach((p) => {
            const v = ema(closes1d, p).at(-1);
            if (Number.isFinite(v)) emas.push({ period: p, value: v as number });
          });
        }

        // Long score: 1h+4h+1d long sayısı
        const longCount = [tf1h, tf4h, tf1d].filter((t) => t?.trend === 'long').length;
        const shortCount = [tf1h, tf4h, tf1d].filter((t) => t?.trend === 'short').length;
        const longScore = longCount * 3 - shortCount * 2 + changePct * 0.5;

        return { sym, name, sector, exchange, price, changePct, trend1h: tf1h, trend4h: tf4h, trend1d: tf1d, emas, longScore };
      });
      const stockRes = await Promise.all(stockPromises);
      stockRes.sort((a, b) => b.longScore - a.longScore);
      setStockRecs(stockRes);

      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!proUser) return;
    refresh();
    const id = setInterval(refresh, 3 * 60_000); // 3 dk
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proUser]);

  // PRO gating
  if (!proUser) {
    return (
      <>
        <PageHeader
          title="ABD Borsaları"
          subtitle="S&P 500, Dow, NASDAQ endeksleri + 20 gelecek vaad eden ABD hissesi — 1h/4h/1d trend analizi."
        />
        <div className="glass-card relative overflow-hidden p-8 text-center">
          <div className="pointer-events-none absolute inset-0 opacity-25">
            <div className="grid h-full gap-1.5 p-4 grid-cols-4 blur-sm">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="rounded bg-accent/15" />
              ))}
            </div>
          </div>
          <div className="relative">
            <span className="inline-flex items-center justify-center rounded-full bg-warning/15 p-4 text-warning">
              <Lock size={28} />
            </span>
            <h2 className="mt-4 text-xl font-bold text-slate-100">ABD Borsaları PRO Üyelere Özel</h2>
            <p className="mt-2 max-w-md mx-auto text-sm text-slate-400">
              S&P 500, Dow, NASDAQ endeksleri + 20 gelecek vaad eden ABD hissesi (NVDA, AAPL, MSFT, TSLA, AMD…) — multi-timeframe trend analiziyle birlikte.
            </p>
            <Link
              to="/uyelik"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 shadow-lg shadow-accent/30"
            >
              <Sparkles size={14} /> PRO'ya Yükselt
            </Link>
            <p className="mt-3 text-[11px] text-slate-500">
              PRO ile ek: Global Piyasalar, Heat Map, AI hisse/portföy analizi, reklamsız panel.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="ABD Borsaları"
        subtitle="S&P 500, Dow, NASDAQ endeksleri + 20 gelecek vaad eden ABD hissesi — 1h/4h/1d trend analizi."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading} />
            <button className="btn-secondary" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        }
      />

      {/* Endeksler */}
      <section className="glass-card mb-5 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent">
          <Flag size={14} /> ABD Endeksleri
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {loading && indexResults.length === 0 ? (
            <>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rect" height={200} />)}</>
          ) : (
            indexResults.map((r) => <IndexMtCard key={r.symbol} r={r} />)
          )}
        </div>
      </section>

      {/* Top US Stocks — Akordeon + Pool Stats + Sıralama */}
      <section className="glass-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-warning">
          🚀 Top 20 Gelecek Vaad Eden ABD Hisseleri
        </h2>

        {stockRecs.length > 0 && <RecPoolStats boxes={computeUsStockPoolStats(stockRecs)} />}
        {stockRecs.length > 0 && <UsStockConsensusStrip stocks={stockRecs} />}

        {/* Sort + Filter + Search */}
        {stockRecs.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {/* Sort */}
            <div className="inline-flex rounded-lg border border-border bg-bg-soft p-1">
              <span className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <ArrowUpDown size={10} /> Sıralama
              </span>
              {([
                { v: 'score', l: 'Skor' },
                { v: 'change', l: 'Değişim' },
                { v: 'alpha', l: 'A-Z' },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  className={cn(
                    'rounded-md px-2 py-1 text-xs transition',
                    sortBy === opt.v ? 'bg-accent/20 text-accent' : 'text-slate-400 hover:text-slate-200',
                  )}
                  onClick={() => setSortBy(opt.v)}
                >{opt.l}</button>
              ))}
            </div>

            {/* Filter */}
            <div className="inline-flex rounded-lg border border-border bg-bg-soft p-1">
              {([
                { v: 'all', l: 'Tümü' },
                { v: 'longonly', l: 'Long' },
                { v: 'nyse', l: 'NYSE' },
                { v: 'nasdaq', l: 'NASDAQ' },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs transition',
                    filter === opt.v ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
                  )}
                  onClick={() => setFilter(opt.v)}
                >{opt.l}</button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Sembol/şirket ara (NVDA, Apple...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input text-xs ml-auto w-full sm:w-56"
            />
          </div>
        )}

        {loading && stockRecs.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="rect" height={56} />)}
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleStocks.map((s, i) => (
              <UsStockRowItem
                key={s.sym}
                rec={s}
                rank={i + 1}
                watched={watchlistHas(s.sym)}
                onToggle={() => toggleWatch(s.sym)}
              />
            ))}
            {visibleStocks.length === 0 && (
              <div className="rounded-lg border border-border bg-bg-soft py-6 text-center text-xs text-slate-500">
                Filtreyle eşleşen hisse yok.
              </div>
            )}
          </div>
        )}
      </section>

      <p className="mt-3 text-[11px] text-slate-500">
        Veri kaynağı: Yahoo Finance. Sıralama algoritmiktir, yatırım tavsiyesi değildir.
      </p>
    </>
  );
}

function IndexMtCard({ r }: { r: MultiTimeframeResult }) {
  const changeTone = r.changePct >= 0 ? 'text-success' : 'text-danger';
  const leanColor = r.bigPlayerLean === 'alıcı' ? 'border-success/40 bg-success/10 text-success'
    : r.bigPlayerLean === 'satıcı' ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-slate-500/40 bg-slate-500/10 text-slate-300';
  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-base font-bold text-slate-100">{r.label}</h4>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">
            {r.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </div>
          <div className={cn('text-sm tabular-nums', changeTone)}>
            {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <TimeframeBoxSmall label="1 SAATLİK" ta={r.tf1h} />
        <TimeframeBoxSmall label="4 SAATLİK" ta={r.tf4h} />
        <TimeframeBoxSmall label="GÜNLÜK" ta={r.tf1d} />
      </div>
      <div className={cn('mt-3 rounded border px-3 py-1.5 text-xs', leanColor)}>
        <span className="font-bold uppercase">
          {r.bigPlayerLean === 'alıcı' ? '↑ ALICI BASKIN' : r.bigPlayerLean === 'satıcı' ? '↓ SATICI BASKIN' : '↔ KARARSIZ'}
        </span>
      </div>
    </div>
  );
}

function UsStockCard({ rec, rank }: { rec: UsStockRec; rank: number }) {
  const tone = rec.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = rec.changePct >= 0 ? '+' : '';
  return (
    <Link to={`/stock/${rec.sym}`} className="block rounded-lg border border-border bg-bg-card p-4 transition hover:border-accent/40 hover:-translate-y-0.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-sm font-bold text-accent">
            #{rank}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-accent inline-flex items-center gap-1">
                {rec.sym} <ChevronRight size={12} />
              </span>
              <span className="rounded border border-border bg-bg-soft px-1.5 py-0.5 text-[10px] text-slate-400">
                {rec.sector}
              </span>
              <span className="rounded bg-bg-soft px-1.5 py-0.5 text-[10px] text-slate-400">{rec.exchange}</span>
            </div>
            <p className="mt-0.5 text-sm text-slate-300">{rec.name}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">
            ${rec.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </div>
          <div className={cn('text-sm tabular-nums', tone)}>
            {sign}{rec.changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <TimeframeBoxSmall label="1 SAATLİK" ta={rec.trend1h} />
        <TimeframeBoxSmall label="4 SAATLİK" ta={rec.trend4h} />
        <TimeframeBoxSmall label="GÜNLÜK" ta={rec.trend1d} />
      </div>

      {rec.emas && rec.emas.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">EMA Fiyatları (günlük)</div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {rec.emas.map((e) => {
              const above = rec.price >= e.value;
              return (
                <div key={e.period} className={cn(
                  'rounded border px-2 py-1 text-center',
                  above ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5',
                )}>
                  <div className="text-[9px] text-slate-500">EMA {e.period}</div>
                  <div className={cn('text-xs font-bold tabular-nums', above ? 'text-success' : 'text-danger')}>
                    ${e.value.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Link>
  );
}

function TimeframeBoxSmall({ label, ta }: { label: string; ta: TimeframeAnalysis | null }) {
  if (!ta) {
    return (
      <div className="rounded border border-border bg-bg-soft p-2 text-center">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="mt-1 text-xs font-bold text-slate-500">—</div>
      </div>
    );
  }
  const bg = ta.trend === 'long' ? 'border-success/40 bg-success/10'
    : ta.trend === 'short' ? 'border-danger/40 bg-danger/10'
    : 'border-slate-500/40 bg-slate-500/10';
  const color = ta.trend === 'long' ? 'text-success'
    : ta.trend === 'short' ? 'text-danger'
    : 'text-slate-400';
  const txt = ta.trend === 'long' ? 'LONG ↑'
    : ta.trend === 'short' ? 'SHORT ↓'
    : 'NEUTRAL';
  return (
    <div className={cn('rounded border p-2 text-center', bg)}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-sm font-bold', color)}>{txt}</div>
    </div>
  );
}

/**
 * ABD hisseleri için kompakt akordeon satır. Summary'de özet + expanded UsStockCard.
 */
function UsStockRowItem({ rec, rank, watched, onToggle }: {
  rec: UsStockRec;
  rank: number;
  watched: boolean;
  onToggle: () => void;
}) {
  const tone = rec.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = rec.changePct >= 0 ? '+' : '';
  const longCount = [rec.trend1h, rec.trend4h, rec.trend1d].filter((t) => t?.trend === 'long').length;
  const isLong = longCount >= 2;

  return (
    <details className={cn(
      'group rounded-lg border transition',
      isLong ? 'border-success/40 bg-success/5' : 'border-border bg-bg-soft hover:border-accent/40',
    )}>
      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm select-none [&::-webkit-details-marker]:hidden">
        <span className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-md border font-bold text-xs',
          isLong ? 'border-success/40 bg-success/10 text-success' : 'border-accent/30 bg-accent/10 text-accent',
        )}>
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              to={`/stock/${rec.sym}`}
              className="font-mono font-bold text-slate-100 hover:text-accent"
              onClick={(e) => e.stopPropagation()}
            >
              {rec.sym}
            </Link>
            <span className="rounded border border-border bg-bg-card px-1 py-0.5 text-[9px] text-slate-400">{rec.sector}</span>
            <span className="rounded bg-bg-card px-1 py-0.5 text-[9px] text-slate-400">{rec.exchange}</span>
            {isLong && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                <Zap size={8} />{longCount}/3 Long
              </span>
            )}
            {watched && <Star size={10} className="text-warning" fill="currentColor" />}
          </div>
          <div className="truncate text-[10px] text-slate-500">{rec.name}</div>
        </div>
        <div className="hidden lg:flex items-center gap-1 text-[9px]">
          {(['1h', '4h', '1d'] as const).map((tfKey) => {
            const t = tfKey === '1h' ? rec.trend1h : tfKey === '4h' ? rec.trend4h : rec.trend1d;
            const label = tfKey === '1h' ? '1H' : tfKey === '4h' ? '4H' : '1G';
            if (!t) return <span key={tfKey} className="rounded bg-slate-500/15 px-1 py-0.5 text-slate-500">{label}</span>;
            const cls = t.trend === 'long' ? 'bg-success/15 text-success' : t.trend === 'short' ? 'bg-danger/15 text-danger' : 'bg-slate-500/15 text-slate-400';
            return <span key={tfKey} className={cn('rounded px-1 py-0.5 font-mono', cls)}>{label}</span>;
          })}
        </div>
        <div className="w-24 text-right">
          <div className="text-sm font-bold tabular-nums text-slate-100">${rec.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
          <div className={cn('text-[10px] font-semibold tabular-nums', tone)}>{sign}{rec.changePct.toFixed(2)}%</div>
        </div>
        <ChevronRight size={14} className="shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
      </summary>

      <div className="border-t border-border bg-bg-card">
        <UsStockCard rec={rec} rank={rank} />
        {/* Watchlist toggle */}
        <div className="border-t border-border px-4 py-2">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition',
              watched
                ? 'border-warning/40 bg-warning/10 text-warning'
                : 'border-border bg-bg-soft text-slate-400 hover:border-warning/30 hover:text-warning',
            )}
          >
            <Star size={11} fill={watched ? 'currentColor' : 'none'} />
            {watched ? 'Watchlist\'ten çıkar' : 'Watchlist\'e ekle'}
          </button>
        </div>
      </div>
    </details>
  );
}

/** ABD hisseleri pool stats — toplam, ort değişim, Long/Short, NYSE/NASDAQ, lider. */
function computeUsStockPoolStats(stocks: UsStockRec[]): PoolStatBoxData[] {
  const total = stocks.length;
  if (total === 0) return [];
  const avgChange = stocks.reduce((s, x) => s + x.changePct, 0) / total;
  const longCount = stocks.filter((s) => {
    const c = [s.trend1h, s.trend4h, s.trend1d].filter((t) => t?.trend === 'long').length;
    return c >= 2;
  }).length;
  const positives = stocks.filter((s) => s.changePct > 0).length;
  const positiveRatio = (positives / total) * 100;
  const nyse = stocks.filter((s) => s.exchange === 'NYSE').length;
  const nasdaq = stocks.filter((s) => s.exchange === 'NASDAQ').length;
  const sorted = [...stocks].sort((a, b) => b.changePct - a.changePct);
  const leader = sorted[0];

  return [
    { label: 'Toplam', value: `${total}`, sub: `${nyse} NYSE / ${nasdaq} NASDAQ`, tone: 'slate' },
    { label: 'Multi-TF Long', value: `${longCount}/${total}`, sub: '2+ TF\'de long', tone: 'success' },
    { label: 'Ort. Değişim', value: `${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`, tone: avgChange >= 0 ? 'success' : 'danger' },
    { label: 'Pozitif Oran', value: `%${positiveRatio.toFixed(0)}`, sub: `${positives}/${total}`, tone: 'accent' },
    { label: 'Lider', value: leader?.sym ?? '-', sub: leader ? `${leader.changePct >= 0 ? '+' : ''}${leader.changePct.toFixed(2)}%` : undefined, tone: 'success' },
    { label: 'Borsa Dağılımı', value: nyse > nasdaq ? 'NYSE' : 'NASDAQ', sub: `${Math.max(nyse, nasdaq)} hisse`, tone: 'warning' },
  ];
}

/** En çok yükselen + en çok düşen 3 hisse. */
function UsStockConsensusStrip({ stocks }: { stocks: UsStockRec[] }) {
  if (stocks.length === 0) return null;
  const sorted = [...stocks].sort((a, b) => b.changePct - a.changePct);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();

  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-success">Top 3 Yükselen</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {top3.map((s) => (
            <Link key={s.sym} to={`/stock/${s.sym}`} className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 font-mono font-semibold text-success hover:bg-success/20">
              {s.sym}<span className="text-[10px] opacity-70">{s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-danger">Top 3 Düşen</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {bottom3.map((s) => (
            <Link key={s.sym} to={`/stock/${s.sym}`} className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-0.5 font-mono font-semibold text-danger hover:bg-danger/20">
              {s.sym}<span className="text-[10px] opacity-70">{s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
