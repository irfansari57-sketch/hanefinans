import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, ExternalLink, Search, ChevronUp, ChevronDown, ChevronRight, Star, RefreshCw } from 'lucide-react';
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

const SORT_COLUMNS: Array<{ key: SortKey; label: string; period?: keyof PeriodReturns; hideOnMobile?: boolean }> = [
  // Sembol sütun başlığı boş — hisse kodları satırlarda zaten görünüyor
  { key: 'symbol',    label: '' },
  { key: 'price',     label: 'Fiyat' },
  { key: 'changePct', label: 'Gün %' },
  { key: 'r1g',  label: '1 Gün',   period: '1g', hideOnMobile: true },
  { key: 'r1h',  label: '1 Hafta', period: '1h', hideOnMobile: true },
  { key: 'r1a',  label: '1 Ay',    period: '1a', hideOnMobile: true },
  { key: 'r3a',  label: '3 Ay',    period: '3a', hideOnMobile: true },
  { key: 'r6a',  label: '6 Ay',    period: '6a', hideOnMobile: true },
  { key: 'rytd', label: 'YTD',     period: '1y', hideOnMobile: true },
  { key: 'r1y',  label: '1 Yıl',   period: '1y' },
];

const STOCK_RETURNS_CACHE_KEY = 'fa.stocks.returns.v1';
const STOCK_RETURNS_TTL_MS = 30 * 60_000; // 30 dk

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

