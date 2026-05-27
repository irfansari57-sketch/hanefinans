import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { PiggyBank, Search, Star, AlertCircle, ArrowUpDown } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { fundsRepo } from '@/data/repositories';
import type { FundEntry } from '@/data/db';
import { loadFundsAsPerformanceDetailed, isTefasGithubConfigured, type TefasFeedFetchResult } from '@/data/api/tefasGithub';
import type { FundPerformance, FundCategory } from '@/data/types';
import { formatRelative } from '@/lib/date';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';

type SortKey = keyof Pick<FundPerformance, 'day' | 'week' | 'month' | 'threeMonth' | 'sixMonth' | 'ytd' | 'year'> | 'code';

export function FundsPage() {
  const watched = useLiveQuery(() => fundsRepo.list(), []) ?? [];
  const watchedCodes = useMemo(() => new Set(watched.map((f) => f.code)), [watched]);

  const [tab, setTab] = useState<'all' | 'watched'>('all');
  const [toDelete, setToDelete] = useState<FundEntry | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('week');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const PAGE_SIZE = 50;
  const [liveFunds, setLiveFunds] = useState<FundPerformance[] | null>(null);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<TefasFeedFetchResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadFundsAsPerformanceDetailed()
      .then((r) => {
        if (!alive) return;
        if (r.ok && r.funds && r.feed) {
          setLiveFunds(r.funds);
          setFeedUpdatedAt(r.feed.updatedAt);
          setFeedError(null);
        } else {
          setLiveFunds([]);
          setFeedError(r);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const feedConfigured = isTefasGithubConfigured();
  const hasLiveData = !!liveFunds && liveFunds.length > 0;

  const universe: FundPerformance[] = useMemo(() => {
    const source = liveFunds ?? [];
    if (tab === 'watched') {
      return watched.map((w) => {
        const live = source.find((m) => m.code === w.code);
        if (live) return live;
        return {
          code: w.code,
          name: w.name,
          category: (w.category as FundCategory) ?? 'Serbest',
          tefas: true,
          day: NaN, week: NaN, month: NaN, threeMonth: NaN, sixMonth: NaN, ytd: NaN, year: NaN,
        } as FundPerformance;
      });
    }
    return source;
  }, [tab, watched, liveFunds]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    universe.forEach((f) => {
      const c = (f.category ?? '').trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [universe]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return universe.filter((f) => {
      if (categoryFilter !== 'all' && (f.category ?? '') !== categoryFilter) return false;
      if (q) {
        const blob = `${f.code} ${f.name ?? ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [universe, search, categoryFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortKey === 'code') {
        return sortDir === 'asc' ? a.code.localeCompare(b.code) : b.code.localeCompare(a.code);
      }
      const va = (a[sortKey] as number | undefined);
      const vb = (b[sortKey] as number | undefined);
      const aValid = Number.isFinite(va);
      const bValid = Number.isFinite(vb);
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;
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
  useEffect(() => { setCurrentPage(1); }, [search, tab, sortKey, sortDir, categoryFilter]);

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'code' ? 'asc' : 'desc');
    }
  };

  const toggleWatch = async (fund: FundPerformance) => {
    if (watchedCodes.has(fund.code)) {
      const existing = watched.find((w) => w.code === fund.code);
      if (existing?.id) await fundsRepo.remove(existing.id);
    } else {
      await fundsRepo.add({ code: fund.code, name: fund.name, category: fund.category });
    }
  };

  return (
    <>
      <SeoHead title="TEFAS Fonları" description="TEFAS yatırım fonları liste/tablo görünümü." path="/funds" />

      {!feedConfigured && (
        <div className="card mb-4 border-warning/40 bg-warning/5 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-warning" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-warning">Canlı TEFAS verisi yapılandırılmadı</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                Bu sayfa <strong>yalnızca gerçek TEFAS verisiyle</strong> çalışır.
              </p>
            </div>
          </div>
        </div>
      )}

      {feedConfigured && !loading && !hasLiveData && feedError && (
        <div className="card mb-4 border-danger/40 bg-danger/5 p-4 text-xs text-slate-300">
          <strong className="text-danger">Feed yapılandırıldı ama veri gelmiyor.</strong>
          <dl className="mt-2 grid gap-x-3 gap-y-1.5 text-[11px]" style={{ gridTemplateColumns: 'max-content 1fr' }}>
            <dt className="font-semibold text-slate-400">Hata:</dt>
            <dd className="font-mono text-danger break-all">{feedError.error ?? 'bilinmiyor'}</dd>
            {feedError.status != null && (
              <>
                <dt className="font-semibold text-slate-400">HTTP:</dt>
                <dd className="font-mono">{feedError.status}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-bg-soft p-1">
          <button
            className={cn('rounded-md px-3 py-1.5 text-sm transition', tab === 'all' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200')}
            onClick={() => setTab('all')}
          >
            Tüm Fonlar ({liveFunds?.length ?? 0})
          </button>
          <button
            className={cn('rounded-md px-3 py-1.5 text-sm transition', tab === 'watched' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200')}
            onClick={() => setTab('watched')}
          >
            Takipte ({watched.length})
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {feedUpdatedAt && (
            <LiveBadge updatedAt={new Date(feedUpdatedAt).getTime()} refreshing={loading} />
          )}
          {availableCategories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="input h-9 cursor-pointer text-xs"
              title="Kategori filtresi"
            >
              <option value="all">Tüm Kategoriler</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-8 w-56"
              placeholder="Fon kodu veya adı…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<PiggyBank size={28} />}
          title={!feedConfigured ? 'Veri bekleniyor' : tab === 'watched' ? 'Takipte fon yok' : 'Eşleşme yok'}
          description={!feedConfigured ? 'TEFAS feed kurulumu tamamlanmalı.' : tab === 'watched' ? 'Üstteki "Tüm Fonlar"a geç, yıldıza basarak fon ekle.' : 'Arama veya kategori filtresini gevşet.'}
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
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="sticky left-0 z-20 bg-bg-soft px-2 py-2.5 text-left">#</th>
                  <SortableHeader label="Kod" sortKey="code" activeKey={sortKey} dir={sortDir} onClick={setSort} align="left" className="sticky left-8 z-20 bg-bg-soft" />
                  <th className="px-2 py-2.5 text-left hidden sm:table-cell">Şemsiye / Kategori</th>
                  <SortableHeader label="Gün %" sortKey="day" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="1 Hafta %" sortKey="week" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="1 Ay %" sortKey="month" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="3 Ay %" sortKey="threeMonth" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="6 Ay %" sortKey="sixMonth" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="YTD %" sortKey="ytd" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="1 Yıl %" sortKey="year" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                </tr>
              </thead>
              <tbody>
                {paginated.map((f, i) => (
                  <FundTableRow
                    key={f.code}
                    fund={f}
                    rank={(safePage - 1) * PAGE_SIZE + i + 1}
                    isWatched={watchedCodes.has(f.code)}
                    onToggle={() => toggleWatch(f)}
                  />
                ))}
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

      {feedUpdatedAt && hasLiveData && (
        <p className="mt-3 text-[11px] text-slate-500">
          Toplam {sorted.length} fon. Veri güncelleme: {formatRelative(feedUpdatedAt)}.
        </p>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Fonu listeden çıkar?"
        message={`"${toDelete?.code}" fonu takipten çıkarılacak.`}
        destructive
        confirmText="Çıkar"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete?.id) await fundsRepo.remove(toDelete.id);
          setToDelete(null);
        }}
      />
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
        {active ? <span className="text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span> : <ArrowUpDown size={10} className="opacity-30" />}
      </span>
    </th>
  );
}

interface FundTableRowProps {
  fund: FundPerformance;
  rank: number;
  isWatched: boolean;
  onToggle: () => void;
}

function FundTableRow({ fund, rank, isWatched, onToggle }: FundTableRowProps) {
  return (
    <tr className="border-b border-border/60 transition hover:bg-bg-card">
      <td className="sticky left-0 z-10 bg-bg-soft px-2 py-2 text-[11px] text-slate-500 tabular-nums">{rank}</td>
      <td className="sticky left-8 z-10 bg-bg-soft px-2 py-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
            className={cn('shrink-0 transition', isWatched ? 'text-warning' : 'text-slate-600 hover:text-warning')}
            title={isWatched ? 'Takipten çıkar' : 'Takibe al'}
          >
            <Star size={12} fill={isWatched ? 'currentColor' : 'none'} />
          </button>
          <Link to={`/fund/${fund.code}`} className="font-mono text-[13px] font-semibold text-slate-100 hover:text-accent">
            {fund.code}
          </Link>
        </div>
      </td>
      <td className="hidden sm:table-cell px-2 py-2">
        <div className="flex items-center gap-1.5">
          {fund.category && (
            <span className="rounded border border-border bg-bg-card px-1 py-0.5 text-[9px] text-slate-400 whitespace-nowrap">{fund.category}</span>
          )}
          <span className="truncate text-[11px] text-slate-400 max-w-[200px]">{fund.name}</span>
        </div>
      </td>
      <PerfCell value={fund.day} />
      <PerfCell value={fund.week} />
      <PerfCell value={fund.month} />
      <PerfCell value={fund.threeMonth} />
      <PerfCell value={fund.sixMonth} />
      <PerfCell value={fund.ytd} />
      <PerfCell value={fund.year} />
    </tr>
  );
}

function PerfCell({ value }: { value: number | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return <td className="px-2 py-2 text-right font-mono text-[12px] tabular-nums text-slate-600 whitespace-nowrap">—</td>;
  }
  const tone = value >= 0 ? 'text-success' : 'text-danger';
  return (
    <td className={cn('px-2 py-2 text-right font-mono text-[12px] tabular-nums whitespace-nowrap', tone)}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </td>
  );
}
