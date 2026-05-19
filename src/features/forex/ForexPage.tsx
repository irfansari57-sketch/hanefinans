import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, RefreshCw, ChevronRight, TrendingUp, TrendingDown, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { fetchIndexYahoo } from '@/data/api/yahoo';
import { FOREX_SYMBOLS, type ForexMeta } from '@/data/forexSymbols';
import { cn } from '@/lib/utils';

interface ForexQuote extends ForexMeta {
  value?: number;
  changePct?: number;
  loading?: boolean;
}

const GROUPS: Array<{ key: ForexMeta['group']; title: string; subtitle: string }> = [
  { key: 'TRY',   title: 'TL Pariteleri',   subtitle: 'Türk Lirasına karşı dövizler' },
  { key: 'MAJOR', title: 'Çapraz Kurlar',   subtitle: 'Major pair forex pariteleri' },
  { key: 'INDEX', title: 'Endeksler',       subtitle: 'Dolar endeksi (DXY)' },
];

export function ForexPage() {
  const [quotes, setQuotes] = useState<ForexQuote[]>(() =>
    FOREX_SYMBOLS.map((f) => ({ ...f, loading: true })),
  );
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [search, setSearch] = useState('');

  const refresh = async () => {
    setLoading(true);
    setQuotes(FOREX_SYMBOLS.map((f) => ({ ...f, loading: true })));
    await Promise.all(
      FOREX_SYMBOLS.map(async (meta) => {
        try {
          const r = await fetchIndexYahoo(meta.yahoo);
          setQuotes((prev) =>
            prev.map((q) =>
              q.symbol === meta.symbol
                ? { ...q, loading: false, value: r?.value, changePct: r?.changePct }
                : q,
            ),
          );
        } catch {
          setQuotes((prev) =>
            prev.map((q) => (q.symbol === meta.symbol ? { ...q, loading: false } : q)),
          );
        }
      }),
    );
    setUpdatedAt(Date.now());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2 * 60_000); // 2 dakikada bir
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Yahoo bazı paritelere veri vermiyor (CNY/TRY, RUB/TRY, SAR/TRY, NOK/TRY, SEK/TRY, DKK/TRY).
    // Loading sırasında hepsini göster; loading bittikten sonra sadece değer dönen kurları göster.
    const withData = quotes.filter((f) => f.loading || (f.value != null && Number.isFinite(f.value)));
    if (!q) return withData;
    return withData.filter((f) =>
      `${f.symbol} ${f.label} ${f.name}`.toLowerCase().includes(q),
    );
  }, [quotes, search]);

  const topMovers = useMemo(() => {
    const valid = quotes.filter((q) => q.changePct != null && Number.isFinite(q.changePct));
    const gainers = [...valid].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).slice(0, 3);
    const losers = [...valid].sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).slice(0, 3);
    return { gainers, losers };
  }, [quotes]);

  return (
    <>
      <PageHeader
        title="Döviz Kurları"
        subtitle="TL pariteleri + major çapraz kurlar + DXY — canlı Yahoo Finance verisi, 2 dk auto-refresh."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading} />
            <button className="btn-secondary" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        }
      />

      {/* Top hareketler — 3 yükselen + 3 düşen */}
      {(topMovers.gainers.length > 0 || topMovers.losers.length > 0) && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <MoverCard title="En Çok Yükselen" data={topMovers.gainers} tone="success" icon={TrendingUp} />
          <MoverCard title="En Çok Düşen" data={topMovers.losers} tone="danger" icon={TrendingDown} />
        </div>
      )}

      {/* Arama */}
      <div className="mb-4 relative max-w-md">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-8"
          placeholder="Sembol veya isim ara (USD, EUR, JPY…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Gruplara göre listeler */}
      <div className="space-y-5">
        {GROUPS.map((group) => {
          const items = filtered.filter((f) => f.group === group.key);
          if (items.length === 0) return null;
          return (
            <section key={group.key} className="glass-card p-4">
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-accent">{group.title}</h2>
                <span className="text-[11px] text-slate-500">— {group.subtitle}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((q) => <ForexCard key={q.symbol} q={q} />)}
              </div>
            </section>
          );
        })}
        {filtered.length === 0 && (
          <div className="card p-6 text-center text-xs text-slate-500">
            Arama ile eşleşme yok.
          </div>
        )}
      </div>

      <p className="mt-4 text-[10px] text-slate-500">
        Veri kaynağı: Yahoo Finance. Forex kotasyonu küçük gecikmeli olabilir (~15 dk).
        Sembole tıklayınca chart + teknik analiz sayfası açılır.
      </p>
    </>
  );
}

function ForexCard({ q }: { q: ForexQuote }) {
  if (q.loading) {
    return <Skeleton variant="rect" height={86} />;
  }
  const ch = q.changePct ?? 0;
  const isPositive = ch >= 0;
  const tone = isPositive ? 'text-success' : 'text-danger';
  return (
    <Link
      to={`/doviz/${q.symbol}`}
      className="group block rounded-lg border border-border bg-bg-card p-3 transition hover:border-accent/40 hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {q.flag && <span className="text-base">{q.flag}</span>}
          <div className="min-w-0">
            <div className="font-mono text-sm font-bold text-accent">{q.label}</div>
            <div className="text-[10px] text-slate-500 truncate">{q.name}</div>
          </div>
        </div>
        <ChevronRight size={12} className="shrink-0 text-slate-500 transition group-hover:text-accent" />
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-lg font-bold tabular-nums text-slate-100">
          {q.value != null ? q.value.toLocaleString('tr-TR', { maximumFractionDigits: q.value < 10 ? 4 : 2 }) : '—'}
        </span>
        {q.value != null && (
          <span className={cn('text-xs font-medium tabular-nums', tone)}>
            {isPositive ? '+' : ''}{ch.toFixed(2)}%
          </span>
        )}
      </div>
    </Link>
  );
}

function MoverCard({
  title, data, tone, icon: Icon,
}: {
  title: string;
  data: ForexQuote[];
  tone: 'success' | 'danger';
  icon: typeof TrendingUp;
}) {
  const toneColor = tone === 'success' ? 'text-success' : 'text-danger';
  return (
    <section className="card p-3">
      <h3 className={cn('mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider', toneColor)}>
        <Icon size={12} /> {title}
      </h3>
      <div className="divide-y divide-border">
        {data.map((f, i) => (
          <Link
            key={f.symbol}
            to={`/doviz/${f.symbol}`}
            className="flex items-center justify-between px-1 py-1.5 text-xs hover:bg-bg-soft rounded"
          >
            <div className="flex items-center gap-2">
              <span className="w-4 text-slate-500">{i + 1}</span>
              {f.flag && <span>{f.flag}</span>}
              <span className="font-mono text-accent">{f.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums text-slate-300">
                {f.value?.toLocaleString('tr-TR', { maximumFractionDigits: f.value && f.value < 10 ? 4 : 2 })}
              </span>
              <span className={cn('tabular-nums font-semibold w-16 text-right', toneColor)}>
                {(f.changePct ?? 0) >= 0 ? '+' : ''}{(f.changePct ?? 0).toFixed(2)}%
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
