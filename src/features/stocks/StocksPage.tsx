import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Search, Star, RefreshCw, ArrowUpDown } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { loadStocks } from '@/data/services';
import { fetchHistoricalYahoo, computePeriodReturns, type PeriodReturns } from '@/data/api/yahoo';
import { MOCK_STOCKS } from '@/data/mock';
import { BIST_UNIQUE } from '@/data/bistAll';
import { BIST_INDICES, INDEX_TO_SECTORS } from '@/data/bistIndices';
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
  | 'r1h' | 'r1a' | 'r3a' | 'r6a' | 'rytd' | 'r1y';

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

// Module-level memo — sayfa geçişlerinde anında render
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
  const [indexFilter, setIndexFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

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
      const topMovers = [...liveStocks]
        .filter((s) => s.price > 0)
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
        .slice(0, 200)
        .map((s) => s.symbol);
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

  useEffect(() => {
    if (stocks.length === 0) return;
    stocksMemo = {
      fetchedAt: Date.now(),
      stocks,
      updatedAt: updatedAt ?? Date.now(),
    };
  }, [stocks, updatedAt]);

  useEffect(() => {
    const memoAge = stocksMemo ? Date.now() - stocksMemo.fetchedAt : Infinity;
    if (memoAge < STOCKS_MEMO_TTL_MS) {
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
    const sectorAllowList = indexFilter === 'all' ? null : new Set(INDEX_TO_SECTORS.get(indexFilter) ?? []);
    return rows.filter((s) => {
      if (sectorAllowList && !sectorAllowList.has(s.sector ?? '')) return false;
      if (q) {
        const blob = `${s.symbol} ${s.name}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, indexFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortKey) {
        case 'symbol':    va = a.symbol; vb = b.symbol; break;
        case 'price':     va = a.price; vb = b.price; break;
        case 'changePct': va = a.changePct; vb = b.changePct; break;
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
  }, [search, tab, sortKey, sortDir, indexFilter]);

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'symbol' ? 'asc' : 'desc');
    }
  };

  return (
    <>
      <SeoHead title="BIST Hisseleri" description="BIST tüm hisseleri canlı fiyat, günlük değişim ve dönem getirileri. Liste/tablo görünümü." path="/stocks" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-bg-soft p-1">
          <button
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition',
              tab === 'all' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
            )}
            onClick={() => setTab('all')}
          >
            Tüm Hisseler
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

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <LiveBadge updatedAt={updatedAt} refreshing={loading || returnsLoading} />
          <button className="btn-secondary" onClick={() => refresh(true)} disabled={loading || returnsLoading}>
            <RefreshCw size={14} className={loading || returnsLoading ? 'animate-spin' : ''} /> Yenile
          </button>
          <select
            value={indexFilter}
            onChange={(e) => setIndexFilter(e.target.value)}
            className="input h-9 cursor-pointer text-xs"
            title="Sektör/endeks filtresi"
          >
            <option value="all">Tüm Sektörler</option>
            {BIST_INDICES.map((idx) => (
              <option key={idx.code} value={idx.code}>
                {idx.code} · {idx.label}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-8 w-56"
              placeholder="Sembol veya isim…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
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

          {/* Fintables-stili tablo — yatay kaydırmalı, sembol sol sabit */}
          <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-border bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="sticky left-0 z-20 bg-bg-soft px-2 py-2.5 text-left">#</th>
                  <SortableHeader
                    label="Sembol"
                    sortKey="symbol"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={setSort}
                    align="left"
                    className="sticky left-8 z-20 bg-bg-soft"
                  />
                  <th className="px-2 py-2.5 text-left hidden sm:table-cell">Ad / Sektör</th>
                  <SortableHeader label="Fiyat" sortKey="price" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="Gün %" sortKey="changePct" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="1 Hafta %" sortKey="r1h" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="1 Ay %" sortKey="r1a" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="3 Ay %" sortKey="r3a" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="6 Ay %" sortKey="r6a" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="YTD %" sortKey="rytd" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="1 Yıl %" sortKey="r1y" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                </tr>
              </thead>
              <tbody>
                {paginated.map((s, i) => {
                  const isWatched = watchedSymbols.has(s.symbol);
                  const globalIndex = (safePage - 1) * PAGE_SIZE + i + 1;
                  return (
                    <StockTableRow
                      key={s.symbol}
                      stock={s}
                      rank={globalIndex}
                      isWatched={isWatched}
                      onToggle={() => toggleWatch(s.symbol)}
                    />
                  );
                })}
              </tbody>
            </table>
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
        Toplam {sorted.length} hisse. Fiyat 60 sn cache, dönemsel getiriler 30 dk cache (Yahoo Finance). Sembole tıkla → detay. Yıldıza tıkla → takibe ekle.
      </p>
    </>
  );
}

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}

function SortableHeader({ label, sortKey, activeKey, dir, onClick, align = 'right', className }: SortableHeaderProps) {
  const active = activeKey === sortKey;
  return (
    <th
      className={cn(
        'cursor-pointer select-none whitespace-nowrap px-2 py-2.5 transition hover:text-slate-200',
        align === 'right' ? 'text-right' : 'text-left',
        active && 'text-accent',
        className,
      )}
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          <span className="text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>
        ) : (
          <ArrowUpDown size={10} className="opacity-30" />
        )}
      </span>
    </th>
  );
}

interface StockTableRowProps {
  stock: StockRow;
  rank: number;
  isWatched: boolean;
  onToggle: () => void;
}

function StockTableRow({ stock, rank, isWatched, onToggle }: StockTableRowProps) {
  return (
    <tr className="border-b border-border/60 transition hover:bg-bg-card">
      <td className="sticky left-0 z-10 bg-bg-soft px-2 py-2 text-[11px] text-slate-500 tabular-nums">
        {rank}
      </td>
      <td className="sticky left-8 z-10 bg-bg-soft px-2 py-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
            className={cn(
              'shrink-0 transition',
              isWatched ? 'text-warning' : 'text-slate-600 hover:text-warning',
            )}
            title={isWatched ? 'Takipten çıkar' : 'Takibe al'}
          >
            <Star size={12} fill={isWatched ? 'currentColor' : 'none'} />
          </button>
          <Link
            to={`/stock/${stock.symbol}`}
            className="font-mono text-[13px] font-semibold text-slate-100 hover:text-accent"
          >
            {stock.symbol}
          </Link>
        </div>
      </td>
      <td className="hidden sm:table-cell px-2 py-2">
        <div className="flex items-center gap-1.5">
          {stock.sector && stock.sector !== 'Diğer' && (
            <span className="rounded border border-border bg-bg-card px-1 py-0.5 text-[9px] text-slate-400 whitespace-nowrap">
              {stock.sector}
            </span>
          )}
          <span className="truncate text-[11px] text-slate-400 max-w-[200px]">
            {stock.name}
          </span>
        </div>
      </td>
      <td className="px-2 py-2 text-right font-mono text-[12px] tabular-nums text-slate-300 whitespace-nowrap">
        {stock.price > 0 ? `₺${stock.price.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` : '—'}
      </td>
      <PerfCell value={stock.changePct} />
      <PerfCell value={stock.returns?.['1h']} />
      <PerfCell value={stock.returns?.['1a']} />
      <PerfCell value={stock.returns?.['3a']} />
      <PerfCell value={stock.returns?.['6a']} />
      <PerfCell value={stock.returns?.['1y']} />
      <PerfCell value={stock.returns?.['1y']} />
    </tr>
  );
}

function PerfCell({ value }: { value: number | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <td className="px-2 py-2 text-right font-mono text-[12px] tabular-nums text-slate-600 whitespace-nowrap">
        —
      </td>
    );
  }
  const tone = value >= 0 ? 'text-success' : 'text-danger';
  return (
    <td className={cn('px-2 py-2 text-right font-mono text-[12px] tabular-nums whitespace-nowrap', tone)}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </td>
  );
}
      <PerfCell value={stock.returns?.['1h']} />
      <PerfCell value={stock.returns?.['1a']} />
      <PerfCell value={stock.returns?.['3a']} />
      <PerfCell value={stock.returns?.['6a']} />
      <PerfCell value={stock.returns?.['1y']} />
      <PerfCell value={stock.returns?.['1y']} />
    </tr>
  );
}

function PerfCell({ value }: { value: number | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <td className="px-2 py-2 text-right font-mono text-[12px] tabular-nums text-slate-600 whitespace-nowrap">
        —
      </td>
    );
  }
  const tone = value >= 0 ? 'text-success' : 'text-danger';
  return (
    <td className={cn('px-2 py-2 text-right font-mono text-[12px] tabular-nums whitespace-nowrap', tone)}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </td>
  );
}
