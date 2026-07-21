import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe, RefreshCw, TrendingUp, TrendingDown, Flag, Gem, DollarSign, Activity, Info, Lock, Sparkles, ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { fetchIndexYahoo } from '@/data/api/yahoo';
import { fetchTrCds, type TrCdsData } from '@/data/api/trCds';
import { fetchTr10y, type Tr10yData } from '@/data/api/tr10y';
import { useAuth, isPro } from '@/store/auth';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { cn } from '@/lib/utils';

interface IndexItem {
  symbol: string;
  label: string;
  unit?: string;
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
    title: 'Risk & Volatilite & Faiz',
    subtitle: 'Korku endeksi, dolar gücü, ABD tahvil faizleri',
    icon: Activity,
    tone: 'danger',
    items: [
      { symbol: '^VIX', label: 'VIX', note: 'Korku Endeksi — S&P 500 30 gün öngörü volatilite' },
      { symbol: 'DX-Y.NYB', label: 'DXY', note: 'Dolar Endeksi — USD\'nin 6 ana para birimine karşı gücü' },
      { symbol: '^MOVE', label: 'MOVE', note: 'Bond Vol. Index — ABD tahvil piyasası volatilitesi' },
      { symbol: '^TNX', label: 'ABD 10Y Faiz', unit: '%', note: 'ABD 10 Yıllık Hazine Tahvili Faizi (Yıllık %)' },
    ],
  },
];

interface QuoteState {
  loading: boolean;
  value?: number;
  changePct?: number;
  error?: boolean;
}

// Module-level memo cache — sayfa değişimlerinde yeniden fetch'i önler
const GLOBAL_MEMO_TTL_MS = 3 * 60_000;
interface GlobalMemo {
  fetchedAt: number;
  quotes: Record<string, QuoteState>;
  trCds: TrCdsData | null;
  tr10y: Tr10yData | null;
  updatedAt: number;
}
let globalMemo: GlobalMemo | null = null;

