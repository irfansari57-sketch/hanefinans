import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, ExternalLink, Search, ChevronRight, Star, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { loadStocks } from '@/data/services';
import { fetchHistoricalYahoo, computePeriodReturns, type PeriodReturns } from '@/data/api/yahoo';
import { MOCK_STOCKS } from '@/data/mock';
import { BIST_UNIQUE } from '@/data/bistAll';
import { useWatchlist } from '@/store/watchlist';
import type { Stock } from '@/data/types';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';

type StockRow = Stock & {
  returns?: PeriodReturns;
  loading?: boolean;
};

type SortKey =
  | 'symbol' | 'price' | 'changePct'
  | 'r1g' | 'r1h' | 'r1a' | 'r3a' | 'r6a' | 'rytd' | 'r1y';

const PERIOD_LABEL: Record<Exclude<SortKey, 'symbol' | 'price'>, string> = {
  changePct: 'Gün %',
  r1g: '1 Gün',
  r1h: '1 Hafta',
  r1a: '1 Ay',
  r3a: '3 Ay',
  r6a: '6 Ay',
  rytd: 'YTD',
  r1y: '1 Yıl',
};

const SORT_OPTIONS: Array<{ key: SortKey; short: string }> = [
  { key: 'symbol',    short: 'Sembol' },
  { key: 'changePct', short: 'Gün' },
  { key: 'r1h',       short: '1H' },
  { key: 'r1a',       short: '1A' },
  { key: 'r3a',       short: '3A' },
  { key: 'r6a',       short: '6A' },
  { key: 'rytd',      short: 'YTD' },
  { key: 'r1y',       short: '1Y' },
];

const STOCK_RETURNS_CACHE_KEY = 'fa.stocks.returns.v1';
const STOCK_RETURNS_TTL_MS = 30 * 60_000;

interface ReturnsCache {
  fetchedAt: number;
  data: Record<string, PeriodReturns>;
}

function readReturnsCache(): Record<string, PeriodReturns> | null {
  try {
    const raw = localStorage.getItem(STOCK_RETURNS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReturnsCache;
    if (Date.now() - parsed.fetchedAt > STOCK_RETURNS_TTL_MS) return null;
    return parsed.data;
  } catch { return null; }
}

function writeReturnsCache(data: Record<string, PeriodReturns>) {
  try {
    localStorage.setItem(STOCK_RETURNS_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data }));
  } catch { /* ignore */ }
}

// Module-level state cache — sayfa kapatılıp açıldığında verinin anında render olması için.
// FundsPage'in `tefasGithub.ts` modülünde tuttuğu cache ile aynı pattern.
// Stale-while-revalidate: cache'den anında render et, arka planda fresh fetch çalışsın.
const STOCKS_MEMO_TTL_MS = 5 * 60_000;
interface StocksMemo {
  fetchedAt: number;
  stocks: StockRow[];
  updatedAt: number;
}
let stocksMemo: StocksMemo | null = null;

