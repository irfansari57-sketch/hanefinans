import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  PiggyBank, Plus, ExternalLink, Search, Info, Star, ChevronRight,
  ChevronUp, ChevronDown, Trophy, AlertCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { fundsRepo } from '@/data/repositories';
import { RecPoolStats, type PoolStatBoxData } from '@/components/domain/RecPoolStats';
import type { FundEntry } from '@/data/db';
import { loadFundsAsPerformanceDetailed, isTefasGithubConfigured, type TefasFeedFetchResult } from '@/data/api/tefasGithub';
import type { FundPerformance, FundCategory } from '@/data/types';
import { formatRelative } from '@/lib/date';
import { cn } from '@/lib/utils';

const tefasUrl = (code: string) => `https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(code)}`;

type SortKey = keyof Pick<FundPerformance, 'day' | 'week' | 'month' | 'threeMonth' | 'sixMonth' | 'ytd' | 'year' | 'threeYear' | 'fiveYear'> | 'code';

const SORT_COLUMNS: Array<{ key: SortKey; label: string; short: string }> = [
  { key: 'code',       label: 'Fon Kodu', short: '#' },
  { key: 'day',        label: '1 Gün',    short: '1G (%)' },
  { key: 'week',       label: '1 Hafta',  short: '1H (%)' },
  { key: 'month',      label: '1 Ay',     short: '1A (%)' },
  { key: 'threeMonth', label: '3 Ay',     short: '3A (%)' },
  { key: 'sixMonth',   label: '6 Ay',     short: '6A (%)' },
  { key: 'ytd',        label: 'Yılbaşı',  short: 'YTD (%)' },
  { key: 'year',       label: '1 Yıl',    short: '1Y (%)' },
];

const PERIOD_LABEL: Record<Exclude<SortKey, 'code'>, string> = {
  day: '1 Gün',
  week: '1 Hafta',
  month: '1 Ay',
  threeMonth: '3 Ay',
  sixMonth: '6 Ay',
  ytd: 'Yılbaşı',
  year: '1 Yıl',
  threeYear: '3 Yıl',
  fiveYear: '5 Yıl',
};

const PRESET_SORTS: Array<{ key: Exclude<SortKey, 'code'>; label: string }> = [
  { key: 'day',        label: '1 Gün' },
  { key: 'week',       label: '1 Hafta' },
  { key: 'month',      label: '1 Ay' },
  { key: 'threeMonth', label: '3 Ay' },
  { key: 'sixMonth',   label: '6 Ay' },
  { key: 'ytd',        label: 'Yılbaşı' },
  { key: 'year',       label: '1 Yıl' },
];

const ALL_CATEGORIES: FundCategory[] = [
  'Para Piyasası',
  'Serbest',
  'Hisse Senedi',
  'Değişken',
  'Fon Sepeti',
  'Kıymetli Madenler',
  'Borçlanma Araçları',
  'Katılım',
];

