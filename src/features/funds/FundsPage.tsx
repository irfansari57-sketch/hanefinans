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
import type { FundEntry } from '@/data/db';
import { loadFundsAsPerformanceDetailed, isTefasGithubConfigured, type TefasFeedFetchResult } from '@/data/api/tefasGithub';
import type { FundPerformance, FundCategory } from '@/data/types';
import { formatRelative } from '@/lib/date';
import { cn } from '@/lib/utils';

const tefasUrl = (code: string) => `https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(code)}`;

type SortKey = keyof Pick<FundPerformance, 'day' | 'week' | 'month' | 'threeMonth' | 'sixMonth' | 'ytd' | 'year' | 'threeYear' | 'fiveYear'> | 'code';

const SORT_COLUMNS: Array<{ key: SortKey; label: string; short: string; hideOnMobile?: boolean }> = [
  { key: 'code',       label: 'Fon Kodu', short: '#' },
  { key: 'week',       label: '1 Hafta',   short: '1H (%)', hideOnMobile: true },
  { key: 'month',      label: '1 Ay',      short: '1A (%)' },
  { key: 'threeMonth', label: '3 Ay',      short: '3A (%)', hideOnMobile: true },
  { key: 'sixMonth',   label: '6 Ay',      short: '6A (%)' },
  { key: 'ytd',        label: 'Yılbaşı',   short: 'YTD (%)', hideOnMobile: true },
  { key: 'year',       label: '1 Yıl',     short: '1Y (%)' },
];

const PRESET_SORTS: Array<{ key: Exclude<SortKey, 'code'>; label: string }> = [
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

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-400">
        <Info size={14} className="mt-0.5 shrink-0 text-accent" />
        <span>
          Performans verileri GitHub Actions üzerinden saatlik olarak TEFAS'tan çekilir. Canlı NAV/getiri için her fon kartında{' '}
          <strong className="text-accent">TEFAS</strong> ve <strong className="text-accent">Fintables</strong> linkleri
          ile resmi sayfaya tek tıkla ulaşabilirsin.
        </span>
      </div>

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
                      sortKey === c.key && 'text-accent',
                    )}
                    onClick={() => setSort(c.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.short}
                      {sortKey === c.key ? (
                        sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                      ) : null}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center w-40 whitespace-nowrap">Canlı Veri</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((f, i) => {
                const isWatched = watchedCodes.has(f.code);
                const globalIndex = (safePage - 1) * PAGE_SIZE + i + 1;
                return (
                  <tr key={f.code} className="group hover:bg-bg-card transition-colors">
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">{globalIndex}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => toggleWatch(f)}
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
                        to={`/fund/${f.code}`}
                        className="inline-flex items-center gap-1.5 font-mono font-semibold text-accent hover:underline"
                      >
                        {f.code}
                        <ChevronRight size={10} className="opacity-0 transition group-hover:opacity-100" />
                      </Link>
                      {f.name && f.name !== f.code && (
                        <div className="mt-0.5 truncate text-[10px] text-slate-500 max-w-[260px]">{f.name}</div>
                      )}
                      {f.category && (
                        <span className="mt-1 inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">
                          {f.category}
                        </span>
                      )}
                    </td>
                    <PerfCell value={f.week} hideOnMobile />
                    <PerfCell value={f.month} />
                    <PerfCell value={f.threeMonth} hideOnMobile />
                    <PerfCell value={f.sixMonth} />
                    <PerfCell value={f.ytd} hideOnMobile />
                    <PerfCell value={f.year} />
                    <td className="px-3 py-2.5 text-center">
                      <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <a
                          href={tefasUrl(f.code)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success hover:bg-success/20"
                          title="TEFAS'ta canlı veri"
                        >
                          TEFAS
                          <ExternalLink size={9} />
                        </a>
                        <a
                          href={`https://fintables.com/fonlar/${f.code}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/20"
                          title="Fintables'ta detaylı analiz"
                        >
                          Fintables
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
