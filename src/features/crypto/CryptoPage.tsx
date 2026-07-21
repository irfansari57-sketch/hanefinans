import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bitcoin, RefreshCw, ExternalLink, TrendingUp, TrendingDown, Zap, ChevronRight } from 'lucide-react';
import { findCrypto } from '@/data/cryptoSymbols';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { fetchMajorCryptos, fetchGlobal, fetchTopAltcoinMovers, type CryptoPrice, type CryptoMarketGlobal, type AltcoinMover } from '@/data/api/coingecko';
import { fetchFearGreed, fearGreedTone, type FearGreedSnapshot } from '@/data/api/feargreed';
import { fetchHistoricalYahoo } from '@/data/api/yahoo';
import { analyzeTimeframe, aggregateTo4h, computeBigPlayerLean, buildVerdict, type MultiTimeframeResult, type TimeframeAnalysis } from '@/lib/multiTimeframe';
import type { OHLC } from '@/lib/indicators';
import { formatCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { SeoHead } from '@/components/seo/SeoHead';

// Multi-timeframe için BTC, ETH, BNB (Yahoo'da var)
const CRYPTO_MT_SYMBOLS = [
  { ySym: 'BTC-USD', label: 'Bitcoin (BTC)' },
  { ySym: 'ETH-USD', label: 'Ethereum (ETH)' },
  { ySym: 'BNB-USD', label: 'BNB (Binance)' },
];

const STABLE_COINS = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'];

// Module-level memo cache — sayfa değişimlerinde yeniden fetch'i önler
const CRYPTO_MEMO_TTL_MS = 2 * 60_000;
interface CryptoMemo {
  fetchedAt: number;
  majors: CryptoPrice[];
  global: CryptoMarketGlobal | null;
  fearGreed: FearGreedSnapshot | null;
  movers: AltcoinMover[];
  mtResults: MultiTimeframeResult[];
  updatedAt: number;
}
let cryptoMemo: CryptoMemo | null = null;

export function CryptoPage() {
  const [majors, setMajors] = useState<CryptoPrice[]>(() => cryptoMemo?.majors ?? []);
  const [global, setGlobal] = useState<CryptoMarketGlobal | null>(() => cryptoMemo?.global ?? null);
  const [fearGreed, setFearGreed] = useState<FearGreedSnapshot | null>(() => cryptoMemo?.fearGreed ?? null);
  const [movers, setMovers] = useState<AltcoinMover[]>(() => cryptoMemo?.movers ?? []);
  const [mtResults, setMtResults] = useState<MultiTimeframeResult[]>(() => cryptoMemo?.mtResults ?? []);
  const [loading, setLoading] = useState(() => !cryptoMemo);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(() => cryptoMemo?.updatedAt);
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

      // Multi-timeframe analiz (BTC, ETH, BNB için)
      const mt = await Promise.all(
        CRYPTO_MT_SYMBOLS.map(async ({ ySym, label }) => {
          const [hist1h, hist1d] = await Promise.all([
            fetchHistoricalYahoo(ySym, '1mo', '60m'),
            fetchHistoricalYahoo(ySym, '1y', '1d'),
          ]);
          const price = hist1d?.bars.at(-1)?.close ?? 0;
          let changePct = 0;
          if (hist1d && hist1d.bars.length >= 2) {
            const prev = hist1d.bars[hist1d.bars.length - 2].close;
            changePct = ((price - prev) / prev) * 100;
          }
          let tf1h: TimeframeAnalysis | null = null;
          let tf4h: TimeframeAnalysis | null = null;
          let tf1d: TimeframeAnalysis | null = null;
          let bigPlayerLean: 'alıcı' | 'satıcı' | 'kararsız' = 'kararsız';
          if (hist1h && hist1h.bars.length > 0) {
            tf1h = analyzeTimeframe(hist1h.bars.map((b) => b.close), [5, 8, 13, 21, 55]);
            tf4h = analyzeTimeframe(aggregateTo4h(hist1h.bars).map((b) => b.close), [5, 8, 13, 21]);
          }
          if (hist1d && hist1d.bars.length > 0) {
            const closes1d = hist1d.bars.map((b) => b.close);
            tf1d = analyzeTimeframe(closes1d, [5, 8, 13, 21, 55, 200]);
            const ohlc: OHLC[] = hist1d.bars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
            bigPlayerLean = computeBigPlayerLean(ohlc);
          }
          const base: Omit<MultiTimeframeResult, 'verdict'> = {
            symbol: ySym, label, price, changePct, tf1h, tf4h, tf1d, bigPlayerLean,
          };
          return { ...base, verdict: buildVerdict(base) };
        }),
      );
      setMtResults(mt);

      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  // Memo cache sync
  useEffect(() => {
    if (majors.length > 0 && updatedAt) {
      cryptoMemo = {
        fetchedAt: Date.now(),
        majors,
        global,
        fearGreed,
        movers,
        mtResults,
        updatedAt,
      };
    }
  }, [majors, global, fearGreed, movers, mtResults, updatedAt]);

  useEffect(() => {
    const memoAge = cryptoMemo ? Date.now() - cryptoMemo.fetchedAt : Infinity;
    if (memoAge < CRYPTO_MEMO_TTL_MS) {
      setLoading(false);
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Polling: 2 dakikada bir; sekme arka plandayken durur
  useVisibleInterval(refresh, 2 * 60_000);

  const filteredMovers = movers.filter((a) => showStables || !STABLE_COINS.includes(a.symbol));
  const topGainers = [...filteredMovers].sort((a, b) => b.change24h - a.change24h).slice(0, 10);
  const topLosers = [...filteredMovers].sort((a, b) => a.change24h - b.change24h).slice(0, 10);

  return (
    <>
      <SeoHead title="Kripto Piyasası" description="Bitcoin, Ethereum ve top kriptolar — anlık fiyat (TRY/USD), 24s değişim, market cap, hacim." path="/kripto" />

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

      {/* Market durumu kullanici talebiyle kaldirildi */}

      {/* Multi-Timeframe Trend Analizi */}
      <section className="glass-card mb-5 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent">
          <Zap size={14} /> Çoklu Zaman Dilimi Yön Analizi
        </h2>
        <p className="mb-3 text-[11px] text-slate-500">
          BTC, ETH ve BNB için <strong>1 saatlik, 4 saatlik ve günlük</strong> trend yönü.
        </p>
        {loading && mtResults.length === 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} variant="rect" height={200} />)}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {mtResults.map((r) => <CryptoMtCard key={r.symbol} r={r} />)}
          </div>
        )}
      </section>

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

function CryptoMtCard({ r }: { r: MultiTimeframeResult }) {
  const changeTone = r.changePct >= 0 ? 'text-success' : 'text-danger';
  const leanColor = r.bigPlayerLean === 'alıcı' ? 'border-success/40 bg-success/10 text-success'
    : r.bigPlayerLean === 'satıcı' ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-slate-500/40 bg-slate-500/10 text-slate-300';
  // r.symbol Yahoo formatında (BTC-USD) — sade ticker'a çevir
  const ticker = r.symbol.split('-')[0];
  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <Link to={`/crypto/${ticker}`} className="text-base font-bold text-slate-100 hover:text-accent inline-flex items-center gap-1">
          {r.label} <ChevronRight size={14} />
        </Link>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">
            ${r.price.toLocaleString('en-US', { maximumFractionDigits: r.price < 100 ? 2 : 0 })}
          </div>
          <div className={cn('text-sm tabular-nums', changeTone)}>
            {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <CryptoTimeframeBox label="1 SAATLİK" ta={r.tf1h} />
        <CryptoTimeframeBox label="4 SAATLİK" ta={r.tf4h} />
        <CryptoTimeframeBox label="GÜNLÜK" ta={r.tf1d} />
      </div>
      <div className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', leanColor)}>
        <div className="flex items-center justify-between">
          <span className="font-semibold uppercase tracking-wider text-[10px]">Büyük Oyuncu</span>
          <span className="font-bold uppercase">
            {r.bigPlayerLean === 'alıcı' ? '↑ ALICI BASKIN' : r.bigPlayerLean === 'satıcı' ? '↓ SATICI BASKIN' : '↔ KARARSIZ'}
          </span>
        </div>
      </div>
    </div>
  );
}

function CryptoTimeframeBox({ label, ta }: { label: string; ta: TimeframeAnalysis | null }) {
  if (!ta) {
    return (
      <div className="rounded border border-border bg-bg-soft p-2 text-center">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="mt-1 text-xs font-bold text-slate-500">—</div>
      </div>
    );
  }
  const bg = ta.trend === 'long' ? 'border-success/40 bg-success/10'
    : ta.trend === 'short' ? 'border-danger/40 bg-danger/10'
    : 'border-slate-500/40 bg-slate-500/10';
  const color = ta.trend === 'long' ? 'text-success'
    : ta.trend === 'short' ? 'text-danger'
    : 'text-slate-400';
  const txt = ta.trend === 'long' ? 'LONG ↑'
    : ta.trend === 'short' ? 'SHORT ↓'
    : 'NEUTRAL';
  return (
    <div className={cn('rounded border p-2 text-center', bg)}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-sm font-bold', color)}>{txt}</div>
    </div>
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
    <Link
      to={`/crypto/${crypto.symbol.toUpperCase()}`}
      className="block rounded-lg border border-border bg-bg-card p-3 transition hover:border-accent/40 hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono font-bold text-warning">{crypto.symbol}</span>
          <span className="ml-2 text-xs text-slate-400">{crypto.name}</span>
        </div>
        <ChevronRight size={12} className="text-slate-500" />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-lg font-bold tabular-nums text-slate-100">
          ${crypto.usd.toLocaleString('en-US', { maximumFractionDigits: crypto.usd < 10 ? 4 : 0 })}
        </span>
        <span className={cn('text-xs font-medium tabular-nums', tone)}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>
    </Link>
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
          /* Tüm semboller artık iç detay sayfasına gider; bilinmeyenler için sentetik meta üretilir,
             dış kaynaklar (CoinGecko, Binance, vs.) detay sayfasının altında kullanıcıya sunulur */
          <Link
            key={a.id}
            to={`/crypto/${a.symbol.toUpperCase()}`}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-bg-soft"
          >
            <span className="w-6 text-slate-500">{i + 1}</span>
            <span className="font-mono font-semibold text-warning">{a.symbol}</span>
            <span className="flex-1 truncate text-slate-400">{a.name}</span>
            <span className="tabular-nums text-slate-300">${a.priceUsd.toFixed(a.priceUsd < 1 ? 4 : 2)}</span>
            <span className={cn('tabular-nums font-semibold w-16 text-right', a.change24h >= 0 ? 'text-success' : 'text-danger')}>
              {a.change24h >= 0 ? '+' : ''}{a.change24h.toFixed(2)}%
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
