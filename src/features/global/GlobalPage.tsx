import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe, RefreshCw, TrendingUp, TrendingDown, Flag, Gem, DollarSign, Activity, ExternalLink, Info,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { fetchIndexYahoo } from '@/data/api/yahoo';
import { cn } from '@/lib/utils';

interface IndexItem {
  symbol: string;
  label: string;
  /** Birim — emtia için (örn $/varil, $/ons). Endeksler için yok. */
  unit?: string;
  /** Bilgi notu — VIX/DXY/CDS gibi karmaşık göstergeler için kısa açıklama */
  note?: string;
}

interface IndexGroup {
  title: string;
  subtitle?: string;
  icon: typeof Globe;
  tone: 'accent' | 'success' | 'warning' | 'danger';
  items: IndexItem[];
}

const GROUPS: IndexGroup[] = [
  {
    title: 'ABD Endeksleri',
    icon: Flag,
    tone: 'accent',
    items: [
      { symbol: '^GSPC', label: 'S&P 500' },
      { symbol: '^DJI',  label: 'Dow Jones' },
      { symbol: '^IXIC', label: 'NASDAQ Composite' },
      { symbol: '^RUT',  label: 'Russell 2000' },
    ],
  },
  {
    title: 'Avrupa Endeksleri',
    icon: Globe,
    tone: 'accent',
    items: [
      { symbol: '^GDAXI', label: 'DAX (Almanya)' },
      { symbol: '^FTSE',  label: 'FTSE 100 (İngiltere)' },
      { symbol: '^FCHI',  label: 'CAC 40 (Fransa)' },
      { symbol: '^STOXX50E', label: 'Euro Stoxx 50' },
    ],
  },
  {
    title: 'Asya & Pasifik Endeksleri',
    icon: Globe,
    tone: 'accent',
    items: [
      { symbol: '^N225',     label: 'Nikkei 225 (Japonya)' },
      { symbol: '^HSI',      label: 'Hang Seng (Hong Kong)' },
      { symbol: '000001.SS', label: 'Shanghai Composite' },
      { symbol: '^AXJO',     label: 'ASX 200 (Avustralya)' },
    ],
  },
  {
    title: 'Emtialar',
    icon: Gem,
    tone: 'warning',
    items: [
      { symbol: 'BZ=F', label: 'Brent Petrol', unit: '$/varil' },
      { symbol: 'CL=F', label: 'WTI Petrol',   unit: '$/varil' },
      { symbol: 'GC=F', label: 'Altın (ons)',   unit: '$/ons' },
      { symbol: 'SI=F', label: 'Gümüş (ons)',   unit: '$/ons' },
      { symbol: 'NG=F', label: 'Doğal Gaz',     unit: '$/MMBtu' },
      { symbol: 'HG=F', label: 'Bakır',         unit: '$/lb' },
    ],
  },
  {
    title: 'Risk & Volatilite',
    subtitle: 'Korku endeksi, dolar gücü, Türkiye risk primi',
    icon: Activity,
    tone: 'danger',
    items: [
      { symbol: '^VIX', label: 'VIX', note: 'Korku Endeksi — S&P 500 30 gün öngörü volatilite' },
      { symbol: 'DX-Y.NYB', label: 'DXY', note: 'Dolar Endeksi — USD\'nin 6 ana para birimine karşı gücü' },
      { symbol: '^MOVE', label: 'MOVE', note: 'Bond Vol. Index — ABD tahvil piyasası volatilitesi' },
    ],
  },
];

// Türkiye CDS 5Y için Yahoo verisi yok. Investing.com referansı ile manuel kart gösteriyoruz.
const TURKEY_RISK_LINKS = [
  { label: 'Türkiye CDS 5Y', url: 'https://www.investing.com/rates-bonds/turkey-cds-5-yr-usd' },
  { label: 'Türkiye 10Y Tahvil', url: 'https://www.investing.com/rates-bonds/turkey-10-year-bond-yield' },
  { label: 'TR Risk Primi (worldgovernmentbonds)', url: 'http://www.worldgovernmentbonds.com/cds-historical-data/turkey/5-years/' },
];

interface QuoteState {
  loading: boolean;
  value?: number;
  changePct?: number;
  error?: boolean;
}

