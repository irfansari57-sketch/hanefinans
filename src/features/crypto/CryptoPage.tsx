import { useEffect, useState } from 'react';
import { Bitcoin, RefreshCw, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { fetchMajorCryptos, fetchGlobal, fetchTopAltcoinMovers, type CryptoPrice, type CryptoMarketGlobal, type AltcoinMover } from '@/data/api/coingecko';
import { fetchFearGreed, fearGreedTone, type FearGreedSnapshot } from '@/data/api/feargreed';
import { formatCompact } from '@/lib/format';
import { cn } from '@/lib/utils';

const STABLE_COINS = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'];

export function CryptoPage() {
  const [majors, setMajors] = useState<CryptoPrice[]>([]);
  const [global, setGlobal] = useState<CryptoMarketGlobal | null>(null);
  const [fearGreed, setFearGreed] = useState<FearGreedSnapshot | null>(null);
  const [movers, setMovers] = useState<AltcoinMover[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [showStables, setShowStables] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [m, g, fg, alt] = await Promise.all([
        fetchMajorCryptos(),
        fetchGlobal(),
        fetchFearGreed(),
        fetchTopAltcoinMovers(80),
      ]);
      setMajors(m);
      setGlobal(g);
      setFearGreed(fg);
      setMovers(alt);
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2 * 60_000); // 2 dakikada bir
    return () => clearInterval(id);
  }, []);

  const filteredMovers = movers.filter((a) => showStables || !STABLE_COINS.includes(a.symbol));
  const topGainers = [...filteredMovers].sort((a, b) => b.change24h - a.change24h).slice(0, 10);
  const topLosers = [...filteredMovers].sort((a, b) => a.change24h - b.change24h).slice(0, 10);

  return (
    <>
      <PageHeader
        title="Kripto Para"
        subtitle="Ana kriptolar, market durumu, sentiment ve 24 saatlik en çok yükselen/düşenler (CoinGecko)."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading} />
            <button className="btn-secondary" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        }
      />

      {/* Market durumu — global */}
      {global && fearGreed && (
        <section className="glass-card mb-5 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-warning">Piyasa Durumu</h2>
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
            <MetricBox
              label="Toplam Market Cap"
              value={`$${formatCompact(global.totalMarketCapUsd)}`}
            />
            <MetricBox
              label="BTC Dominance"
              value={`%${global.btcDominance.toFixed(2)}`}
            />
            <MetricBox
              label="ETH Dominance"
              value={`%${global.ethDominance.toFixed(2)}`}
            />
            <FearGreedBox fg={fearGreed} />
          </div>
        </section>
      )}

      {/* Ana coinler */}
      <section className="glass-card mb-5 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-warning">Ana Coinler</h2>
        {loading && majors.length === 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="rect" height={80} />)}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {majors.map((c) => <MajorCryptoCard key={c.symbol} crypto={c} />)}
          </div>
        )}
      </section>

      {/* Top Gainers + Losers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MoversList title="En Çok Yükselenler (24s)" data={topGainers} tone="success" icon={TrendingUp} />
        <MoversList title="En Çok Düşenler (24s)" data={topLosers} tone="danger" icon={TrendingDown} />
      </div>

      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-border bg-bg-soft accent-accent"
          checked={showStables}
          onChange={(e) => setShowStables(e.target.checked)}
        />
        Stablecoin'ları (USDT, USDC vb.) dahil et
      </label>

      <p className="mt-5 text-[11px] text-slate-500">
        Veri kaynağı: CoinGecko (ücretsiz). Fiyatlar 2 dakikada bir güncellenir. Türkiye'de işlem yapmak için Paribu, BTCTurk veya yabancı borsa (Binance, Bybit) kullanılabilir.
      </p>
    </>
  );
}

function MetricBox({ label, value, change, tone }: { label: string; value: string; change?: number; tone?: 'success' | 'danger' }) {
  const toneClass = tone === 'success' ? 'border-success/30 bg-success/5' : tone === 'danger' ? 'border-danger/30 bg-danger/5' : 'border-border bg-bg-card';
  const changeTone = (change ?? 0) >= 0 ? 'text-success' : 'text-danger';
  return (
    <div className={cn('rounded-lg border p-3', toneClass)}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">{value}</div>
      {change != null && (
        <div className={cn('mt-0.5 text-xs tabular-nums', changeTone)}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function FearGreedBox({ fg }: { fg: FearGreedSnapshot }) {
  const t = fearGreedTone(fg.value);
  const tones = {
    danger:  'border-danger/30 bg-danger/5 text-danger',
    warning: 'border-warning/30 bg-warning/5 text-warning',
    slate:   'border-border bg-bg-card text-slate-300',
    success: 'border-success/30 bg-success/5 text-success',
    accent:  'border-accent/30 bg-accent/5 text-accent',
  } as const;
  return (
    <div className={cn('rounded-lg border p-3', tones[t.tone])}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">Fear & Greed</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-bold tabular-nums">{fg.value}</span>
        <span className="text-[10px] text-slate-500">/100</span>
      </div>
      <div className="mt-0.5 text-xs">{t.label}</div>
    </div>
  );
}

function MajorCryptoCard({ crypto }: { crypto: CryptoPrice }) {
  const change = crypto.change24h;
  const tone = change >= 0 ? 'text-success' : 'text-danger';
  return (
    <a
      href={`https://www.coingecko.com/en/coins/${crypto.id}`}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border border-border bg-bg-card p-3 transition hover:border-accent/40 hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono font-bold text-warning">{crypto.symbol}</span>
          <span className="ml-2 text-xs text-slate-400">{crypto.name}</span>
        </div>
        <ExternalLink size={11} className="text-slate-500" />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-lg font-bold tabular-nums text-slate-100">
          ${crypto.usd.toLocaleString('en-US', { maximumFractionDigits: crypto.usd < 10 ? 4 : 0 })}
        </span>
        <span className={cn('text-xs font-medium tabular-nums', tone)}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>
    </a>
  );
}

function MoversList({ title, data, tone, icon: Icon }: {
  title: string;
  data: AltcoinMover[];
  tone: 'success' | 'danger';
  icon: typeof TrendingUp;
}) {
  const toneColor = tone === 'success' ? 'text-success' : 'text-danger';
  return (
    <section className="glass-card p-4">
      <h2 className={cn('mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider', toneColor)}>
        <Icon size={14} /> {title}
      </h2>
      <div className="space-y-1">
        {data.map((a, i) => (
          <a
            key={a.id}
            href={`https://www.coingecko.com/en/coins/${a.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-bg-soft"
          >
            <span className="w-6 text-slate-500">{i + 1}</span>
            <span className="font-mono font-semibold text-warning">{a.symbol}</span>
            <span className="flex-1 truncate text-slate-400">{a.name}</span>
            <span className="tabular-nums text-slate-300">${a.priceUsd.toFixed(a.priceUsd < 1 ? 4 : 2)}</span>
            <span className={cn('tabular-nums font-semibold w-16 text-right', a.change24h >= 0 ? 'text-success' : 'text-danger')}>
              {a.change24h >= 0 ? '+' : ''}{a.change24h.toFixed(2)}%
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