export function FundsPage() {
  const watched = useLiveQuery(() => fundsRepo.list(), []) ?? [];
  const watchedCodes = useMemo(() => new Set(watched.map((f) => f.code)), [watched]);

  const [tab, setTab] = useState<'all' | 'watched'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<FundEntry | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('week');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const PAGE_SIZE = 25;
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

  // Universe'taki gerçek kategori değerleri (canlı feed'den dinamik)
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
      // Geçersiz değerleri her zaman en alta gönder
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;
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
  useEffect(() => {
    setCurrentPage(1);
  }, [search, tab, sortKey, sortDir, categoryFilter]);


  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'code' ? 'asc' : 'desc');
    }
  };

  const setPresetSort = (k: Exclude<SortKey, 'code'>) => {
    setSortKey(k);
    setSortDir('desc');
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
      <PageHeader
        title="Fonlar"
        subtitle="TEFAS fonları en yüksek getiriye göre sıralı. Üstteki butonlarla periyodu değiştir; sütunu tıklayarak da sıralayabilirsin."
        actions={
          <div className="flex items-center gap-2">
            {feedUpdatedAt && (
              <LiveBadge
                updatedAt={new Date(feedUpdatedAt).getTime()}
                refreshing={loading}
              />
            )}
            <button className="btn-secondary" onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Manuel Fon Ekle
            </button>
          </div>
        }
      />

      {/* Feed yapılandırma uyarısı */}
      {!feedConfigured && (
        <div className="card mb-4 border-warning/40 bg-warning/5 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-warning" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-warning">Canlı TEFAS verisi yapılandırılmadı</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                Bu sayfa <strong>yalnızca gerçek TEFAS verisiyle</strong> çalışır. Sahte/demo veri kullanmıyoruz.
                Kurulum 10 dakika ve tamamen ücretsiz — GitHub Actions saatlik tarayıcı kuruyorsun, jsDelivr CDN üzerinden uygulamaya akıyor.
              </p>
              <ol className="mt-2 list-decimal pl-5 text-xs text-slate-400 space-y-0.5">
                <li>GitHub'da public bir <code className="rounded bg-bg-card px-1 font-mono">hanefinans-data</code> reposu aç</li>
                <li>Proje kökündeki <code className="rounded bg-bg-card px-1 font-mono">github-data-repo/</code> dosyalarını oraya yükle</li>
                <li>Actions sekmesinde workflow'u manuel tetikle (~3 dk)</li>
                <li><code className="rounded bg-bg-card px-1 font-mono">.env.local</code> dosyasına jsDelivr URL'i ekle</li>
              </ol>
              <p className="mt-2 text-[11px] text-slate-500">
                Detaylı adım adım rehber için proje kökündeki <code className="rounded bg-bg-card px-1 font-mono">SETUP_GITHUB_TEFAS.md</code> dosyasına bak.
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
            {feedError.url && (
              <>
                <dt className="font-semibold text-slate-400">URL:</dt>
                <dd className="font-mono text-slate-400 break-all">
                  <a href={feedError.url} target="_blank" rel="noreferrer" className="text-accent underline">{feedError.url}</a>
                </dd>
              </>
            )}
            {feedError.preview && (
              <>
                <dt className="font-semibold text-slate-400">İlk yanıt:</dt>
                <dd className="font-mono text-slate-500 break-all max-h-24 overflow-y-auto">{feedError.preview}</dd>
              </>
            )}
          </dl>
          <p className="mt-3 text-[10px] text-slate-500">
            <strong>Yaygın sebepler:</strong> (1) GitHub Actions workflow henüz çalışmadı → repoda Actions sekmesi → "Run workflow" tetikle. (2) jsDelivr CDN cache 10 dk sürer → URL sonuna <code className="rounded bg-bg-card px-1">?v=123</code> ekleyip test et. (3) Workflow log'unda Python scraper hata vermiş olabilir → repoda Actions → son run → logları aç.
          </p>
        </div>
      )}

      {/* Üst kontrol bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-bg-soft p-1">
          <button
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition',
              tab === 'all' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
            )}
            onClick={() => setTab('all')}
          >
            Tüm Fonlar ({liveFunds?.length ?? 0})
          </button>
          <button
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition',
              tab === 'watched' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
            )}
            onClick={() => setTab('watched')}
          >
            Takipte ({watched.length})
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
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

      {/* Hızlı sıralama presetleri */}
      {hasLiveData && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 p-2.5">
          <span className="ml-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
            <Trophy size={12} /> En Yüksek Getiri
          </span>
          {PRESET_SORTS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPresetSort(p.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                sortKey === p.key && sortDir === 'desc'
                  ? 'bg-accent text-accent-fg shadow-sm shadow-accent/30'
                  : 'bg-bg-soft text-slate-300 hover:bg-bg-card hover:text-slate-100',
              )}
            >
              {p.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-slate-500">{sorted.length} fon</span>
        </div>
      )}


      {sorted.length === 0 ? (
        <EmptyState
          icon={<PiggyBank size={28} />}
          title={
            !feedConfigured ? 'Veri bekleniyor'
            : tab === 'watched' ? 'Takipte fon yok'
            : 'Eşleşme yok'
          }
          description={
            !feedConfigured ? 'TEFAS feed kurulumu yukarıdaki yönergeyi takip et.'
            : tab === 'watched' ? 'Üstteki "Tüm Fonlar"a geç, yıldıza basarak fon ekle.'
            : 'Arama veya kategori filtresini gevşet.'
          }
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
        {/* Pool istatistikleri + Top/Bottom 3 — kategori + arama filtresi uygulanmış sıralı listeden hesaplanır */}
        {sorted.length > 0 && (
          <>
            <RecPoolStats boxes={computeFundPoolStats(sorted)} />
            <FundConsensusStrip funds={sorted} />
          </>
        )}

        {/* Hem "Tüm Fonlar" hem "Takipte" — akordeon satır liste (Trend Fonlar stili) */}
        <div className="space-y-1.5">
          {paginated.map((f, i) => (
            <WatchedFundRow
              key={f.code}
              fund={f}
              rank={(safePage - 1) * PAGE_SIZE + i + 1}
              sortKey={sortKey}
              isWatched={watchedCodes.has(f.code)}
              onToggle={() => toggleWatch(f)}
            />
          ))}
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
          Toplam {sorted.length} fon. Veri güncelleme: {formatRelative(feedUpdatedAt)}. Sembole tıklayarak detay sayfasına, yıldıza basarak takibe ekle.
        </p>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Manuel Fon Ekle" size="md">
        <AddFundForm onClose={() => setAddOpen(false)} />
      </Modal>

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

function PerfCell({ value, hideOnMobile }: { value?: number; hideOnMobile?: boolean }) {
  const baseClass = cn('px-3 py-2.5 text-right tabular-nums whitespace-nowrap', hideOnMobile && 'hidden md:table-cell');
  if (value == null || !Number.isFinite(value)) {
    return <td className={cn(baseClass, 'text-slate-600')}>—</td>;
  }
  const tone = value >= 0 ? 'text-success' : 'text-danger';
  return (
    <td className={cn(baseClass, tone)}>
      % {value.toFixed(2).replace('.', ',')}
    </td>
  );
}

interface WatchedFundRowProps {
  fund: FundPerformance;
  rank: number;
  sortKey: SortKey;
  isWatched: boolean;
  onToggle: () => void;
}

/**
 * Takipteki fon akordeon satırı — Öneriler sayfasındaki Trend Fonlar tarzı.
 * Summary: sıra rozeti, kod + kategori + TEFAS rozeti, ad, 3 mini chip (active hariç),
 * seçili döneme göre büyük getiri.
 * Açılınca: 7 dönem mini grid + Detay/TEFAS/Fintables butonları + Takipten çıkar.
 */
function WatchedFundRow({ fund, rank, sortKey, isWatched, onToggle }: WatchedFundRowProps) {
  const activeKey: Exclude<SortKey, 'code'> = sortKey === 'code' ? 'year' : sortKey;
  const activeLabel = PERIOD_LABEL[activeKey];
  const activeValue = fund[activeKey] as number | undefined;
  const activeValid = activeValue != null && Number.isFinite(activeValue);
  const activeTone = !activeValid ? 'text-slate-500' : (activeValue as number) >= 0 ? 'text-success' : 'text-danger';
  const isLong = activeValid && (activeValue as number) > 0;

  // Summary mini chip'leri — 3 yaygın dönem (active hariç)
  const microKeys: Array<Exclude<SortKey, 'code'>> = (['month', 'threeMonth', 'ytd', 'year'] as const)
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
            <Link to={`/fund/${fund.code}`} className="font-mono font-bold text-slate-100 hover:text-accent" onClick={(e) => e.stopPropagation()}>
              {fund.code}
            </Link>
            {isWatched && <Star size={10} className="text-warning" fill="currentColor" />}
            {fund.category && (
              <span className="rounded border border-border bg-bg-card px-1 py-0.5 text-[9px] text-slate-400">{fund.category}</span>
            )}
            {fund.tefas && (
              <span className="rounded bg-success/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">TEFAS</span>
            )}
          </div>
          {fund.name && fund.name !== fund.code && (
            <div className="truncate text-[10px] text-slate-500">{fund.name}</div>
          )}
        </div>
        <div className="hidden md:flex items-center gap-1 text-[9px]">
          {microKeys.map((k) => (
            <PerfMicro key={k} label={shortLabel(k)} value={fund[k] as number} />
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
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-7">
          <PerfMini label="1 Gün"   value={fund.day} />
          <PerfMini label="1 Hafta" value={fund.week} />
          <PerfMini label="1 Ay"    value={fund.month} />
          <PerfMini label="3 Ay"    value={fund.threeMonth} />
          <PerfMini label="6 Ay"    value={fund.sixMonth} />
          <PerfMini label="YTD"     value={fund.ytd} />
          <PerfMini label="1 Yıl"   value={fund.year} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`/fund/${fund.code}`} className="btn-primary">
            Detay <ChevronRight size={14} />
          </Link>
          <a
            href={tefasUrl(fund.code)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20"
          >
            TEFAS <ExternalLink size={11} />
          </a>
          <a
            href={`https://fintables.com/fonlar/${fund.code}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
          >
            Fintables <ExternalLink size={11} />
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

/**
 * TEFAS fonları için pool stats — toplam, ortalama 1Y/YTD, pozitif oran,
 * en yüksek, dominant kategori. Trend Fonlar'daki ile aynı.
 */
function computeFundPoolStats(funds: FundPerformance[]): PoolStatBoxData[] {
  const total = funds.length;
  if (total === 0) return [];
  const validYear = funds.filter((f) => Number.isFinite(f.year));
  const validYtd = funds.filter((f) => Number.isFinite(f.ytd));
  const avgYear = validYear.length > 0
    ? validYear.reduce((s, f) => s + f.year, 0) / validYear.length
    : 0;
  const avgYtd = validYtd.length > 0
    ? validYtd.reduce((s, f) => s + f.ytd, 0) / validYtd.length
    : 0;
  const positives = validYear.filter((f) => f.year >= 0).length;
  const positiveRatio = validYear.length > 0 ? (positives / validYear.length) * 100 : 0;
  const sortedYear = [...validYear].sort((a, b) => b.year - a.year);
  const best = sortedYear[0];

  const catCounts = new Map<string, number>();
  funds.forEach((f) => catCounts.set(f.category, (catCounts.get(f.category) ?? 0) + 1));
  const dominantCat = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return [
    { label: 'Toplam Fon',  value: `${total}`, sub: `${catCounts.size} kategori`, tone: 'slate' },
    { label: 'Ort. 1Y',     value: `${avgYear >= 0 ? '+' : ''}${avgYear.toFixed(1)}%`, tone: avgYear >= 0 ? 'success' : 'danger' },
    { label: 'Ort. YTD',    value: `${avgYtd >= 0 ? '+' : ''}${avgYtd.toFixed(1)}%`, tone: avgYtd >= 0 ? 'success' : 'danger' },
    { label: 'Pozitif Oran', value: `%${positiveRatio.toFixed(0)}`, sub: `${positives}/${validYear.length}`, tone: 'accent' },
    { label: 'En Yüksek',   value: best ? best.code : '-', sub: best ? `+${best.year.toFixed(1)}%` : undefined, tone: 'success' },
    { label: 'Dominant',    value: dominantCat ? dominantCat[0] : '-', sub: dominantCat ? `${dominantCat[1]} fon` : undefined, tone: 'warning' },
  ];
}

/** Top 3 / Bottom 3 fon (1Y getiri bazlı). */
function FundConsensusStrip({ funds }: { funds: FundPerformance[] }) {
  const valid = funds.filter((f) => Number.isFinite(f.year));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => b.year - a.year);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();

  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-success">Top 3 (1Y)</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {top3.map((f) => (
            <Link key={f.code} to={`/fund/${f.code}`} className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 font-mono font-semibold text-success hover:bg-success/20">
              {f.code}<span className="text-[10px] opacity-70">+{f.year.toFixed(1)}%</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-danger">Bottom 3 (1Y)</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {bottom3.map((f) => (
            <Link key={f.code} to={`/fund/${f.code}`} className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-0.5 font-mono font-semibold text-danger hover:bg-danger/20">
              {f.code}<span className="text-[10px] opacity-70">{f.year >= 0 ? '+' : ''}{f.year.toFixed(1)}%</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function shortLabel(k: Exclude<SortKey, 'code'>): string {
  switch (k) {
    case 'day': return '1G';
    case 'week': return '1H';
    case 'month': return '1A';
    case 'threeMonth': return '3A';
    case 'sixMonth': return '6A';
    case 'ytd': return 'YTD';
    case 'year': return '1Y';
    case 'threeYear': return '3Y';
    case 'fiveYear': return '5Y';
  }
}

/** Summary'de compact mini perf chip — Trend Fonlar'daki PerfMicro ile aynı. */
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
      <div className="rounded bg-bg-card px-2 py-1.5">
        <div className="text-[10px] text-slate-500">{label}</div>
        <div className="tabular-nums text-slate-600">—</div>
      </div>
    );
  }
  const tone = value >= 0 ? 'text-success' : 'text-danger';
  return (
    <div className="rounded bg-bg-card px-2 py-1.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={cn('text-sm font-medium tabular-nums', tone)}>
        {value >= 0 ? '+' : ''}{value.toFixed(2)}%
      </div>
    </div>
  );
}

function AddFundForm({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FundCategory>('Serbest');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!code.trim()) return;
    setSaving(true);
    try {
      await fundsRepo.add({ code, name, category });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Fon Kodu" hint="ör. TLY, AFA, AKE">
        <input
          className="input uppercase"
          placeholder="ör. TLY"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoFocus
          maxLength={5}
        />
      </Field>
      <Field label="Tam Adı (opsiyonel)">
        <input
          className="input"
          placeholder="ör. Türkiye Garanti Yatırım Hisse Senedi (TL) Fonu"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Kategori">
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value as FundCategory)}>
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-secondary" onClick={onClose}>İptal</button>
        <button className="btn-primary" onClick={save} disabled={saving || !code.trim()}>
          Ekle
        </button>
      </div>
    </div>
  );
}