export function GlobalPage() {
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();

  const allSymbols = useMemo(
    () => GROUPS.flatMap((g) => g.items.map((i) => i.symbol)),
    [],
  );

  const refresh = async () => {
    setLoading(true);
    // İlk paint: hepsini loading
    setQuotes(Object.fromEntries(allSymbols.map((s) => [s, { loading: true }])));

    // Paralel fetch (Yahoo proxy ~20 sembol için kolaylıkla dayanır)
    await Promise.all(
      allSymbols.map(async (sym) => {
        try {
          const r = await fetchIndexYahoo(sym);
          setQuotes((q) => ({
            ...q,
            [sym]: r
              ? { loading: false, value: r.value, changePct: r.changePct }
              : { loading: false, error: true },
          }));
        } catch {
          setQuotes((q) => ({ ...q, [sym]: { loading: false, error: true } }));
        }
      }),
    );
    setUpdatedAt(Date.now());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3 * 60_000); // 3 dakikada bir
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <PageHeader
        title="Global Piyasalar"
        subtitle="ABD, Avrupa, Asya endeksleri + emtia + dolar endeksi + volatilite — tek sayfada anlık takip."
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
        {GROUPS.map((group) => (
          <section key={group.title} className="glass-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className={cn(
                'grid h-7 w-7 place-items-center rounded-md',
                group.tone === 'accent' ? 'bg-accent/15 text-accent' :
                group.tone === 'success' ? 'bg-success/15 text-success' :
                group.tone === 'warning' ? 'bg-warning/15 text-warning' :
                'bg-danger/15 text-danger',
              )}>
                <group.icon size={14} />
              </span>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">{group.title}</h2>
              {group.subtitle && (
                <span className="text-[11px] text-slate-500">— {group.subtitle}</span>
              )}
            </div>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {group.items.map((item) => (
                <QuoteCard key={item.symbol} item={item} state={quotes[item.symbol]} />
              ))}
            </div>
          </section>
        ))}

        {/* Türkiye Risk Primleri — Yahoo'da CDS yok, dış kaynaklara link */}
        <section className="glass-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-danger/15 text-danger">
              <DollarSign size={14} />
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Türkiye Risk Primleri</h2>
            <span className="text-[11px] text-slate-500">— CDS, tahvil getirisi (dış kaynaklar)</span>
          </div>
          <p className="mb-3 text-[11px] text-slate-400 leading-relaxed">
            <Info size={11} className="inline -mt-0.5 text-accent" /> Türkiye 5Y CDS spread verisi Yahoo Finance'ta bulunmuyor; gerçek zamanlı için aşağıdaki kaynaklara tıkla. CDS değeri TL bono getirileri ve yabancı sermaye akışıyla doğrudan ilişkilidir.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {TURKEY_RISK_LINKS.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
              >
                {l.label}
                <ExternalLink size={11} />
              </a>
            ))}
          </div>
        </section>
      </div>

      <p className="mt-4 text-[10px] text-slate-500">
        Veri kaynağı: Yahoo Finance (3 dakikada bir yenilenir). Endeks fiyatları küçük gecikmeli; CDS ve özel göstergeler dış kaynak.
      </p>
    </>
  );
}

function QuoteCard({ item, state }: { item: IndexItem; state?: QuoteState }) {
  if (!state || state.loading) {
    return <Skeleton variant="rect" height={86} />;
  }
  if (state.error || state.value == null) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</div>
        <div className="mt-1 text-danger">veri alınamadı</div>
      </div>
    );
  }
  const change = state.changePct ?? 0;
  const isPositive = change >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const tone = isPositive ? 'text-success' : 'text-danger';
  const sign = isPositive ? '+' : '';
  const formattedValue = state.value.toLocaleString('en-US', {
    maximumFractionDigits: state.value < 10 ? 4 : state.value < 1000 ? 2 : 0,
  });

  return (
    <div className="rounded-lg border border-border bg-bg-card p-3 transition hover:border-accent/40">
      <div className="flex items-center justify-between gap-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate" title={item.label}>{item.label}</div>
        <Icon size={11} className={tone} />
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">
        {item.unit?.startsWith('$') ? '$' : ''}{formattedValue}
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className={cn('text-xs font-medium tabular-nums', tone)}>
          {sign}{change.toFixed(2)}%
        </span>
        {item.unit && <span className="text-[9px] text-slate-500">{item.unit}</span>}
      </div>
      {item.note && (
        <div className="mt-1 text-[9px] text-slate-500 leading-tight">{item.note}</div>
      )}
    </div>
  );
}
