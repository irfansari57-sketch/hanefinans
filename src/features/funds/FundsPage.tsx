import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  PiggyBank, Plus, Trash2, ExternalLink, Search, Info, FileText, BarChart3,
  ChevronRight, Star, Check, ChevronUp, ChevronDown, Filter,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { NoteButton } from '@/components/domain/NoteButton';
import { fundsRepo } from '@/data/repositories';
import type { FundEntry } from '@/data/db';
import { MOCK_FUNDS } from '@/data/mockFunds';
import { fetchTefasFeed, isTefasGithubConfigured } from '@/data/api/tefasGithub';
import type { FundPerformance, FundCategory } from '@/data/types';
import { formatDateTR } from '@/lib/date';
import { cn } from '@/lib/utils';

const tefasUrl = (code: string) => `https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(code)}`;

type SortKey = keyof Pick<FundPerformance, 'day' | 'week' | 'month' | 'threeMonth' | 'sixMonth' | 'ytd' | 'year' | 'threeYear' | 'fiveYear'> | 'code';

const SORT_COLUMNS: Array<{ key: SortKey; label: string; short: string; hideOnMobile?: boolean }> = [
  { key: 'code',       label: 'Fon Kodu', short: '#' },
  { key: 'day',        label: 'Gün',       short: 'Gün (%)', hideOnMobile: true },
  { key: 'week',       label: '1 Hafta',   short: '1H (%)', hideOnMobile: true },
  { key: 'month',      label: '1 Ay',      short: '1A (%)' },
  { key: 'threeMonth', label: '3 Ay',      short: '3A (%)', hideOnMobile: true },
  { key: 'sixMonth',   label: '6 Ay',      short: '6A (%)', hideOnMobile: true },
  { key: 'ytd',        label: 'Yılbaşı',   short: 'YTD (%)', hideOnMobile: true },
  { key: 'year',       label: '1 Yıl',     short: '1Y (%)' },
  { key: 'threeYear',  label: '3 Yıl',     short: '3Y (%)', hideOnMobile: true },
  { key: 'fiveYear',   label: '5 Yıl',     short: '5Y (%)', hideOnMobile: true },
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
  const [category, setCategory] = useState<'all' | FundCategory>('all');
  const [sortKey, setSortKey] = useState<SortKey>('year');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [githubFunds, setGithubFunds] = useState<FundPerformance[] | null>(null);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isTefasGithubConfigured()) return;
    fetchTefasFeed().then((feed) => {
      if (!feed) return;
      setFeedUpdatedAt(feed.updatedAt);
      // GitHub formatından FundPerformance'a map
      const mapped: FundPerformance[] = feed.funds.map((f) => ({
        code: f.code,
        name: f.name,
        category: (f.category || 'Serbest') as FundCategory,
        tefas: true,
        day: 0, // gün değişimi history'den çıkarılabilir, şimdilik 0
        week: f.returns['1w'] ?? 0,
        month: f.returns['1m'] ?? 0,
        threeMonth: f.returns['3m'] ?? 0,
        sixMonth: f.returns['6m'] ?? 0,
        ytd: f.returns.ytd ?? 0,
        year: f.returns['1y'] ?? 0,
      }));
      setGithubFunds(mapped);
    });
  }, []);

  const dataSource: FundPerformance[] = githubFunds && githubFunds.length > 0 ? githubFunds : MOCK_FUNDS;

  const universe = useMemo(() => {
    if (tab === 'watched') {
      return watched.map((w) => {
        const live = dataSource.find((m) => m.code === w.code);
        if (live) return live;
        return {
          code: w.code,
          name: w.name,
          category: (w.category as FundCategory) ?? 'Serbest',
          tefas: true,
          day: 0, week: 0, month: 0, threeMonth: 0, sixMonth: 0, ytd: 0, year: 0,
        } as FundPerformance;
      });
    }
    return dataSource;
  }, [tab, watched, dataSource]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return universe.filter((f) => {
      if (category !== 'all' && f.category !== category) return false;
      if (q) {
        const blob = `${f.code} ${f.name ?? ''} ${f.category}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [universe, search, category]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortKey === 'code') {
        return sortDir === 'asc' ? a.code.localeCompare(b.code) : b.code.localeCompare(a.code);
      }
      const va = (a[sortKey] as number | undefined) ?? -Infinity;
      const vb = (b[sortKey] as number | undefined) ?? -Infinity;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'code' ? 'asc' : 'desc');
    }
  };

  const toggleWatch = async (code: string) => {
    if (watchedCodes.has(code)) {
      const existing = watched.find((w) => w.code === code);
      if (existing?.id) await fundsRepo.remove(existing.id);
    } else {
      const m = MOCK_FUNDS.find((x) => x.code === code);
      await fundsRepo.add({ code, name: m?.name, category: m?.category });
    }
  };

  return (
    <>
      <PageHeader
        title="Fonlar"
        subtitle="TEFAS fonlarını performans bazında karşılaştır, takip ettiklerine yıldız bas, detay için tıkla."
        actions={
          <button className="btn-secondary" onClick={() => setAddOpen(true)}>
            <Plus size={16} /> Manuel Fon Ekle
          </button>
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
            Tüm Fonlar ({MOCK_FUNDS.length})
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

        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-8 w-56"
            placeholder="Fon kodu veya adı…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="relative">
          <Filter size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <select
            className="input pl-8 w-44"
            value={category}
            onChange={(e) => setCategory(e.target.value as 'all' | FundCategory)}
          >
            <option value="all">Tüm kategoriler</option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-400">
        <Info size={14} className="mt-0.5 shrink-0 text-accent" />
        <span>
          Performans verileri referans amaçlı. Canlı NAV/getiri için her fon kartında{' '}
          <strong className="text-accent">TEFAS</strong> ve <strong className="text-accent">Fintables</strong> linkleri
          ile tek tık resmi sayfaya ulaşabilirsin.
        </span>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<PiggyBank size={28} />}
          title={tab === 'watched' ? 'Takipte fon yok' : 'Filtreyle eşleşme yok'}
          description={tab === 'watched' ? 'Üstteki "Tüm Fonlar"a geç, yıldıza basarak fon ekle.' : undefined}
        />
      ) : (
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
                      {c.short}
                      {sortKey === c.key ? (
                        sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                      ) : null}
                    </span>
                  </th>
                ))}
                <th className="hidden md:table-cell px-3 py-2.5 text-left w-32 whitespace-nowrap">Şemsiye</th>
                <th className="px-3 py-2.5 text-center w-40 whitespace-nowrap">Canlı Veri</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((f, i) => {
                const isWatched = watchedCodes.has(f.code);
                return (
                  <tr key={f.code} className="group hover:bg-bg-card transition-colors">
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => toggleWatch(f.code)}
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
                      {f.name && <div className="mt-0.5 truncate text-[10px] text-slate-500 max-w-[200px]">{f.name}</div>}
                    </td>
                    <PerfCell value={f.day} hideOnMobile />
                    <PerfCell value={f.week} hideOnMobile />
                    <PerfCell value={f.month} />
                    <PerfCell value={f.threeMonth} hideOnMobile />
                    <PerfCell value={f.sixMonth} hideOnMobile />
                    <PerfCell value={f.ytd} hideOnMobile />
                    <PerfCell value={f.year} />
                    <PerfCell value={f.threeYear} hideOnMobile />
                    <PerfCell value={f.fiveYear} hideOnMobile />
                    <td className="hidden md:table-cell px-3 py-2.5 text-left text-slate-400 whitespace-nowrap">{f.category}</td>
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
      )}

      <p className="mt-3 text-[11px] text-slate-500">
        {sorted.length} fon listelendi. Sembole tıklayarak detay sayfasına, yıldıza basarak takibe ekle.
      </p>

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
    return <td className={cn(baseClass, 'text-slate-600')}>N/A</td>;
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
