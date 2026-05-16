import { useEffect, useMemo, useState } from 'react';
import { Flag, RefreshCw, ExternalLink, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { fetchIndexYahoo, fetchHistoricalYahoo } from '@/data/api/yahoo';
import { analyzeTimeframe, aggregateTo4h, computeBigPlayerLean, buildVerdict, type MultiTimeframeResult, type TimeframeAnalysis } from '@/lib/multiTimeframe';
import { ema, type OHLC } from '@/lib/indicators';
import { cn } from '@/lib/utils';

const INDICES: { ySym: string; label: string }[] = [
  { ySym: '^GSPC', label: 'S&P 500' },
  { ySym: '^DJI',  label: 'Dow Jones' },
  { ySym: '^IXIC', label: 'NASDAQ' },
  { ySym: '^RUT',  label: 'Russell 2000' },
];

// Top 20 promising US stocks (büyük teknoloji + büyüme + sektör liderleri)
const US_STOCKS: { sym: string; name: string; sector: string }[] = [
  { sym: 'NVDA',  name: 'NVIDIA',          sector: 'AI / Chips' },
  { sym: 'AAPL',  name: 'Apple',           sector: 'Teknoloji' },
  { sym: 'MSFT',  name: 'Microsoft',       sector: 'Bulut / AI' },
  { sym: 'GOOGL', name: 'Alphabet (Google)', sector: 'AI / Reklam' },
  { sym: 'AMZN',  name: 'Amazon',          sector: 'E-ticaret / Bulut' },
  { sym: 'META',  name: 'Meta Platforms',  sector: 'Sosyal Medya' },
  { sym: 'TSLA',  name: 'Tesla',           sector: 'Elektrikli Araç' },
  { sym: 'AMD',   name: 'AMD',             sector: 'Chips' },
  { sym: 'AVGO',  name: 'Broadcom',        sector: 'Chips' },
  { sym: 'BRK-B', name: 'Berkshire Hathaway', sector: 'Yatırım' },
  { sym: 'JPM',   name: 'JPMorgan Chase',  sector: 'Bankacılık' },
  { sym: 'V',     name: 'Visa',            sector: 'Ödeme Sistemi' },
  { sym: 'MA',    name: 'Mastercard',      sector: 'Ödeme Sistemi' },
  { sym: 'UNH',   name: 'UnitedHealth',    sector: 'Sağlık' },
  { sym: 'LLY',   name: 'Eli Lilly',       sector: 'İlaç' },
  { sym: 'NFLX',  name: 'Netflix',         sector: 'Medya' },
  { sym: 'DIS',   name: 'Walt Disney',     sector: 'Medya' },
  { sym: 'WMT',   name: 'Walmart',         sector: 'Perakende' },
  { sym: 'COST',  name: 'Costco',          sector: 'Perakende' },
  { sym: 'XOM',   name: 'Exxon Mobil',     sector: 'Enerji' },
];

interface UsStockRec {
  sym: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  trend1h: TimeframeAnalysis | null;
  trend4h: TimeframeAnalysis | null;
  trend1d: TimeframeAnalysis | null;
  emas?: { period: number; value: number }[];
  longScore: number; // sıralama için
}

export function UsMarketsPage() {
  const [indexResults, setIndexResults] = useState<MultiTimeframeResult[]>([]);
  const [stockRecs, setStockRecs] = useState<UsStockRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();

  const refresh = async () => {
    setLoading(true);
    try {
      // Endeksler
      const indexPromises = INDICES.map(async ({ ySym, label }) => {
        const [spot, hist1h, hist1d] = await Promise.all([
          fetchIndexYahoo(ySym),
          fetchHistoricalYahoo(ySym, '1mo', '60m'),
          fetchHistoricalYahoo(ySym, '1y', '1d'),
        ]);
        const price = spot?.value ?? hist1d?.bars.at(-1)?.close ?? 0;
        const changePct = spot?.changePct ?? 0;
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
          symbol: ySym, label, price, changePct,
          tf1h, tf4h, tf1d, bigPlayerLean,
        };
        return { ...base, verdict: buildVerdict(base) };
      });
      const indexRes = await Promise.all(indexPromises);
      setIndexResults(indexRes);

      // Hisseler — fiyat ve multi-TF
      const stockPromises = US_STOCKS.map(async ({ sym, name, sector }) => {
        const [spot, hist1h, hist1d] = await Promise.all([
          fetchIndexYahoo(sym),
          fetchHistoricalYahoo(sym, '1mo', '60m'),
          fetchHistoricalYahoo(sym, '6mo', '1d'),
        ]);
        const price = spot?.value ?? 0;
        const changePct = spot?.changePct ?? 0;
        let tf1h: TimeframeAnalysis | null = null;
        let tf4h: TimeframeAnalysis | null = null;
        let tf1d: TimeframeAnalysis | null = null;
        let emas: { period: number; value: number }[] = [];

        if (hist1h && hist1h.bars.length > 0) {
          tf1h = analyzeTimeframe(hist1h.bars.map((b) => b.close), [5, 8, 13, 21, 55]);
          tf4h = analyzeTimeframe(aggregateTo4h(hist1h.bars).map((b) => b.close), [5, 8, 13, 21]);
        }
        if (hist1d && hist1d.bars.length > 0) {
          const closes1d = hist1d.bars.map((b) => b.close);
          tf1d = analyzeTimeframe(closes1d, [5, 8, 13, 21, 55, 200]);
          [5, 8, 13, 21, 55, 200].forEach((p) => {
            const v = ema(closes1d, p).at(-1);
            if (Number.isFinite(v)) emas.push({ period: p, value: v as number });
          });
        }

        // Long score: 1h+4h+1d long sayısı
        const longCount = [tf1h, tf4h, tf1d].filter((t) => t?.trend === 'long').length;
        const shortCount = [tf1h, tf4h, tf1d].filter((t) => t?.trend === 'short').length;
        const longScore = longCount * 3 - shortCount * 2 + changePct * 0.5;

        return { sym, name, sector, price, changePct, trend1h: tf1h, trend4h: tf4h, trend1d: tf1d, emas, longScore };
      });
      const stockRes = await Promise.all(stockPromises);
      stockRes.sort((a, b) => b.longScore - a.longScore);
      setStockRecs(stockRes);

      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3 * 60_000); // 3 dk
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <PageHeader
        title="ABD Borsaları"
        subtitle="S&P 500, Dow, NASDAQ endeksleri + 20 gelecek vaad eden ABD hissesi — 1h/4h/1d trend analizi."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading} />
            <button className="btn-secondary" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        }
      />

      {/* Endeksler */}
      <section className="glass-card mb-5 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent">
          <Flag size={14} /> ABD Endeksleri
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {loading && indexResults.length === 0 ? (
            <>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rect" height={200} />)}</>
          ) : (
            indexResults.map((r) => <IndexMtCard key={r.symbol} r={r} />)
          )}
        </div>
      </section>

      {/* Top US Stocks */}
      <section className="glass-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-warning">
          🚀 Top 20 Gelecek Vaad Eden ABD Hisseleri
        </h2>
        <p className="mb-3 text-[11px] text-slate-500">
          Multi-timeframe (1h / 4h / 1d) long sinyalleri ve günlük momentum'a göre sıralanmıştır.
        </p>
        {loading && stockRecs.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="rect" height={120} />)}
          </div>
        ) : (
          <div className="space-y-3">
            {stockRecs.map((s, i) => <UsStockCard key={s.sym} rec={s} rank={i + 1} />)}
          </div>
        )}
      </section>

      <p className="mt-3 text-[11px] text-slate-500">
        Veri kaynağı: Yahoo Finance. Sıralama algoritmiktir, yatırım tavsiyesi değildir.
      </p>
    </>
  );
}