export function GlobalPage() {
  const user = useAuth((s) => s.user);
  const proUser = isPro(user);

  const [quotes, setQuotes] = useState<Record<string, QuoteState>>(() => globalMemo?.quotes ?? {});
  const [loading, setLoading] = useState(() => !globalMemo);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(() => globalMemo?.updatedAt);
  const [trCds, setTrCds] = useState<TrCdsData | null>(() => globalMemo?.trCds ?? null);
  const [trCdsLoading, setTrCdsLoading] = useState(() => !globalMemo);
  const [tr10y, setTr10y] = useState<Tr10yData | null>(() => globalMemo?.tr10y ?? null);
  const [tr10yLoading, setTr10yLoading] = useState(() => !globalMemo);

  const allSymbols = useMemo(
    () => GROUPS.flatMap((g) => g.items.map((i) => i.symbol)),
    [],
  );

  const refresh = async () => {
    setLoading(true);
    setQuotes(Object.fromEntries(allSymbols.map((s) => [s, { loading: true }])));

    await Promise.all([
      // Yahoo paralel fetch
      ...allSymbols.map(async (sym) => {
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
      // TR CDS paralel fetch
      (async () => {
        setTrCdsLoading(true);
        const c = await fetchTrCds();
        setTrCds(c);
        setTrCdsLoading(false);
      })(),
      // TR 10Y bond yield paralel fetch
      (async () => {
        setTr10yLoading(true);
        const t = await fetchTr10y();
        setTr10y(t);
        setTr10yLoading(false);
      })(),
    ]);
    setUpdatedAt(Date.now());
    setLoading(false);
  };

  // Memo cache sync
  useEffect(() => {
    if (Object.keys(quotes).length > 0 && updatedAt) {
      globalMemo = {
        fetchedAt: Date.now(),
        quotes,
        trCds,
        tr10y,
        updatedAt,
      };
    }
  }, [quotes, trCds, tr10y, updatedAt]);

  useEffect(() => {
    if (!proUser) return;
    const memoAge = globalMemo ? Date.now() - globalMemo.fetchedAt : Infinity;
    if (memoAge < GLOBAL_MEMO_TTL_MS) {
      setLoading(false);
      setTrCdsLoading(false);
      setTr10yLoading(false);
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proUser]);
  // Polling: 3 dakikada bir (yalnız PRO); sekme arka plandayken durur
  useVisibleInterval(refresh, proUser ? 3 * 60_000 : null);

  // PRO gating
  if (!proUser) {
    return (
      <>
        <PageHeader
          title="Global Piyasalar"
          subtitle="ABD, Avrupa, Asya endeksleri + emtia + dolar endeksi + volatilite — tek sayfada anlık takip."
        />
        <div className="glass-card relative overflow-hidden p-8 text-center">
          <div className="pointer-events-none absolute inset-0 opacity-25">
            <div className="grid h-full gap-1.5 p-4 grid-cols-4 blur-sm">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="rounded bg-accent/15" />
              ))}
            </div>
          </div>
          <div className="relative">
            <span className="inline-flex items-center justify-center rounded-full bg-warning/15 p-4 text-warning">
              <Lock size={28} />
            </span>
            <h2 className="mt-4 text-xl font-bold text-slate-100">Global Piyasalar PRO Üyelere Özel</h2>
            <p className="mt-2 max-w-md mx-auto text-sm text-slate-400">
              ABD/Avrupa/Asya endeksleri, Brent, WTI, Altın, Gümüş, VIX, DXY, ABD 10Y faiz ve Türkiye 5Y CDS — global piyasayı tek bakışta izle.
            </p>
            <Link
              to="/uyelik"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 shadow-lg shadow-accent/30"
            >
              <Sparkles size={14} /> PRO'ya Yükselt
            </Link>
            <p className="mt-3 text-[11px] text-slate-500">
              PRO ile ek: ABD Borsaları, Heat Map, AI hisse/portföy analizi, reklamsız panel.
            </p>
          </div>
        </div>
      </>
    );
  }

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

        {/* Türkiye Risk Primleri — canlı TR 5Y CDS kartı + dış kaynak */}
        <section className="glass-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-danger/15 text-danger">
              <DollarSign size={14} />
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Türkiye Risk Primleri</h2>
            <span className="text-[11px] text-slate-500">— 5Y CDS spread, ülke risk primi</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <TrCdsCard data={trCds} loading={trCdsLoading} />
            <Tr10yCard data={tr10y} loading={tr10yLoading} />
          </div>

          {((trCds && !trCds.ok) || (tr10y && !tr10y.ok)) && (
            <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
              <Info size={11} className="inline -mt-0.5 text-warning" /> Bazı veriler şu anda alınamadı — birkaç dakika sonra otomatik yenilenecek.
            </p>
          )}
        </section>
      </div>

      <p className="mt-4 text-[10px] text-slate-500">
        Yahoo Finance verileri 3 dakikada bir yenilenir; TR 5Y CDS + TR 10Y günde 2 kez güncellenir. Bir karta tıkla → detay sayfasında canlı grafik + bilgi kartı.
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
    <Link
      to={`/macro/${encodeURIComponent(item.symbol)}`}
      className="block rounded-lg border border-border bg-bg-card p-3 transition hover:border-accent/40 hover:bg-bg-soft/60"
      aria-label={`${item.label} detayı`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate" title={item.label}>{item.label}</div>
        <Icon size={11} className={tone} />
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">
        {item.unit?.startsWith('$') ? '$' : ''}{formattedValue}{item.unit === '%' ? '%' : ''}
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className={cn('text-xs font-medium tabular-nums', tone)}>
          {sign}{change.toFixed(2)}%
        </span>
        {item.unit && item.unit !== '%' && <span className="text-[9px] text-slate-500">{item.unit}</span>}
      </div>
      {item.note && (
        <div className="mt-1 text-[9px] text-slate-500 leading-tight">{item.note}</div>
      )}
    </Link>
  );
}

/**
 * Türkiye 5Y CDS canlı kart — Pages Function /api/tr-cds'den çeker.
 * Tıklanınca /macro/TR-CDS-5Y detay sayfasına gider.
 */
