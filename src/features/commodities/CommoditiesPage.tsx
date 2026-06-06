import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gem, RefreshCw, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { fetchIndexYahoo, ouncePriceToGramTRY } from '@/data/api/yahoo';
import { loadMacroAll } from '@/data/services';
import { fetchSpotMetalsMetalsApi } from '@/data/api/metalsapi';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';

interface CommodityRow {
  key: string;
  label: string;
  symbolYahoo: string;
  unit: string;
  priceUsd?: number;
  priceTRY?: number;
  changePct?: number;
  category: 'Kıymetli Maden' | 'Enerji' | 'Tarım' | 'Endüstri';
  description?: string;
}

const COMMODITIES: Omit<CommodityRow, 'priceUsd' | 'changePct' | 'priceTRY'>[] = [
  { key: 'gold',     label: 'Altın',            symbolYahoo: 'GC=F', unit: '$ / ons', category: 'Kıymetli Maden', description: 'Altın vadeli kontratı (COMEX)' },
  { key: 'silver',   label: 'Gümüş',            symbolYahoo: 'SI=F', unit: '$ / ons', category: 'Kıymetli Maden', description: 'Gümüş vadeli kontratı' },
  { key: 'platinum', label: 'Platin',           symbolYahoo: 'PL=F', unit: '$ / ons', category: 'Kıymetli Maden' },
  { key: 'palladium',label: 'Paladyum',         symbolYahoo: 'PA=F', unit: '$ / ons', category: 'Kıymetli Maden' },
  { key: 'brent',    label: 'Brent Petrol',     symbolYahoo: 'BZ=F', unit: '$ / varil', category: 'Enerji', description: 'Kuzey Denizi Brent' },
  { key: 'wti',      label: 'WTI Ham Petrol',   symbolYahoo: 'CL=F', unit: '$ / varil', category: 'Enerji', description: 'West Texas Intermediate' },
  { key: 'natgas',   label: 'Doğal Gaz',        symbolYahoo: 'NG=F', unit: '$ / MMBtu', category: 'Enerji', description: 'Henry Hub' },
  { key: 'copper',   label: 'Bakır',            symbolYahoo: 'HG=F', unit: '$ / lb', category: 'Endüstri', description: 'COMEX bakır' },
  { key: 'wheat',    label: 'Buğday',           symbolYahoo: 'ZW=F', unit: '$ / bushel', category: 'Tarım' },
  { key: 'corn',     label: 'Mısır',            symbolYahoo: 'ZC=F', unit: '$ / bushel', category: 'Tarım' },
];

// Module-level memo cache — sayfa değişimlerinde yeniden fetch'i önler
const COMMODITIES_MEMO_TTL_MS = 5 * 60_000;
interface CommoditiesMemo {
  fetchedAt: number;
  rows: CommodityRow[];
  usdTry: number | null;
  updatedAt: number;
}
let commoditiesMemo: CommoditiesMemo | null = null;