function IndexMtCard({ r }: { r: MultiTimeframeResult }) {
  const changeTone = r.changePct >= 0 ? 'text-success' : 'text-danger';
  const leanColor = r.bigPlayerLean === 'alıcı' ? 'border-success/40 bg-success/10 text-success'
    : r.bigPlayerLean === 'satıcı' ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-slate-500/40 bg-slate-500/10 text-slate-300';
  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-base font-bold text-slate-100">{r.label}</h4>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">
            {r.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </div>
          <div className={cn('text-sm tabular-nums', changeTone)}>
            {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <TimeframeBoxSmall label="1 SAATLİK" ta={r.tf1h} />
        <TimeframeBoxSmall label="4 SAATLİK" ta={r.tf4h} />
        <TimeframeBoxSmall label="GÜNLÜK" ta={r.tf1d} />
      </div>
      <div className={cn('mt-3 rounded border px-3 py-1.5 text-xs', leanColor)}>
        <span className="font-bold uppercase">
          {r.bigPlayerLean === 'alıcı' ? '↑ ALICI BASKIN' : r.bigPlayerLean === 'satıcı' ? '↓ SATICI BASKIN' : '↔ KARARSIZ'}
        </span>
      </div>
    </div>
  );
}

function UsStockCard({ rec, rank }: { rec: UsStockRec; rank: number }) {
  const tone = rec.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = rec.changePct >= 0 ? '+' : '';
  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-sm font-bold text-accent">
            #{rank}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <a
                href={`https://finance.yahoo.com/quote/${encodeURIComponent(rec.sym)}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-lg font-bold text-accent hover:underline inline-flex items-center gap-1"
              >
                {rec.sym} <ExternalLink size={12} />
              </a>
              <span className="rounded border border-border bg-bg-soft px-1.5 py-0.5 text-[10px] text-slate-400">
                {rec.sector}
              </span>
              <span className="rounded bg-bg-soft px-1.5 py-0.5 text-[10px] text-slate-400">NYSE/NASDAQ</span>
            </div>
            <p className="mt-0.5 text-sm text-slate-300">{rec.name}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">
            ${rec.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </div>
          <div className={cn('text-sm tabular-nums', tone)}>
            {sign}{rec.changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <TimeframeBoxSmall label="1 SAATLİK" ta={rec.trend1h} />
        <TimeframeBoxSmall label="4 SAATLİK" ta={rec.trend4h} />
        <TimeframeBoxSmall label="GÜNLÜK" ta={rec.trend1d} />
      </div>

      {rec.emas && rec.emas.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">EMA Fiyatları (günlük)</div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {rec.emas.map((e) => {
              const above = rec.price >= e.value;
              return (
                <div key={e.period} className={cn(
                  'rounded border px-2 py-1 text-center',
                  above ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5',
                )}>
                  <div className="text-[9px] text-slate-500">EMA {e.period}</div>
                  <div className={cn('text-xs font-bold tabular-nums', above ? 'text-success' : 'text-danger')}>
                    ${e.value.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TimeframeBoxSmall({ label, ta }: { label: string; ta: TimeframeAnalysis | null }) {
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
