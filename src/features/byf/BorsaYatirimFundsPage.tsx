/**
 * BYF (Borsa Yatırım Fonları / ETF) sayfası.
 *
 * Route: /byf
 * Data kaynağı: /api/yahoo/snapshot (loadStocks) — BIST'te işlem gören BYF sembolleri.
 * Fon detayı: /stock/:symbol (BYF de BIST sembolü olduğu için hisse pipeline reuse).
 *
 * BIST'te işlem gören BYF listesi Ak Portföy, QNB Finans, İş Portföy, Osmanlı, Ziraat vs.
 * ihraççılardan derlenmiş. Statik liste — yeni BYF çıktıkça güncellenir.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowUpDown, TrendingUp } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { DoubleScrollTable } from '@/components/ui/DoubleScrollTable';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { loadStocks } from '@/data/services';
import type { Stock } from '@/data/types';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';

// BIST'te işlem gören BYF sembolleri — 13 Eyl 2026 itibariyle 27 fonluk tam liste.
// Kaynak: Fintables BYF listesi. Yeni BYF çıktıkça buraya eklenir.
const BYF_LIST: Array<{ symbol: string; name: string; category: BYFCategory; issuer: string }> = [
  // Ak Portföy
  { symbol: 'APBDLF', name: 'Ak Portföy BIST Banka Dışı Likit 10 Endeksi', category: 'Hisse Endeksi', issuer: 'Ak Portföy' },
  { symbol: 'APGLDF', name: 'Ak Portföy Altın',                              category: 'Altın',         issuer: 'Ak Portföy' },
  { symbol: 'APLIBF', name: 'Ak Portföy BIST Likit Banka Endeksi',           category: 'Hisse Endeksi', issuer: 'Ak Portföy' },
  { symbol: 'APMDLF', name: 'Ak Portföy BIST Orta Ölçekli Endeksi',          category: 'Hisse Endeksi', issuer: 'Ak Portföy' },
  { symbol: 'APX30F', name: 'Ak Portföy BIST 30 Endeksi',                     category: 'Hisse Endeksi', issuer: 'Ak Portföy' },
  // QNB Finans / QNB Portföy
  { symbol: 'GLDTRF', name: 'QNB Portföy Altın Katılım',                     category: 'Altın',         issuer: 'QNB Portföy' },
  { symbol: 'GMSTRF', name: 'QNB Portföy Gümüş Katılım',                     category: 'Gümüş',         issuer: 'QNB Portföy' },
  { symbol: 'QTEMZF', name: 'QNB Finans Temiz Enerji Endeksi',                category: 'Sürdürülebilirlik', issuer: 'QNB Portföy' },
  { symbol: 'USDTRF', name: 'QNB Portföy Amerikan Doları',                   category: 'Döviz',         issuer: 'QNB Portföy' },
  // İş Portföy
  { symbol: 'ISGLKF', name: 'İş Portföy Altın Katılım',                       category: 'Altın',         issuer: 'İş Portföy' },
  { symbol: 'ISMDLF', name: 'İş Portföy BIST Orta Ölçekli Endeksi',           category: 'Hisse Endeksi', issuer: 'İş Portföy' },
  { symbol: 'ISX30F', name: 'İş Portföy BIST 30 Endeksi',                     category: 'Hisse Endeksi', issuer: 'İş Portföy' },
  // Piramit / Neta Portföy
  { symbol: 'NPTLRF', name: 'Neta Portföy Likit Endeksi',                     category: 'Hisse Endeksi', issuer: 'Neta Portföy' },
  // Osmanlı Portföy
  { symbol: 'OPK30F', name: 'Osmanlı Portföy Katılım 30 Endeksi',             category: 'Katılım',       issuer: 'Osmanlı Portföy' },
  { symbol: 'OPT25F', name: 'Osmanlı Portföy BIST Temettü 25 Endeksi',        category: 'Temettü',       issuer: 'Osmanlı Portföy' },
  { symbol: 'OPTGYF', name: 'Osmanlı Portföy Kar Payı Ödeyen BIST GYO Endeksi', category: 'GYO',        issuer: 'Osmanlı Portföy' },
  { symbol: 'OPTLRF', name: 'Osmanlı Portföy Likit Endeksi',                  category: 'Hisse Endeksi', issuer: 'Osmanlı Portföy' },
  { symbol: 'OPX30F', name: 'Osmanlı Portföy BIST 30 Endeksi',                category: 'Hisse Endeksi', issuer: 'Osmanlı Portföy' },
  // Ziraat Portföy
  { symbol: 'Z30EAF', name: 'Ziraat Portföy BIST 30 Eşit Ağırlıklı',          category: 'Hisse Endeksi', issuer: 'Ziraat Portföy' },
  { symbol: 'Z30KEF', name: 'Ziraat Portföy Katılım 30 Eşit Ağırlıklı',       category: 'Katılım',       issuer: 'Ziraat Portföy' },
  { symbol: 'Z30KPF', name: 'Ziraat Portföy Katılım 30 Endeksi',              category: 'Katılım',       issuer: 'Ziraat Portföy' },
  { symbol: 'ZELOTF', name: 'Ziraat Portföy BIST 50-30 Endeksi',              category: 'Hisse Endeksi', issuer: 'Ziraat Portföy' },
  { symbol: 'ZGOLDF', name: 'Ziraat Portföy Altın Katılım',                   category: 'Altın',         issuer: 'Ziraat Portföy' },
  { symbol: 'ZPBDLF', name: 'Ziraat Portföy BIST Banka Dışı Likit 10',         category: 'Hisse Endeksi', issuer: 'Ziraat Portföy' },
  { symbol: 'ZPLIBF', name: 'Ziraat Portföy BIST Likit Banka Endeksi',         category: 'Hisse Endeksi', issuer: 'Ziraat Portföy' },
  { symbol: 'ZPT10F', name: 'Ziraat Portföy BIST Temettü 10 Endeksi',          category: 'Temettü',       issuer: 'Ziraat Portföy' },
  { symbol: 'ZPX30F', name: 'Ziraat Portföy BIST 30 Endeksi',                  category: 'Hisse Endeksi', issuer: 'Ziraat Portföy' },
];

type BYFCategory = 'Hisse Endeksi' | 'Katılım' | 'Altın' | 'Gümüş' | 'Döviz' | 'Temettü' | 'GYO' | 'Sürdürülebilirlik' | 'Tümü';

const CATEGORIES: BYFCategory[] = ['Tümü', 'Hisse Endeksi', 'Katılım', 'Altın', 'Gümüş', 'Döviz', 'Temettü', 'GYO', 'Sürdürülebilirlik'];

type SortKey = 'symbol' | 'price' | 'changePct';

export function BorsaYatirimFundsPage() {
  const [quotes, setQuotes] = useState<Record<string, Stock>>({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<BYFCategory>('Tümü');
  const [issuer, setIssuer] = useState<string>('Tümü');
  const [sortKey, setSortKey] = useState<SortKey>('changePct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    /**
     * BYF fiyat kaynagi zinciri:
     *   1. /api/byf/live — Fintables SSR HTML scrape (asil calisan kaynak,
     *      Yahoo BIST BYF ticker'larini tanimiyor, Is Yatirim CF Worker'dan bloklu)
     *   2. Yahoo Finance fallback (nadiren calisir ama denemeye deger)
     */
    (async () => {
      try {
        // Adim 1: /api/byf/live
        try {
          const r = await fetch(`/api/byf/live?t=${Date.now()}`);
          if (r.ok) {
            const j = await r.json() as {
              ok: boolean;
              funds: Array<{ code: string; price: number | null; changePct: number | null; lastUpdate: string | null }>;
            };
            if (j.ok && j.funds && j.funds.length > 0) {
              const map: Record<string, Stock> = {};
              for (const f of j.funds) {
                // Fintables kodlari .F'siz (APBDL), bizim listede F'li (APBDLF). Ikisini de mapleyelim.
                const withF = f.code + 'F';
                const stockShape: Stock = {
                  symbol: withF,
                  name: withF,
                  price: f.price ?? 0,
                  changePct: f.changePct ?? 0,
                  updatedAt: new Date().toISOString(),
                };
                map[withF] = stockShape;
                map[f.code] = stockShape; // ikinci alias
              }
              console.info(`[byf] Fintables live: ${j.funds.length} fon`);
              if (alive) {
                setQuotes(map);
                setUpdatedAt(new Date().toISOString());
              }
              return;
            }
          }
          console.warn('[byf] /api/byf/live bos veya fail');
        } catch (e) {
          console.warn('[byf] /api/byf/live exception:', e);
        }

        // Adim 2: Yahoo fallback (BYF ticker'lari genelde 404 doner, ama deneriz)
        const symbols = BYF_LIST.map((f) => f.symbol + '.IS');
        const { data } = await loadStocks(symbols);
        if (!alive) return;
        const map: Record<string, Stock> = {};
        data.forEach((s) => {
          const base = s.symbol.replace(/\.IS$/i, '');
          map[base] = s;
        });
        setQuotes(map);
        setUpdatedAt(new Date().toISOString());
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const issuers = useMemo(
    () => ['Tümü', ...Array.from(new Set(BYF_LIST.map((f) => f.issuer))).sort()],
    [],
  );

  const enriched = useMemo(() => {
    return BYF_LIST.map((f) => {
      const q = quotes[f.symbol];
      return {
        ...f,
        price: q?.price ?? null,
        changePct: q?.changePct ?? null,
      };
    });
  }, [quotes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return enriched.filter((f) => {
      if (category !== 'Tümü' && f.category !== category) return false;
      if (issuer !== 'Tümü' && f.issuer !== issuer) return false;
      if (q) {
        const hay = `${f.symbol} ${f.name}`.toLocaleLowerCase('tr-TR');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, category, issuer, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === 'symbol') { av = a.symbol; bv = b.symbol; }
      else {
        av = a[sortKey] ?? -Infinity;
        bv = b[sortKey] ?? -Infinity;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'symbol' ? 'asc' : 'desc'); }
  };

  return (
    <>
      <SeoHead
        title="Borsa Yatırım Fonları (BYF) — Canlı Fiyat ve Getiriler"
        description="BIST'te işlem gören Borsa Yatırım Fonlarının (ETF) canlı fiyatlarını, günlük değişimlerini InvestliQ ile takip edin."
      />
      <PageHeader
        title="Borsa Yatırım Fonları (BYF)"
        subtitle="BIST'te işlem gören ETF'lerin canlı fiyat ve günlük değişimleri"
        actions={updatedAt ? <LiveBadge label="Canlı" /> : undefined}
      />

      {/* Filtre satırı */}
      <div className="mb-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="BYF kodu veya adı ile ara..."
            className="w-full h-8 pl-8 pr-3 rounded-md bg-bg-soft border border-border text-xs text-slate-100 placeholder:text-slate-500 focus:border-accent/50 focus:outline-none"
          />
        </div>
        <select
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
          className="h-8 px-2 rounded-md bg-bg-soft border border-border text-xs text-slate-200 focus:border-accent/50 focus:outline-none"
        >
          {issuers.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      {/* Kategori chip'ler */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
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
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={28} />}
          title="Filtreye uyan BYF bulunamadı"
          description="Farklı bir kategori veya arama terimi deneyin."
        />
      ) : (
        <>
          <div className="mb-2 text-[11px] text-slate-500">
            {sorted.length} BYF · Kaynak: BIST canlı akışı
          </div>
          <DoubleScrollTable>
            <table className="min-w-[720px] w-full text-xs">
              <thead className="border-b border-border bg-bg-soft text-[10px] uppercase tracking-widest font-semibold text-slate-400 dark:text-slate-300">
                <tr>
                  <th className="px-2 py-2 text-left w-[2.5rem]">#</th>
                  <SortableTh label="Sembol" k="symbol" active={sortKey} dir={sortDir} onClick={handleSort} align="left" />
                  <th className="hidden sm:table-cell px-2 py-2 text-left">İhraççı / Kategori / Fon</th>
                  <SortableTh label="Fiyat" k="price" active={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="Değişim" k="changePct" active={sortKey} dir={sortDir} onClick={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => (
                  <tr key={f.symbol} className="border-b border-border/60 transition hover:bg-bg-card">
                    <td className="px-2 py-2 text-[11px] text-slate-500 tabular-nums">{i + 1}</td>
                    <td className="px-2 py-2">
                      <Link to={`/stock/${f.symbol}`} className="font-mono text-sm font-bold text-slate-100 hover:text-accent">
                        {f.symbol}
                      </Link>
                    </td>
                    <td className="hidden sm:table-cell px-2 py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CategoryChip cat={f.category as BYFCategory} />
                        <span className="truncate text-[12px] text-slate-200 max-w-[260px]" title={f.name}>{f.name}</span>
                        <span className="shrink-0 text-[10px] text-slate-500 truncate max-w-[140px]" title={f.issuer}>· {f.issuer}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-sm tabular-nums text-slate-200 whitespace-nowrap">
                      {f.price != null ? `₺${f.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <ReturnCell v={f.changePct} />
                  </tr>
                ))}
              </tbody>
            </table>
          </DoubleScrollTable>
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
    return <td className="px-2 py-2 text-right font-mono text-sm tabular-nums text-slate-500 whitespace-nowrap">—</td>;
  }
  const positive = v >= 0;
  return (
    <td className={cn(
      'px-2 py-2 text-right font-mono text-sm font-semibold tabular-nums whitespace-nowrap',
      positive ? 'text-success' : 'text-danger',
    )}>
      {positive ? '+' : ''}{v.toFixed(2)}%
    </td>
  );
}

const CATEGORY_COLORS: Record<BYFCategory, string> = {
  'Hisse Endeksi':      'bg-purple-500/15 text-purple-300 border-purple-500/25',
  'Katılım':            'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  'Altın':              'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  'Gümüş':              'bg-slate-400/15 text-slate-200 border-slate-400/25',
  'Döviz':              'bg-amber-500/15 text-amber-300 border-amber-500/25',
  'Temettü':            'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'GYO':                'bg-orange-500/15 text-orange-300 border-orange-500/25',
  'Sürdürülebilirlik':  'bg-teal-500/15 text-teal-300 border-teal-500/25',
  'Tümü':               'bg-slate-500/15 text-slate-300 border-slate-500/25',
};

function CategoryChip({ cat }: { cat: BYFCategory }) {
  const cls = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['Tümü'];
  return (
    <span className={cn('inline-block px-2 py-0.5 rounded text-[10px] font-medium border', cls)}>
      {cat}
    </span>
  );
}

export default BorsaYatirimFundsPage;