export function CommoditiesPage() {
  const [rows, setRows] = useState<CommodityRow[]>(() => commoditiesMemo?.rows ?? COMMODITIES);
  const [usdTry, setUsdTry] = useState<number | null>(() => commoditiesMemo?.usdTry ?? null);
  const [loading, setLoading] = useState(() => !commoditiesMemo);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(() => commoditiesMemo?.updatedAt);

  const refresh = async () => {
    setLoading(true);
    try {
      // USD/TRY + Panel ile aynı macro veri (GoldAPI/MetalsAPI kaynaklı Ons metal değerleri dahil)
      // + Paladyum (XPD) için MetalsAPI ek çağrısı (Yahoo PA=F yüzde değişimi hatalı geliyor)
      const [macroR, metalsApiData] = await Promise.all([
        loadMacroAll(),
        fetchSpotMetalsMetalsApi(),
      ]);
      const u = macroR.data.find((m) => m.key === 'USD/TRY')?.value ?? null;
      setUsdTry(u);

      // Macro'dan Ons Altın/Gümüş/Platin haritası — Panel ile birebir tutarlı
      // (loadMacroAll içinde GoldAPI → MetalsAPI → backend → TD → Yahoo futures chain'i)
      const macroByKey = new Map<string, typeof macroR.data[number]>(
        macroR.data.map((m) => [m.key as string, m]),
      );
      const metalKeyMap: Record<string, string> = {
        gold: 'Ons Altın',
        silver: 'Ons Gümüş',
        platinum: 'Ons Platin',
      };

      // Tüm emtia fiyatlarını paralel çek
      const results = await Promise.all(
        COMMODITIES.map(async (c) => {
          // Kıymetli Maden ise önce macro'dan al (Panel ile uyumlu),
          // gelmezse Yahoo futures'a düş.
          const macroKey = metalKeyMap[c.key];
          if (macroKey) {
            const mm = macroByKey.get(macroKey);
            if (mm && Number.isFinite(mm.value) && (mm.value as number) > 0) {
              const priceUsd = mm.value;
              const priceTRY = u ? ouncePriceToGramTRY(priceUsd, u) : undefined;
              return {
                ...c,
                priceUsd,
                changePct: mm.changePct,
                priceTRY,
              };
            }
          }
          // Diğer emtialar (Paladyum, Brent, WTI, Doğal Gaz, Bakır, Buğday, Mısır) → Yahoo futures
          const yResult = await fetchIndexYahoo(c.symbolYahoo);
          if (!yResult) return { ...c };
          const priceUsd = yResult.value;
          const priceTRY = c.category === 'Kıymetli Maden' && u
            ? ouncePriceToGramTRY(priceUsd, u)
            : undefined;
          return {
            ...c,
            priceUsd,
            changePct: yResult.changePct,
            priceTRY,
          };
        }),
      );
      setRows(results);
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  // Memo cache sync — state değiştiğinde memo'yu güncelle
  useEffect(() => {
    if (rows.some((r) => r.priceUsd != null) && updatedAt) {
      commoditiesMemo = {
        fetchedAt: Date.now(),
        rows,
        usdTry,
        updatedAt,
      };
    }
  }, [rows, usdTry, updatedAt]);

  useEffect(() => {
    // Memo taze ise refresh'i atla
    const memoAge = commoditiesMemo ? Date.now() - commoditiesMemo.fetchedAt : Infinity;
    if (memoAge < COMMODITIES_MEMO_TTL_MS) {
      setLoading(false);
      const id = setInterval(refresh, 5 * 60_000);
      return () => clearInterval(id);
    }
    refresh();
    const id = setInterval(refresh, 5 * 60_000); // 5 dakikada bir
    return () => clearInterval(id);
  }, []);

  const byCategory = (cat: CommodityRow['category']) => rows.filter((r) => r.category === cat);

  return (
    <>
      <SeoHead title="Emtia Piyasaları" description="Altın, gümüş, petrol, doğalgaz ve diğer emtialar — canlı fiyat ve günlük analiz." path="/emtia" />

      <PageHeader
        title="Emtialar"
        subtitle="Altın, gümüş, petrol ve diğer emtialar için canlı uluslararası fiyatlar (Yahoo Finance)."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading} />
            <button className="btn-secondary" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        }
      />

      <div className="space-y-5">
        <CategorySection title="Kıymetli Madenler" tone="warning" rows={byCategory('Kıymetli Maden')} loading={loading} usdTry={usdTry} />
        <CategorySection title="Enerji" tone="danger" rows={byCategory('Enerji')} loading={loading} usdTry={usdTry} />
        <CategorySection title="Endüstriyel Metaller" tone="accent" rows={byCategory('Endüstri')} loading={loading} usdTry={usdTry} />
        <CategorySection title="Tarım Ürünleri" tone="success" rows={byCategory('Tarım')} loading={loading} usdTry={usdTry} />
      </div>

      <p className="mt-5 text-[11px] text-slate-500">
        Fiyatlar uluslararası vadeli işlem kontratlarından (CME/COMEX/ICE) alınmıştır. Kıymetli madenlerin gram TRY karşılığı USD/TRY kuru ile hesaplanır. 5 dakikada bir otomatik güncellenir.
      </p>
    </>
  );
}

function CategorySection({
  title, tone, rows, loading, usdTry,
}: {
  title: string;
  tone: 'warning' | 'danger' | 'accent' | 'success';
  rows: CommodityRow[];
  loading: boolean;
  usdTry: number | null;
}) {
  const toneColor = {
    warning: 'text-warning',
    danger: 'text-danger',
    accent: 'text-accent',
    success: 'text-success',
  }[tone];

  if (rows.length === 0) return null;

  return (
    <section className="glass-card p-4">
      <h2 className={cn('mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider', toneColor)}>
        <Gem size={14} /> {title}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <CommodityCard key={r.key} row={r} loading={loading} usdTry={usdTry} />
        ))}
      </div>
    </section>
  );
}

function CommodityCard({ row, loading, usdTry }: { row: CommodityRow; loading: boolean; usdTry: number | null }) {
  if (loading && row.priceUsd == null) {
    return <Skeleton variant="rect" height={88} />;
  }
  if (row.priceUsd == null) {
    return (
      <div className="rounded-lg border border-border bg-bg-card p-3 text-xs text-slate-500">
        {row.label}: veri alınamadı
      </div>
    );
  }
  const change = row.changePct ?? 0;
  const tone = change >= 0 ? 'text-success' : 'text-danger';

  return (
    <Link
      to={`/emtia/${encodeURIComponent(row.symbolYahoo)}`}
      className="group block rounded-lg border border-border bg-bg-card p-3 transition-all hover:border-accent/40 hover:shadow-md hover:shadow-accent/10 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100">{row.label}</div>
          {row.description && <div className="mt-0.5 text-[10px] text-slate-500">{row.description}</div>}
        </div>
        <ChevronRight size={11} className="shrink-0 text-slate-500 opacity-0 transition group-hover:opacity-100" />
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <div>
          <span className="text-base font-bold tabular-nums text-slate-100">
            ${row.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </span>
          <span className="ml-1 text-[10px] text-slate-500">{row.unit}</span>
        </div>
        <span className={cn('text-xs font-medium tabular-nums', tone)}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>
      {row.priceTRY != null && (
        <div className="mt-1 text-[11px] text-accent">
          ≈ {row.priceTRY.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺ / gram
        </div>
      )}
    </Link>
  );
}
