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
import { Search, ArrowUpDown, Landmark, AlertCircle, RefreshCw } from 'lucide-react';
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

// BES fonu tespiti — SIKI (source of truth backend):
//   1) befasOpen === true (Takasbank BEFAS Excel listesinde ise BEFAS ürünüdür)
//   2) VEYA category === 'Emeklilik' (scraper EMK fetch'inden geliyorsa)
// Isim substring "EMEKLİLİK" YAPILMAZ — çünkü Serbest kategorideki
// "İŞ PORTFÖY ANADOLU HAYAT EMEKLİLİK SERBEST" gibi fonlar BEFAS ürünü DEĞİL;
// karsi kurulu emeklilik sirketinin bireysel fonu değil, hayat sigortasi urunu.
// Ayrica 'BES' substring'i 'SERBEST' icinde de match ediyor (SE-R-B-E-S-T).
function isBesFund(f: FundPerformance): boolean {
  if (f.befasOpen === true) return true;
  const c = (f.category ?? '').toString();
  return c === 'Emeklilik';
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
  // Öncelik besKategori (EGM/BEFAS alt kategorisi), yoksa fon adi (KATILIM STANDART vs.)
  const bk = (f.besKategori ?? '').toLocaleUpperCase('tr-TR');
  const n = (f.name ?? '').toLocaleUpperCase('tr-TR');
  const target = chip.toLocaleUpperCase('tr-TR');
  return bk.includes(target) || n.includes(target);
}