function TrCdsCard({ data, loading }: { data: TrCdsData | null; loading: boolean }) {
  if (loading) return <Skeleton variant="rect" height={86} />;

  if (!data || !data.ok || data.value == null) {
    // data === null → fetch hiç dönmedi (dev'de Pages Functions yok veya net hatası)
    // data?.ok === false → server scraper hatası (production'da debug edilebilir)
    let detailMsg: string;
    if (data === null) {
      detailMsg = "Dev sunucuda Pages Functions çalışmaz — production'da canlı gelir.";
    } else if (data?.error) {
      detailMsg = `Kaynak hatası: ${data.error.slice(0, 80)}`;
    } else {
      detailMsg = 'Kaynak şu anda yanıt vermiyor — birkaç dakika sonra tekrar dene.';
    }
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">TR 5Y CDS</div>
          <Info size={11} className="text-warning" />
        </div>
        <div className="mt-1 text-warning">veri alınamadı</div>
        <div className="mt-1 text-[9px] text-slate-500 leading-tight">{detailMsg}</div>
      </div>
    );
  }

  const change = data.changePct ?? 0;
  // CDS düşmesi olumlu (risk priminin düşmesi)
  const isImprovement = change <= 0;
  const Icon = isImprovement ? TrendingDown : TrendingUp;
  const tone = isImprovement ? 'text-success' : 'text-danger';
  const sign = change >= 0 ? '+' : '';

  return (
    <Link
      to="/macro/TR-CDS-5Y"
      className="block rounded-lg border border-border bg-bg-card p-3 transition hover:border-accent/40 hover:bg-bg-soft/60"
      aria-label="Türkiye 5Y CDS detayı"
    >
      <div className="flex items-center justify-between gap-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">TR 5Y CDS</div>
        <Icon size={11} className={tone} />
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">
        {data.value.toFixed(2)}<span className="ml-1 text-[10px] font-medium text-slate-500">bps</span>
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className={cn('text-xs font-medium tabular-nums', tone)}>
          {sign}{change.toFixed(2)}%
        </span>
        {data.asOfDate && <span className="text-[9px] text-slate-500">{data.asOfDate}</span>}
      </div>
      <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-500 leading-tight">
        Türkiye ülke risk primi <ChevronRight size={9} />
      </div>
    </Link>
  );
}

/**
 * TR 10Y Tahvil canlı kart — Pages Function /api/tr-10y'den çeker (jsDelivr proxy).
 */
function Tr10yCard({ data, loading }: { data: Tr10yData | null; loading: boolean }) {
  if (loading) return <Skeleton variant="rect" height={86} />;

  if (!data || !data.ok || data.value == null) {
    let detailMsg: string;
    if (data === null) {
      detailMsg = "Dev sunucuda Pages Functions çalışmaz — production'da canlı gelir.";
    } else if (data?.error) {
      detailMsg = `Kaynak hatası: ${data.error.slice(0, 80)}`;
    } else {
      detailMsg = 'Kaynak şu anda yanıt vermiyor — birkaç dakika sonra tekrar dene.';
    }
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">TR 10Y Tahvil</div>
          <Info size={11} className="text-warning" />
        </div>
        <div className="mt-1 text-warning">veri alınamadı</div>
        <div className="mt-1 text-[9px] text-slate-500 leading-tight">{detailMsg}</div>
      </div>
    );
  }

  const change = data.changePct ?? 0;
  // Tahvil getirisi: yükselmek genel olarak risk artışı; düşüş düzelme.
  const isImprovement = change <= 0;
  const Icon = isImprovement ? TrendingDown : TrendingUp;
  const tone = isImprovement ? 'text-success' : 'text-danger';
  const sign = change >= 0 ? '+' : '';

  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <div className="flex items-center justify-between gap-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">TR 10Y Tahvil</div>
        <Icon size={11} className={tone} />
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">
        {data.value.toFixed(2)}<span className="ml-1 text-[10px] font-medium text-slate-500">%</span>
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className={cn('text-xs font-medium tabular-nums', tone)}>
          {sign}{change.toFixed(2)}%
        </span>
        {data.asOfDate && <span className="text-[9px] text-slate-500">{data.asOfDate}</span>}
      </div>
      <div className="mt-1 text-[9px] text-slate-500 leading-tight">
        10 yıllık devlet tahvili getirisi
      </div>
    </div>
  );
}