export function StocksPage() {
  const watchedSymbolsList = useWatchlist((s) => s.symbols);
  const toggleWatchlist = useWatchlist((s) => s.toggle);
  const watchedSymbols = useMemo(() => new Set(watchedSymbolsList), [watchedSymbolsList]);

  // Module-level memo varsa direkt onunla başla — sayfa açılışında instant render
  const [stocks, setStocks] = useState<StockRow[]>(() => stocksMemo?.stocks ?? []);
  const [returnsMap, setReturnsMap] = useState<Record<string, PeriodReturns>>(
    () => readReturnsCache() ?? {},
  );
  const [loading, setLoading] = useState(() => !stocksMemo);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(() => stocksMemo?.updatedAt);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('changePct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [tab, setTab] = useState<'all' | 'watched'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  const refresh = async (forceReturns = false) => {
    setLoading(true);
    try {
      const richMap = new Map(MOCK_STOCKS.map((s) => [s.symbol, s]));
      const universe: { symbol: string; name: string; sector: string }[] = [];
      const seen = new Set<string>();
      for (const s of MOCK_STOCKS) {
        if (seen.has(s.symbol)) continue;
        seen.add(s.symbol);
        universe.push({ symbol: s.symbol, name: s.name, sector: s.sector ?? '' });
      }
      for (const s of BIST_UNIQUE) {
        if (seen.has(s.symbol)) continue;
        seen.add(s.symbol);
        universe.push({ symbol: s.symbol, name: s.name, sector: s.sector });
      }
      const all = universe.map((s) => s.symbol);

      const placeholderStocks: Stock[] = universe.map((u) => {
        const rich = richMap.get(u.symbol);
        return {
          symbol: u.symbol,
          name: rich?.name ?? u.name,
          sector: rich?.sector ?? u.sector,
          price: rich?.price ?? 0,
          changePct: 0,
          updatedAt: new Date().toISOString(),
        };
      });
      setStocks(placeholderStocks);

      const BATCH_SIZE = 50;
      const BATCH_DELAY_MS = 1500;
      const liveStocks: Stock[] = [];
      for (let i = 0; i < all.length; i += BATCH_SIZE) {
        const batch = all.slice(i, i + BATCH_SIZE);
        const { data } = await loadStocks(batch);
        liveStocks.push(...data);
        const liveMap = new Map(liveStocks.map((s) => [s.symbol, s]));
        const merged = placeholderStocks.map((p) => liveMap.get(p.symbol) ?? p);
        setStocks(merged);
        if (i + BATCH_SIZE < all.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }
      setUpdatedAt(Date.now());

      const cached = forceReturns ? null : readReturnsCache();
      if (cached) {
        setReturnsMap(cached);
        return;
      }
      setReturnsLoading(true);
      const newReturns: Record<string, PeriodReturns> = {};
      // Top 200 mover — warmer'ın ısıttığı kapsamla aynı
      // (warmer cache hit'inde Yahoo'ya gitmeden D1'den anında dönecek)
      const topMovers = [...liveStocks]
        .filter((s) => s.price > 0)
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
        .slice(0, 200)
        .map((s) => s.symbol);
      // Daha agresif paralelleştirme — D1 cache'den geliyorsa hızlı, gitmiyorsa
      // SWR ile arka planda yenilenir; ön yüze stale-D1 anında döner.
      const RETURNS_BATCH = 15;
      const RETURNS_BATCH_DELAY_MS = 600;
      for (let i = 0; i < topMovers.length; i += RETURNS_BATCH) {
        const batch = topMovers.slice(i, i + RETURNS_BATCH);
        await Promise.all(
          batch.map(async (sym) => {
            const hist = await fetchHistoricalYahoo(sym, '1y', '1d');
            if (hist) newReturns[sym] = computePeriodReturns(hist.closes);
          }),
        );
        setReturnsMap({ ...newReturns });
        if (i + RETURNS_BATCH < topMovers.length) {
          await new Promise((r) => setTimeout(r, RETURNS_BATCH_DELAY_MS));
        }
      }
      writeReturnsCache(newReturns);
    } finally {
      setLoading(false);
      setReturnsLoading(false);
    }
  };

  // Module-level memo'yu state ile senkron tut — sayfa kapatılıp açıldığında initial state olarak kullanılacak
  useEffect(() => {
    if (stocks.length === 0) return;
    stocksMemo = {
      fetchedAt: Date.now(),
      stocks,
      updatedAt: updatedAt ?? Date.now(),
    };
  }, [stocks, updatedAt]);

  useEffect(() => {
    // Module cache fresh (< 5dk) ise refresh atlama — anında render, arka planda da yenileme yok
    // Stale ise arka planda yenile (loading göstermeden, kullanıcıya cache'i yansıt)
    const memoAge = stocksMemo ? Date.now() - stocksMemo.fetchedAt : Infinity;
    if (memoAge < STOCKS_MEMO_TTL_MS) {
      // Fresh — refresh hiç yapma
      setLoading(false);
      return;
    }
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleWatch = (symbol: string) => {
    toggleWatchlist(symbol);
  };

  const rows: StockRow[] = useMemo(() => {
    const base = tab === 'watched'
      ? stocks.filter((s) => watchedSymbols.has(s.symbol))
      : stocks;
    return base.map((s) => ({ ...s, returns: returnsMap[s.symbol] }));
  }, [stocks, returnsMap, tab, watchedSymbols]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      if (q) {
        const blob = `${s.symbol} ${s.name}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortKey) {
        case 'symbol':    va = a.symbol; vb = b.symbol; break;
        case 'price':     va = a.price; vb = b.price; break;
        case 'changePct': va = a.changePct; vb = b.changePct; break;
        case 'r1g':       va = a.returns?.['1g'] ?? -Infinity; vb = b.returns?.['1g'] ?? -Infinity; break;
        case 'r1h':       va = a.returns?.['1h'] ?? -Infinity; vb = b.returns?.['1h'] ?? -Infinity; break;
        case 'r1a':       va = a.returns?.['1a'] ?? -Infinity; vb = b.returns?.['1a'] ?? -Infinity; break;
        case 'r3a':       va = a.returns?.['3a'] ?? -Infinity; vb = b.returns?.['3a'] ?? -Infinity; break;
        case 'r6a':       va = a.returns?.['6a'] ?? -Infinity; vb = b.returns?.['6a'] ?? -Infinity; break;
        case 'rytd':      va = a.returns?.['1y'] ?? -Infinity; vb = b.returns?.['1y'] ?? -Infinity; break;
        case 'r1y':       va = a.returns?.['1y'] ?? -Infinity; vb = b.returns?.['1y'] ?? -Infinity; break;
      }
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage],
  );
  useEffect(() => {
    setCurrentPage(1);
  }, [search, tab, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'symbol' ? 'asc' : 'desc');
    }
  };

  return (
    <>
      <SeoHead title="BIST Hisseleri" description="BIST tüm hisseleri canlı fiyat, günlük değişim ve dönem getirileri. Akordeon satır görünümü." path="/stocks" />

      <PageHeader
        title="Hisseler"
        subtitle="BIST hisselerinin gün/hafta/ay/3ay/6ay/yıl getirileri — canlı Yahoo Finance verisi."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading || returnsLoading} />
            <button className="btn-secondary" onClick={() => refresh(true)} disabled={loading || returnsLoading}>
              <RefreshCw size={14} className={loading || returnsLoading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-bg-soft p-1">
          <button
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition',
              tab === 'all' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
            )}
            onClick={() => setTab('all')}
          >
            Tüm Hisseler ({stocks.length})
          </button>
          <button
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition',
              tab === 'watched' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
            )}
            onClick={() => setTab('watched')}
          >
            Takipte ({watchedSymbols.size})
          </button>
        </div>

        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-8 w-56"
            placeholder="Sembol veya isim…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Sıralama: dönem butonları + asc/desc */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Sırala:</span>
        {SORT_OPTIONS.map((opt) => {
          const active = sortKey === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSort(opt.key)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition',
                active
                  ? 'border-accent/40 bg-accent/15 text-accent'
                  : 'border-border bg-bg-soft text-slate-400 hover:text-slate-200',
              )}
            >
              {opt.short}
              {active && <span className="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
            </button>
          );
        })}
      </div>

      {returnsLoading && (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-slate-400">
          Getiriler Yahoo Finance'tan çekiliyor (~30 sn) — sonuçlar 30 dk cache'lenir.
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={28} />}
          title={tab === 'watched' ? 'Takipte hisse yok' : 'Filtreyle eşleşme yok'}
          description={tab === 'watched' ? 'Bir hisseye yıldız basarak takibe ekle.' : undefined}
        />
      ) : (
        <>
          <div className="mb-3">
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={sorted.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
          <div className="space-y-1.5">
            {paginated.map((s, i) => {
              const isWatched = watchedSymbols.has(s.symbol);
              const globalIndex = (safePage - 1) * PAGE_SIZE + i + 1;
              return (
                <WatchedStockRow
                  key={s.symbol}
                  stock={s}
                  rank={globalIndex}
                  sortKey={sortKey}
                  isWatched={isWatched}
                  onToggle={() => toggleWatch(s.symbol)}
                />
              );
            })}
          </div>
          <div className="mt-3">
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={sorted.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </>
      )}

      <p className="mt-3 text-[11px] text-slate-500">
        Toplam {sorted.length} hisse. Fiyat ve günlük değişim 60 sn cache, dönemsel getiriler 30 dk cache (Yahoo Finance).
      </p>
    </>
  );
}

interface WatchedStockRowProps {
  stock: StockRow;
  rank: number;
  sortKey: SortKey;
  isWatched: boolean;
  onToggle: () => void;
}

/**
 * Hisse akordeon satırı — Fonlar sayfasındaki WatchedFundRow tarzı.
 * Summary: sıra rozeti · sembol · sektör chip · ad · 3 mini chip · büyük perf
 * Açılınca: 7 dönem mini grid + Grafik/Fintables butonları + Takipten çıkar.
 */
function WatchedStockRow({ stock, rank, sortKey, isWatched, onToggle }: WatchedStockRowProps) {
  // Active period için kullanılacak değer
  const getValue = (k: SortKey): number | undefined => {
    switch (k) {
      case 'changePct': return stock.changePct;
      case 'r1g': return stock.returns?.['1g'];
      case 'r1h': return stock.returns?.['1h'];
      case 'r1a': return stock.returns?.['1a'];
      case 'r3a': return stock.returns?.['3a'];
      case 'r6a': return stock.returns?.['6a'];
      case 'rytd': return stock.returns?.['1y'];
      case 'r1y': return stock.returns?.['1y'];
      default: return undefined;
    }
  };

  const activeKey: Exclude<SortKey, 'symbol' | 'price'> = sortKey === 'symbol' || sortKey === 'price' ? 'changePct' : sortKey;
  const activeLabel = PERIOD_LABEL[activeKey];
  const activeValue = getValue(activeKey);
  const activeValid = activeValue != null && Number.isFinite(activeValue);
  const activeTone = !activeValid ? 'text-slate-500' : (activeValue as number) >= 0 ? 'text-success' : 'text-danger';
  const isLong = activeValid && (activeValue as number) > 0;

  // 3 mini chip — activeKey hariç en alakalı 3 dönem
  const microKeys: Array<Exclude<SortKey, 'symbol' | 'price'>> = (['changePct', 'r1h', 'r1a', 'r1y'] as const)
    .filter((k) => k !== activeKey)
    .slice(0, 3);

  return (
    <details className={cn(
      'group rounded-lg border transition',
      isLong ? 'border-success/40 bg-success/5' : 'border-border bg-bg-soft hover:border-accent/40',
    )}>
      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm select-none [&::-webkit-details-marker]:hidden">
        <span className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-md border font-bold text-xs',
          isLong ? 'border-success/40 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning',
        )}>
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              to={`/stock/${stock.symbol}`}
              className="font-mono font-bold text-slate-100 hover:text-accent"
              onClick={(e) => e.stopPropagation()}
            >
              {stock.symbol}
            </Link>
            {isWatched && <Star size={10} className="text-warning" fill="currentColor" />}
            {stock.sector && stock.sector !== 'Diğer' && (
              <span className="rounded border border-border bg-bg-card px-1 py-0.5 text-[9px] text-slate-400">
                {stock.sector}
              </span>
            )}
            {stock.price > 0 && (
              <span className="font-mono text-[10px] tabular-nums text-slate-300">
                ₺{stock.price.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
          {stock.name && stock.name !== stock.symbol && (
            <div className="truncate text-[10px] text-slate-500">{stock.name}</div>
          )}
        </div>
        <div className="hidden md:flex items-center gap-1 text-[9px]">
          {microKeys.map((k) => (
            <PerfMicro key={k} label={shortLabel(k)} value={getValue(k)} />
          ))}
        </div>
        <div className="w-24 text-right">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">{activeLabel}</div>
          {activeValid ? (
            <div className={cn('text-sm font-bold tabular-nums', activeTone)}>
              {(activeValue as number) >= 0 ? '+' : ''}{(activeValue as number).toFixed(2)}%
            </div>
          ) : (
            <div className="text-sm font-bold tabular-nums text-slate-600">—</div>
          )}
        </div>
        <ChevronRight size={14} className="shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
      </summary>

      <div className="border-t border-border bg-bg-card p-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <PerfMini label="Gün"     value={stock.changePct} />
          <PerfMini label="1 Gün"   value={stock.returns?.['1g']} />
          <PerfMini label="1 Hafta" value={stock.returns?.['1h']} />
          <PerfMini label="1 Ay"    value={stock.returns?.['1a']} />
          <PerfMini label="3 Ay"    value={stock.returns?.['3a']} />
          <PerfMini label="6 Ay"    value={stock.returns?.['6a']} />
          <PerfMini label="1 Yıl"   value={stock.returns?.['1y']} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`/stock/${stock.symbol}`} className="btn-primary">
            Detay <ChevronRight size={14} />
          </Link>
          <a
            href={`https://fintables.com/sirketler/${stock.symbol}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20"
          >
            Fintables <ExternalLink size={11} />
          </a>
          <a
            href={`https://finance.yahoo.com/quote/${stock.symbol}.IS`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
          >
            Yahoo <ExternalLink size={11} />
          </a>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition',
              isWatched
                ? 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20'
                : 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/20',
            )}
            title={isWatched ? 'Takipten çıkar' : 'Takibe al'}
          >
            <Star size={11} fill={isWatched ? 'currentColor' : 'none'} />
            {isWatched ? 'Takipten çıkar' : 'Takibe al'}
          </button>
        </div>
      </div>
    </details>
  );
}

function shortLabel(k: Exclude<SortKey, 'symbol' | 'price'>): string {
  switch (k) {
    case 'changePct': return 'Gün';
    case 'r1g': return '1G';
    case 'r1h': return '1H';
    case 'r1a': return '1A';
    case 'r3a': return '3A';
    case 'r6a': return '6A';
    case 'rytd': return 'YTD';
    case 'r1y': return '1Y';
  }
}

function PerfMicro({ label, value }: { label: string; value: number | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="rounded bg-bg-card px-1 py-0.5 text-slate-500">{label} —</span>;
  }
  const tone = value >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger';
  return (
    <span className={cn('rounded px-1 py-0.5 font-mono tabular-nums', tone)}>
      {label} {value >= 0 ? '+' : ''}{value.toFixed(1)}
    </span>
  );
}

function PerfMini({ label, value }: { label: string; value: number | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <div className="rounded bg-bg-soft px-2 py-1.5">
        <div className="text-[10px] text-slate-500">{label}</div>
        <div className="tabular-nums text-slate-600">—</div>
      </div>
    );
  }
  const tone = value >= 0 ? 'text-success' : 'text-danger';
  return (
    <div className="rounded bg-bg-soft px-2 py-1.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={cn('text-sm font-medium tabular-nums', tone)}>
        {value >= 0 ? '+' : ''}{value.toFixed(2)}%
      </div>
    </div>
  );
}
