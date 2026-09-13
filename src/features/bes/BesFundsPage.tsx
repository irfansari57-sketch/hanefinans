/**
 * BES (Bireysel Emeklilik Sistemi) Fonları sayfası.
 *
 * Route: /bes
 * Data kaynağı: TEFAS feed (mevcut) — category filter 'Emeklilik' isim içeren fonları listeler.
 *
 * NOT (13 Eyl 2026): TEFAS scraper şu an sadece YAT (Yatırım Fonu) tipi çekiyor,
 * BES (fund_type='EMK') henüz kapsamda değil. Feed'de eşleşme çıkmazsa
 * kullanıcı bilgilendirici empty state görür — sonraki iterasyonda scraper genişletilecek.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowUpDown, Check, X, Landmark, AlertCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { DoubleScrollTable } from '@/components/ui/DoubleScrollTable';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { loadFundsAsPerformanceDetailed } from '@/data/api/tefasGithub';
import type { FundPerformance } from '@/data/types';
import { formatRelative } from '@/lib/date';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';

type SortKey = 'code' | 'day' | 'week' | 'month' | 'threeMonth' | 'sixMonth' | 'ytd' | 'year' | 'threeYear';
type Tab = 'getiri' | 'buyukluk';

// BES fonu tespiti: kategori 'Emeklilik' içerir VEYA isim içinde 'EMEKLİLİK'/'BES' geçer.
// Katılım BES ayrı chip'te filtrelenebilir.
function isBesFund(f: FundPerformance): boolean {
  const c = (f.category ?? '').toString().toLocaleUpperCase('tr-TR');
  const n = (f.name ?? '').toLocaleUpperCase('tr-TR');
  return c.includes('EMEKLİLİK') || c.includes('EMEKLILIK') || c.includes('BES')
    || n.includes('EMEKLİLİK') || n.includes('EMEKLILIK');
}

// BES kategori chip'leri — TEFAS/BEFAS gruplandırması
const BES_CATEGORIES = [
  'Tümü',
  'Değişken',
  'Hisse Senedi',
  'Katılım',
  'Standart',
  'OKS Standart',
  'Altın',
  'Para Piyasası',
] as const;
type BesCategoryChip = typeof BES_CATEGORIES[number];

function matchBesCategory(f: FundPerformance, chip: BesCategoryChip): boolean {
  if (chip === 'Tümü') return true;
  const c = (f.category ?? '').toString().toLocaleUpperCase('tr-TR');
  const n = (f.name ?? '').toLocaleUpperCase('tr-TR');
  const target = chip.toLocaleUpperCase('tr-TR');
  return c.includes(target) || n.includes(target);
}

export function BesFundsPage() {
  const [funds, setFunds] = useState<FundPerformance[]>([]);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedFailed, setFeedFailed] = useState(false);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<BesCategoryChip>('Tümü');
  const [befasOnly, setBefasOnly] = useState(false);
  const [tab, setTab] = useState<Tab>('getiri');
  const [sortKey, setSortKey] = useState<SortKey>('year');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadFundsAsPerformanceDetailed()
      .then((r) => {
        if (!alive) return;
        if (r.ok && r.funds && r.feed) {
          setFunds(r.funds.filter(isBesFund));
          setFeedUpdatedAt(r.feed.updatedAt);
        } else {
          setFeedFailed(true);
        }
      })
      .catch(() => alive && setFeedFailed(true))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return funds.filter((f) => {
      if (!matchBesCategory(f, category)) return false;
      if (befasOnly && f.tefasOpen === false) return false;
      if (q) {
        const hay = `${f.code} ${f.name ?? ''}`.toLocaleLowerCase('tr-TR');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [funds, search, category, befasOnly]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === 'code') { av = a.code; bv = b.code; }
      else {
        av = (a[sortKey as keyof FundPerformance] as number | undefined) ?? -Infinity;
        bv = (b[sortKey as keyof FundPerformance] as number | undefined) ?? -Infinity;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  return (
    <>
      <SeoHead
        title="BES Fonları — Bireysel Emeklilik Sistemi"
        description="BES fonlarının güncel fiyat, getiri ve karşılaştırma verilerini InvestliQ ile takip edin."
      />
      <PageHeader
        title="BES Fonları"
        subtitle="Bireysel Emeklilik Sistemi fonlarını karşılaştırın"
        actions={feedUpdatedAt ? <LiveBadge label={formatRelative(feedUpdatedAt)} /> : undefined}
      />

      {/* Filtre satırı */}
      <div className="mb-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Fon kodu veya adı ile ara..."
            className="w-full h-8 pl-8 pr-3 rounded-md bg-bg-soft border border-border text-xs text-slate-100 placeholder:text-slate-500 focus:border-accent/50 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setBefasOnly((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 h-8 rounded-md text-[11px] font-medium border transition',
            befasOnly
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-border bg-bg-soft text-slate-400 hover:text-slate-200',
          )}
        >
          {befasOnly ? <Check size={11} /> : <X size={11} />} BEFAS Açık
        </button>
      </div>

      {/* Kategori chip'ler */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {BES_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              'px-2.5 h-7 rounded-md text-[11px] font-medium transition',
              category === c
                ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                : 'bg-bg-soft text-slate-400 hover:text-slate-200 hover:bg-bg-card',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="mb-3 border-b border-border">
        <div className="flex gap-4">
          {(['getiri', 'buyukluk'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'py-2 text-xs font-medium border-b-2 transition -mb-px',
                tab === t
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-500 hover:text-slate-300',
              )}
            >
              {t === 'getiri' ? '📈 Getiri' : '💰 Büyüklük'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={8} />
      ) : feedFailed ? (
        <EmptyState
          icon={<AlertCircle size={28} />}
          title="Veri yüklenemedi"
          description="TEFAS feed'i şu an erişilemiyor. Kısa süre sonra tekrar deneyin."
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<Landmark size={28} />}
          title={funds.length === 0 ? 'BES fonları henüz veri feed\'inde yok' : 'Filtreye uyan fon bulunamadı'}
          description={
            funds.length === 0
              ? 'TEFAS scraper şu an sadece Yatırım Fonlarını kapsıyor. BES (Bireysel Emeklilik) fonları için ayrı bir feed eklenmesi gerekiyor — sonraki güncellemede aktif olacak. BEFAS.org.tr\'den güncel BES verilerine erişebilirsiniz.'
              : 'Farklı bir kategori veya arama terimi deneyin.'
          }
        />
      ) : (
        <>
          <div className="mb-2 text-[11px] text-slate-500">
            {sorted.length} BES fonu {category !== 'Tümü' ? `· Kategori: ${category}` : ''}
            {befasOnly ? ' · Sadece BEFAS Açık' : ''}
          </div>
          <DoubleScrollTable>
            <table className="min-w-[1100px] w-full text-xs">
              <thead className="bg-bg-soft/60 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left px-2.5 py-2 w-[3rem]">#</th>
                  <SortableTh label="Fon" k="code" active={sortKey} dir={sortDir} onClick={handleSort} align="left" />
                  <th className="text-left px-2.5 py-2">Kategori</th>
                  <th className="text-center px-2.5 py-2 w-[4rem]">BEFAS</th>
                  {tab === 'getiri' ? (
                    <>
                      <th className="text-right px-2.5 py-2">Fiyat</th>
                      <SortableTh label="1G" k="day" active={sortKey} dir={sortDir} onClick={handleSort} />
                      <SortableTh label="1H" k="week" active={sortKey} dir={sortDir} onClick={handleSort} />
                      <SortableTh label="1A" k="month" active={sortKey} dir={sortDir} onClick={handleSort} />
                      <SortableTh label="3A" k="threeMonth" active={sortKey} dir={sortDir} onClick={handleSort} />
                      <SortableTh label="6A" k="sixMonth" active={sortKey} dir={sortDir} onClick={handleSort} />
                      <SortableTh label="YBB" k="ytd" active={sortKey} dir={sortDir} onClick={handleSort} />
                      <SortableTh label="1Y" k="year" active={sortKey} dir={sortDir} onClick={handleSort} />
                      <SortableTh label="3Y" k="threeYear" active={sortKey} dir={sortDir} onClick={handleSort} />
                    </>
                  ) : (
                    <>
                      <th className="text-right px-2.5 py-2">Fiyat</th>
                      <th className="text-right px-2.5 py-2">Kategori</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 200).map((f, i) => (
                  <tr key={f.code} className="border-t border-border/40 hover:bg-bg-soft/50">
                    <td className="px-2.5 py-1.5 text-slate-500 tabular-nums">{i + 1}</td>
                    <td className="px-2.5 py-1.5">
                      <Link to={`/fund/${f.code}`} className="font-mono font-semibold text-slate-100 hover:text-accent">
                        {f.code}
                      </Link>
                      {f.name && (
                        <div className="text-[10px] text-slate-500 truncate max-w-[220px]" title={f.name}>{f.name}</div>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-slate-300">{f.category}</td>
                    <td className="px-2.5 py-1.5 text-center">
                      {f.tefasOpen === false
                        ? <X size={12} className="mx-auto text-slate-500" />
                        : <Check size={12} className="mx-auto text-success" />}
                    </td>
                    {tab === 'getiri' ? (
                      <>
                        <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-200">
                          {f.nav != null ? f.nav.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '—'}
                        </td>
                        <ReturnCell v={f.day} />
                        <ReturnCell v={f.week} />
                        <ReturnCell v={f.month} />
                        <ReturnCell v={f.threeMonth} />
                        <ReturnCell v={f.sixMonth} />
                        <ReturnCell v={f.ytd} />
                        <ReturnCell v={f.year} />
                        <ReturnCell v={f.threeYear ?? null} />
                      </>
                    ) : (
                      <>
                        <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-200">
                          {f.nav != null ? f.nav.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '—'}
                        </td>
                        <td className="px-2.5 py-1.5 text-right text-slate-400">{f.category}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </DoubleScrollTable>
          {sorted.length > 200 && (
            <div className="mt-2 text-[11px] text-slate-500 text-center">
              İlk 200 fon gösteriliyor · Toplam {sorted.length} sonuç
            </div>
          )}
        </>
      )}
    </>
  );
}

function SortableTh({
  label, k, active, dir, onClick, align = 'right',
}: {
  label: string;
  k: SortKey;
  active: SortKey;
  dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const isActive = active === k;
  return (
    <th
      onClick={() => onClick(k)}
      className={cn(
        'cursor-pointer select-none px-2.5 py-2 whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <span className={cn('inline-flex items-center gap-1', isActive && 'text-accent')}>
        {label}
        <ArrowUpDown size={9} className={cn(!isActive && 'opacity-40')} />
        {isActive && <span className="text-[9px]">{dir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}

function ReturnCell({ v }: { v: number | null | undefined }) {
  if (v == null || !Number.isFinite(v)) {
    return <td className="px-2.5 py-1.5 text-right text-slate-600 tabular-nums">—</td>;
  }
  const positive = v >= 0;
  return (
    <td className={cn(
      'px-2.5 py-1.5 text-right tabular-nums',
      positive ? 'text-success' : 'text-danger',
    )}>
      {positive ? '+' : ''}{v.toFixed(2)}%
    </td>
  );
}

export default BesFundsPage;