export function BesFundsPage() {
  const [funds, setFunds] = useState<FundPerformance[]>([]);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedFailed, setFeedFailed] = useState(false);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<BesCategoryChip>('Tümü');
  const [founder, setFounder] = useState<string>('Tümü'); // Kurucu filter
  const [sortKey, setSortKey] = useState<SortKey>('year');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Kullanici retry butonuna basinca useEffect'i tekrar tetiklemek icin counter.
  const [retryTick, setRetryTick] = useState(0);
  // Detayli hata mesaji (feedFailed=true iken)
  const [failureDetail, setFailureDetail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFeedFailed(false);
    setFailureDetail(null);

    /**
     * BES fonu yukleme stratejisi (2-adim):
     *   1) Ana tefas.json feed'inden BES fonlarini filtrele
     *   2) Feed'de BES fonu yoksa (Python cron henuz calismamis olabilir),
     *      /api/befas/funds CF Function'undan on-demand cek (TEFAS live).
     * Bu sayede BES sayfasi haftalik Python cron'una bagimli kalmaz.
     * Console'a debug log yaziyor — DevTools'tan takip edilebilir.
     */
    (async () => {
      try {
        const feedRes = await loadFundsAsPerformanceDetailed();
        if (!alive) return;
        let besFundsFromFeed: FundPerformance[] = [];
        if (feedRes.ok && feedRes.funds && feedRes.feed) {
          besFundsFromFeed = feedRes.funds.filter(isBesFund);
          setFeedUpdatedAt(feedRes.feed.updatedAt);
          console.info(`[bes] tefas.json: ${feedRes.funds.length} toplam, ${besFundsFromFeed.length} BES fonu`);
        } else {
          console.warn('[bes] tefas.json feed yuklenemedi:', feedRes.error);
        }

        if (besFundsFromFeed.length > 0) {
          setFunds(besFundsFromFeed);
          return;
        }

        // Fallback: CF Function on-demand fetch (force=1 -> cache bypass, taze veri)
        console.info('[bes] Feed\'de BES yok → /api/befas/funds fallback deneniyor...');
        try {
          const r = await fetch(`/api/befas/funds?t=${Date.now()}`);
          console.info(`[bes] CF Function status: ${r.status}`);
          if (!r.ok) {
            const text = await r.text().catch(() => '');
            if (alive) {
              setFeedFailed(true);
              setFailureDetail(`CF Function HTTP ${r.status}${text ? ' — ' + text.slice(0, 200) : ''}`);
            }
            return;
          }
          const data = await r.json() as {
            ok: boolean;
            updatedAt: string;
            count: number;
            funds: Array<{
              code: string; name: string;
              category: 'Emeklilik'; besKategori: string;
              founder?: string;
              tefasOpen: false; befasOpen: true;
              nav: number | null;
              returns: {
                '1d'?: number | null; '1w'?: number | null;
                '1m'?: number | null; '3m'?: number | null;
                '6m'?: number | null; ytd?: number | null; '1y'?: number | null;
              };
            }>;
          };
          if (!alive) return;
          console.info(`[bes] CF Function response: ok=${data.ok}, count=${data.count ?? data.funds?.length}`);
          if (!data.ok || !Array.isArray(data.funds) || data.funds.length === 0) {
            setFeedFailed(true);
            setFailureDetail('CF Function boş veri döndürdü — TEFAS geçici olarak yanıt vermiyor olabilir.');
            return;
          }
          const mapped: FundPerformance[] = data.funds.map((f) => ({
            code: f.code,
            name: f.name,
            category: 'Emeklilik' as const,
            tefas: false,
            tefasOpen: false,
            befasOpen: true,
            founder: f.founder,
            besKategori: f.besKategori,
            nav: f.nav ?? undefined,
            navDate: undefined,
            day: f.returns['1d'] ?? NaN,
            week: f.returns['1w'] ?? NaN,
            month: f.returns['1m'] ?? NaN,
            threeMonth: f.returns['3m'] ?? NaN,
            sixMonth: f.returns['6m'] ?? NaN,
            ytd: f.returns.ytd ?? NaN,
            year: f.returns['1y'] ?? NaN,
          }));
          setFunds(mapped);
          setFeedUpdatedAt(data.updatedAt);
        } catch (e) {
          console.error('[bes] CF Function fetch hata:', e);
          if (alive) {
            setFeedFailed(true);
            setFailureDetail(e instanceof Error ? e.message : String(e));
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [retryTick]);

  // Kurucu (founder) listesi — dropdown icin unique + alfabetik sirali
  const founders = useMemo(() => {
    const set = new Set<string>();
    for (const f of funds) if (f.founder) set.add(f.founder);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [funds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return funds.filter((f) => {
      if (!matchBesCategory(f, category)) return false;
      if (founder !== 'Tümü' && f.founder !== founder) return false;
      if (q) {
        const hay = `${f.code} ${f.name ?? ''} ${f.founder ?? ''}`.toLocaleLowerCase('tr-TR');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [funds, search, category, founder]);

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

      {/* Filtre satırı: arama + kurucu dropdown */}
      <div className="mb-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Fon kodu, adı veya kurucu ile ara..."
            className="w-full h-8 pl-8 pr-3 rounded-md bg-bg-soft border border-border text-xs text-slate-100 placeholder:text-slate-500 focus:border-accent/50 focus:outline-none"
          />
        </div>
        {founders.length > 0 && (
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Kurucu:
            </label>
            <select
              value={founder}
              onChange={(e) => setFounder(e.target.value)}
              className="h-8 px-2 rounded-md bg-bg-soft border border-border text-xs text-slate-100 focus:border-accent/50 focus:outline-none max-w-[260px]"
              title="Kurucu emeklilik sirketine gore filtrele"
            >
              <option value="Tümü">Tümü ({funds.length})</option>
              {founders.map((fn) => {
                const count = funds.filter((f) => f.founder === fn).length;
                return (
                  <option key={fn} value={fn}>
                    {fn} ({count})
                  </option>
                );
              })}
            </select>
            {founder !== 'Tümü' && (
              <button
                type="button"
                onClick={() => setFounder('Tümü')}
                className="text-[11px] text-slate-500 hover:text-danger"
                title="Kurucu filtresini temizle"
              >
                ✕
              </button>
            )}
          </div>
        )}
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

      {loading ? (
        <TableSkeleton rows={8} />
      ) : feedFailed ? (
        <EmptyState
          icon={<AlertCircle size={28} />}
          title="BES verisi geçici olarak alınamadı"
          description={
            <span className="block text-slate-400">
              Ana feed'de BES fonu yok ve canlı TEFAS proxy'si de yanıt vermedi.
              {failureDetail && (
                <span className="mt-2 block rounded bg-bg-soft/60 px-2 py-1 font-mono text-[10px] text-slate-500">
                  {failureDetail}
                </span>
              )}
              <span className="mt-3 block text-[11px] text-slate-500">
                Genellikle bu, TEFAS scraper'ın haftalık cron'unun henüz çalışmadığı anlamına gelir.
                {' '}
                <a
                  href="https://github.com/irfansari57-sketch/hanefinans/actions/workflows/tefas-fetch.yml"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  "TEFAS Fund Fetch" workflow'unu manuel tetikleyebilirsiniz →
                </a>
              </span>
            </span>
          }
          action={
            <button
              type="button"
              onClick={() => setRetryTick((t) => t + 1)}
              className="btn-primary"
            >
              <RefreshCw size={14} /> Tekrar Dene
            </button>
          }
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<Landmark size={28} />}
          title={funds.length === 0 ? 'BES fonları henüz veri feed\'inde yok' : 'Filtreye uyan fon bulunamadı'}
          description={
            funds.length === 0
              ? 'BES fon listesi şu anda çekilemedi. Genellikle 1-2 dakika içinde CF cache tazelenir — sayfayı yenilemeyi deneyin. Sorun devam ederse egm.org.tr/befas/fon-listesi üzerinden erişebilirsiniz.'
              : 'Farklı bir kategori veya arama terimi deneyin.'
          }
        />
      ) : (
        <>
          <div className="mb-2 text-[11px] text-slate-500">
            {sorted.length} BES fonu
            {category !== 'Tümü' ? ` · Kategori: ${category}` : ''}
            {founder !== 'Tümü' ? ` · Kurucu: ${founder}` : ''}
          </div>
          <DoubleScrollTable>
            <table className="min-w-[1000px] w-full text-xs">
              <thead className="bg-bg-soft/60 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left px-2.5 py-2 w-[3rem]">#</th>
                  <SortableTh label="Fon" k="code" active={sortKey} dir={sortDir} onClick={handleSort} align="left" />
                  <th className="text-left px-2.5 py-2">Kategori</th>
                  <th className="text-right px-2.5 py-2">Fiyat</th>
                  <SortableTh label="1G" k="day" active={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="1H" k="week" active={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="1A" k="month" active={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="3A" k="threeMonth" active={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="6A" k="sixMonth" active={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="YBB" k="ytd" active={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="1Y" k="year" active={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="3Y" k="threeYear" active={sortKey} dir={sortDir} onClick={handleSort} />
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
                        <div className="text-[10px] text-slate-500 truncate max-w-[280px]" title={f.name}>{f.name}</div>
                      )}
                      {f.founder && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFounder(f.founder === founder ? 'Tümü' : (f.founder ?? 'Tümü'));
                          }}
                          className="mt-0.5 text-[9px] text-accent/70 hover:text-accent hover:underline truncate max-w-[280px] text-left block"
                          title={`${f.founder} — bu kurucunun tum BES fonlarini goster`}
                        >
                          🏛 {f.founder}
                        </button>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-slate-300">
                      {(() => {
                        // EGM/BEFAS alt kategori tercih; yoksa "Emeklilik" fallback
                        const label = f.besKategori && f.besKategori.trim().length > 0
                          ? f.besKategori
                          : f.category;
                        return <CategoryChip label={label} />;
                      })()}
                    </td>
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

/**
 * CategoryChip — BES fon alt kategori chip'i (renkli, kompakt).
 * FVT tarzi renk kodlamasiyla goze hitap eder.
 */
function CategoryChip({ label }: { label: string }) {
  const upper = label.toLocaleUpperCase('tr-TR');
  const tone =
    upper.includes('HİSSE SENED')      ? 'bg-danger/15 text-danger border-danger/30'
    : upper.includes('KATILIM')        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : upper.includes('ALTIN')          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    : upper.includes('OKS')            ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
    : upper.includes('PARA PİYAS')     ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
    : upper.includes('KIRA SERTIFIK') || upper.includes('KIRA SERTİFİK')
                                       ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
    : upper.includes('DEĞİŞKEN') || upper.includes('DEGISKEN')
                                       ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
    : upper.includes('STANDART')       ? 'bg-slate-500/15 text-slate-200 border-slate-500/30'
    :                                    'bg-accent/15 text-accent border-accent/30';
  return (
    <span className={cn('inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-medium', tone)}>
      {label}
    </span>
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