export function StocksPage() {
  const watchedSymbolsList = useWatchlist((s) => s.symbols);
  const toggleWatchlist = useWatchlist((s) => s.toggle);
  const watchedSymbols = useMemo(() => new Set(watchedSymbolsList), [watchedSymbolsList]);

  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [returnsMap, setReturnsMap] = useState<Record<string, PeriodReturns>>({});
  const [loading, setLoading] = useState(true);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('r1y');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [tab, setTab] = useState<'all' | 'watched'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  const refresh = async (forceReturns = false) => {
    setLoading(true);
    try {
      // Tüm BIST evreni — MOCK_STOCKS (zengin meta) + BIST_UNIQUE (geniş kapsam) birleşik
      const richMap = new Map(MOCK_STOCKS.map((s) => [s.symbol, s]));
      const universe: { symbol: string; name: string; sector: string }[] = [];
      const seen = new Set<string>();
      // Önce zengin olanlar
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

      // İlk paint: tüm sembolleri placeholder Stock ile göster (price=0)
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

      // Quote'ları 50'şer batch — Yahoo proxy'yi zorlamadan tüm 270'i çek
      const BATCH_SIZE = 50;
      const liveStocks: Stock[] = [];
      for (let i = 0; i < all.length; i += BATCH_SIZE) {
        const batch = all.slice(i, i + BATCH_SIZE);
        const { data } = await loadStocks(batch);
        liveStocks.push(...data);
        // Her batch sonrası UI'a yansıt (incremental)
        const liveMap = new Map(liveStocks.map((s) => [s.symbol, s]));
        const merged = placeholderStocks.map((p) => liveMap.get(p.symbol) ?? p);
        setStocks(merged);
      }
      setUpdatedAt(Date.now());

      // Returns cache'i oku
      const cached = forceReturns ? null : readReturnsCache();
      if (cached) {
        setReturnsMap(cached);
        return;
      }
      // Cache yoksa: historical fetch — yine 30'lu batch'te (1Y data daha ağır)
      setReturnsLoading(true);
      const newReturns: Record<string, PeriodReturns> = {};
      const RETURNS_BATCH = 30;
      for (let i = 0; i < all.length; i += RETURNS_BATCH) {
        const batch = all.slice(i, i + RETURNS_BATCH);
        await Promise.all(
          batch.map(async (sym) => {
            const hist = await fetchHistoricalYahoo(sym, '1y', '1d');
            if (hist) newReturns[sym] = computePeriodReturns(hist.closes);
          }),
        );
        // İncremental update — kullanıcı dolan satırları gerçek zamanlı görsün
        setReturnsMap({ ...newReturns });
      }
      writeReturnsCache(newReturns);
    } finally {
      setLoading(false);
      setReturnsLoading(false);
    }
  };

  useEffect(() => {
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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage],
  );
  // Filter/sort/tab değişimi → 1. sayfaya dön
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
      <SeoHead title="BIST Hisseleri" description="BIST tüm hisseleri canlı fiyat, günlük değişim, hacim ve teknik göstergelerle. Filtre, arama, sıralama." path="/stocks" />

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
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
          <table className="min-w-full text-xs">
            <thead className="bg-bg-card text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2.5 text-left w-8">#</th>
                <th className="px-3 py-2.5 text-left w-8"></th>
                {SORT_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      'px-3 py-2.5 text-right cursor-pointer hover:text-slate-100 whitespace-nowrap',
                      c.hideOnMobile && 'hidden md:table-cell',
                    )}
                    onClick={() => setSort(c.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {sortKey === c.key ? (
                        sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                      ) : null}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center w-28 whitespace-nowrap">Detay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((s, i) => {
                const isWatched = watchedSymbols.has(s.symbol);
                const globalIndex = (safePage - 1) * PAGE_SIZE + i + 1;
                return (
                  <tr key={s.symbol} className="group hover:bg-bg-card transition-colors">
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">{globalIndex}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => toggleWatch(s.symbol)}
                        className={cn(
                          'rounded p-1 transition',
                          isWatched ? 'text-warning' : 'text-slate-500 hover:text-warning',
                        )}
                        title={isWatched ? 'Takipten çıkar' : 'Takibe al'}
                      >
                        <Star size={14} fill={isWatched ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-left whitespace-nowrap">
                      <Link
                        to={`/stock/${s.symbol}`}
                        className="inline-flex items-center gap-1.5 font-mono font-semibold text-accent hover:underline"
                      >
                        {s.symbol}
                        <ChevronRight size={10} className="opacity-0 transition group-hover:opacity-100" />
                      </Link>
                      <div className="mt-0.5 truncate text-[10px] text-slate-500 max-w-[200px]">{s.name}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">
                      ₺{s.price.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                    </td>
                    <PerfCell value={s.changePct} />
                    <PerfCell value={s.returns?.['1g']} hideOnMobile />
                    <PerfCell value={s.returns?.['1h']} hideOnMobile />
                    <PerfCell value={s.returns?.['1a']} hideOnMobile />
                    <PerfCell value={s.returns?.['3a']} hideOnMobile />
                    <PerfCell value={s.returns?.['6a']} hideOnMobile />
                    <PerfCell value={s.returns?.['1y']} hideOnMobile />
                    <PerfCell value={s.returns?.['1y']} />
                    <td className="px-3 py-2.5 text-center">
                      <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Link
                          to={`/stock/${s.symbol}`}
                          className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/20"
                          title="Grafik ve teknik analiz"
                        >
                          Grafik
                        </Link>
                        <a
                          href={`https://fintables.com/sirketler/${s.symbol}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success hover:bg-success/20"
                          title="Fintables'ta detay"
                        >
                          FT
                          <ExternalLink size={9} />
                        </a>
                      </div>
                    </td>
                  </tr>
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
        Toplam {sorted.length} hisse. Fiyat ve günlük değişim 60 sn cache, dönemsel getiriler 30 dk cache (Yahoo Finance).
      </p>
    </>
  );
}

function PerfCell({ value, hideOnMobile }: { value?: number; hideOnMobile?: boolean }) {
  const baseClass = cn('px-3 py-2.5 text-right tabular-nums whitespace-nowrap', hideOnMobile && 'hidden md:table-cell');
  if (value == null || !Number.isFinite(value)) {
    return <td className={cn(baseClass, 'text-slate-600')}>—</td>;
  }
  const tone = value >= 0 ? 'text-success' : 'text-danger';
  return (
    <td className={cn(baseClass, tone)}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </td>
  );
}
