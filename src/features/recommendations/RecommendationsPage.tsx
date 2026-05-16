import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Flame, Star, PiggyBank, ChevronRight, RefreshCw, ExternalLink, Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { ChartButton } from '@/components/domain/ChartButton';
import { AlertButton } from '@/components/domain/AlertButton';
import { NoteButton } from '@/components/domain/NoteButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { loadStocks, clearServiceCaches } from '@/data/services';
import { fetchHistoricalYahoo } from '@/data/api/yahoo';
import { ema } from '@/lib/indicators';
import { analyzeTimeframe, aggregateTo4h, type TimeframeAnalysis } from '@/lib/multiTimeframe';
import { MOCK_STOCKS } from '@/data/mock';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import type { Stock, FundPerformance } from '@/data/types';
import { formatMoney } from '@/lib/format';
import { useWatchlist } from '@/store/watchlist';
import { cn } from '@/lib/utils';

const AUTO_REFRESH_MS = 120_000;

interface ScalpRec {
  stock: Stock;
  // 5dk timeframe — vur kaç sinyali
  scalp5mLong: boolean;     // 5m EMA dizilim long
  scalp5mScore: number;     // ek momentum
  // Multi-timeframe
  trend1h: TimeframeAnalysis | null;
  trend4h: TimeframeAnalysis | null;
  trend1d: TimeframeAnalysis | null;
  // EMA değerleri (günlük)
  emas: { period: number; value: number }[];
  // Toplam long skoru
  longScore: number;
}

/**
 * IRFANrfv3-tarzı 5m long trend dedektörü:
 *  - Son fiyat EMA 8 ve EMA 21 üstünde
 *  - EMA 8 > EMA 21 (ascending)
 *  - Son 3 bar pozitif close (momentum)
 */
function detect5mLong(closes: number[]): { isLong: boolean; score: number } {
  if (closes.length < 21) return { isLong: false, score: 0 };
  const last = closes[closes.length - 1];
  const ema8 = ema(closes, 8).at(-1) ?? NaN;
  const ema21 = ema(closes, 21).at(-1) ?? NaN;
  if (!Number.isFinite(ema8) || !Number.isFinite(ema21)) return { isLong: false, score: 0 };
  const aboveEma8 = last > ema8;
  const ema8AboveEma21 = ema8 > ema21;
  const momentum = (() => {
    let up = 0;
    for (let i = closes.length - 3; i < closes.length - 1; i++) {
      if (i >= 0 && closes[i + 1] > closes[i]) up++;
    }
    return up;
  })();
  const isLong = aboveEma8 && ema8AboveEma21;
  // Skor: temel sinyal + momentum + mesafe
  const distance = ((last - ema21) / ema21) * 100;
  const score = (isLong ? 5 : 0) + momentum * 1.5 + Math.min(distance, 3);
  return { isLong, score };
}

export function RecommendationsPage() {
  const [tab, setTab] = useState<'scalp' | 'funds'>('scalp');
  const [recs, setRecs] = useState<ScalpRec[]>([]);
  const [topFunds, setTopFunds] = useState<FundPerformance[]>([]);
  const [fundsConfigured, setFundsConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();

  const watchlistHas = useWatchlist((s) => s.has);
  const toggleWatch = useWatchlist((s) => s.toggle);

  const allSymbols = useMemo(() => MOCK_STOCKS.map((s) => s.symbol), []);

  const refresh = async (force = false) => {
    if (force) clearServiceCaches();
    setLoading(true);
    try {
      const r = await loadStocks(allSymbols);
      // Önce filtre: bugün hareketli olanlar (mutlak değişim > 0.3)
      const candidates = [...r.data]
        .filter((s) => s.price > 0 && Number.isFinite(s.changePct) && Math.abs(s.changePct) > 0.1)
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 25); // Top 25 mum atan hisse

      // Her biri için 5m + 1h + 1d historical fetch + analiz
      const computed: ScalpRec[] = await Promise.all(
        candidates.map(async (stock) => {
          const [hist5m, hist1h, hist1d] = await Promise.all([
            fetchHistoricalYahoo(stock.symbol, '5d', '5m'),
            fetchHistoricalYahoo(stock.symbol, '1mo', '60m'),
            fetchHistoricalYahoo(stock.symbol, '6mo', '1d'),
          ]);

          // 5m detect
          let scalp5mLong = false;
          let scalp5mScore = 0;
          if (hist5m && hist5m.bars.length >= 21) {
            const closes5m = hist5m.bars.map((b) => b.close);
            const r5 = detect5mLong(closes5m);
            scalp5mLong = r5.isLong;
            scalp5mScore = r5.score;
          }

          // Multi-timeframe
          let trend1h: TimeframeAnalysis | null = null;
          let trend4h: TimeframeAnalysis | null = null;
          let trend1d: TimeframeAnalysis | null = null;
          let emas: { period: number; value: number }[] = [];

          if (hist1h && hist1h.bars.length > 0) {
            trend1h = analyzeTimeframe(hist1h.bars.map((b) => b.close), [5, 8, 13, 21, 55]);
            trend4h = analyzeTimeframe(aggregateTo4h(hist1h.bars).map((b) => b.close), [5, 8, 13, 21]);
          }
          if (hist1d && hist1d.bars.length > 0) {
            const closes1d = hist1d.bars.map((b) => b.close);
            trend1d = analyzeTimeframe(closes1d, [5, 8, 13, 21, 55, 200]);
            [5, 8, 13, 21, 55, 200].forEach((p) => {
              const v = ema(closes1d, p).at(-1);
              if (Number.isFinite(v)) emas.push({ period: p, value: v as number });
            });
          }

          // Toplam long skoru — 5m + multi-TF
          const longCount = [trend1h, trend4h, trend1d].filter((t) => t?.trend === 'long').length;
          const longScore = scalp5mScore + longCount * 3 + (stock.changePct > 0 ? stock.changePct : 0);

          return {
            stock,
            scalp5mLong,
            scalp5mScore,
            trend1h,
            trend4h,
            trend1d,
            emas,
            longScore,
          };
        }),
      );

      // Sıralama: önce 5m long olanlar, sonra long score'a göre
      computed.sort((a, b) => {
        if (a.scalp5mLong !== b.scalp5mLong) return a.scalp5mLong ? -1 : 1;
        return b.longScore - a.longScore;
      });

      setRecs(computed.slice(0, 15));
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh(true);
    const id = setInterval(() => refresh(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    loadFundsAsPerformance().then((r) => {
      if (!alive) return;
      if (!r) {
        setFundsConfigured(false);
        setTopFunds([]);
        return;
      }
      const top = [...r.funds]
        .filter((f) => Number.isFinite(f.year))
        .sort((a, b) => (b.year as number) - (a.year as number))
        .slice(0, 10);
      setTopFunds(top);
    });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <PageHeader
        title="Öneriler"
        subtitle="5 dakikalık long trendde olan vur-kaç hisseleri + multi-timeframe trend analizi."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading} />
            <button className="btn-secondary" onClick={() => refresh(true)} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        }
      />

      <div className="mb-4 inline-flex rounded-lg border border-border bg-bg-soft p-1">
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition',
            tab === 'scalp' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
          )}
          onClick={() => setTab('scalp')}
        >
          <Zap size={14} /> Vur-Kaç Long ({recs.filter((r) => r.scalp5mLong).length}/{recs.length})
        </button>
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition',
            tab === 'funds' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
          )}
          onClick={() => setTab('funds')}
        >
          <PiggyBank size={14} /> Trend Fonlar ({topFunds.length})
        </button>
      </div>

      {tab === 'scalp' && (
        <>
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-slate-300">
            <Zap size={12} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <strong className="text-accent">Vur-Kaç stratejisi:</strong> 5 dakikalık grafikte EMA 8 ve EMA 21 üstüne çıkmış,
              EMA dizilim ascending ve son barlar yükselen hisseler. Kısa vadeli long pozisyon için filtrelenmiştir.
            </span>
          </div>

          {loading && recs.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="rect" height={200} />)}
            </div>
          ) : (
            <div className="space-y-3">
              {recs.map((rec, i) => <ScalpCard key={rec.stock.symbol} rec={rec} rank={i + 1} watched={watchlistHas(rec.stock.symbol)} onToggle={() => toggleWatch(rec.stock.symbol)} />)}
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-500">
            ⚠️ Vur-kaç önerileri kısa vadeli teknik sinyallerdir; yatırım tavsiyesi değildir. Sıkı stop-loss ile pozisyon yönet.
          </p>
        </>
      )}

      {tab === 'funds' && (
        <div className="space-y-3">
          {!fundsConfigured ? (
            <div className="card border-warning/40 bg-warning/5 p-5 text-sm text-slate-300">
              <strong className="text-warning">TEFAS canlı verisi yapılandırılmadı.</strong>
              <p className="mt-1 text-xs text-slate-400">
                Bu sekmede gerçek fon verisi göstermek için <Link to="/funds" className="text-accent underline">Fonlar</Link> sayfasındaki kurulum yönergesini takip et.
              </p>
            </div>
          ) : topFunds.length === 0 ? (
            <div className="card p-6 text-center text-xs text-slate-500">Fon verisi yükleniyor…</div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Yıllık getirisi en yüksek 10 fon (canlı TEFAS). Detay için TEFAS/Fintables linklerini kullan.
              </p>
              {topFunds.map((fund, i) => (
                <FundRecCard key={fund.code} fund={fund} rank={i + 1} />
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}

function ScalpCard({ rec, rank, watched, onToggle }: {
  rec: ScalpRec;
  rank: number;
  watched: boolean;
  onToggle: () => void;
}) {
  const { stock } = rec;
  const tone = stock.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = stock.changePct >= 0 ? '+' : '';

  return (
    <div className="glass-card p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-lg border font-bold text-sm',
            rec.scalp5mLong ? 'border-success/40 bg-success/10 text-success' : 'border-accent/30 bg-accent/10 text-accent',
          )}>
            #{rank}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={`/stock/${stock.symbol}`} className="font-mono text-lg font-bold text-accent hover:underline">
                {stock.symbol}
              </Link>
              {stock.sector && (
                <span className="rounded border border-border bg-bg-soft px-1.5 py-0.5 text-[10px] text-slate-400">
                  {stock.sector}
                </span>
              )}
              {rec.scalp5mLong && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                  <Zap size={9} /> 5dk LONG
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-300">{stock.name}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">{formatMoney(stock.price)}</div>
          <div className={cn('text-base font-semibold tabular-nums', tone)}>
            {sign}{stock.changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Multi-timeframe trend */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <TfBox label="1 SAATLİK" ta={rec.trend1h} />
        <TfBox label="4 SAATLİK" ta={rec.trend4h} />
        <TfBox label="GÜNLÜK" ta={rec.trend1d} />
      </div>

      {/* EMA Fiyatları */}
      {rec.emas.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">EMA Fiyatları (günlük)</div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {rec.emas.map((e) => {
              const above = stock.price >= e.value;
              return (
                <div key={e.period} className={cn(
                  'rounded border px-2 py-1 text-center',
                  above ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5',
                )}>
                  <div className="text-[9px] text-slate-500">EMA {e.period}</div>
                  <div className={cn('text-xs font-bold tabular-nums', above ? 'text-success' : 'text-danger')}>
                    {formatMoney(e.value)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link to={`/stock/${stock.symbol}`} className="btn-primary">
          Detay <ChevronRight size={14} />
        </Link>
        <button
          onClick={onToggle}
          className={cn('btn-secondary', watched && 'border-warning/40 bg-warning/10 text-warning')}
        >
          <Star size={14} fill={watched ? 'currentColor' : 'none'} /> {watched ? 'Takipte' : 'Takip et'}
        </button>
        <ChartButton symbol={stock.symbol} name={stock.name} />
        <AlertButton stock={stock} />
        <NoteButton symbol={stock.symbol} hint={`${stock.symbol} — vur-kaç önerisi`} />
        <a
          href={`https://www.tradingview.com/chart/?symbol=BIST:${stock.symbol}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:text-accent"
        >
          TradingView <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

function TfBox({ label, ta }: { label: string; ta: TimeframeAnalysis | null }) {
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

function FundRecCard({ fund, rank }: { fund: FundPerformance; rank: number }) {
  const tone = fund.year >= 0 ? 'text-success' : 'text-danger';
  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-warning/30 bg-warning/10 font-bold text-warning">
            #{rank}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link to={`/fund/${fund.code}`} className="font-mono text-xl font-bold text-accent hover:underline">
                {fund.code}
              </Link>
              <span className="rounded border border-border bg-bg-soft px-1.5 py-0.5 text-[10px] text-slate-400">
                {fund.category}
              </span>
            </div>
            {fund.name && <p className="mt-0.5 text-sm text-slate-300">{fund.name}</p>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">1 Yıl Getiri</div>
          <div className={cn('text-2xl font-bold tabular-nums', tone)}>
            {fund.year >= 0 ? '+' : ''}{fund.year.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <PerfMini label="Gün" value={fund.day} />
        <PerfMini label="1 Hafta" value={fund.week} />
        <PerfMini label="1 Ay" value={fund.month} />
        <PerfMini label="3 Ay" value={fund.threeMonth} />
        <PerfMini label="6 Ay" value={fund.sixMonth} />
        <PerfMini label="YTD" value={fund.ytd} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/fund/${fund.code}`} className="btn-primary">
          Detay <ChevronRight size={14} />
        </Link>
        <a
          href={`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${fund.code}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20"
        >
          TEFAS <ExternalLink size={11} />
        </a>
        <a
          href={`https://fintables.com/fonlar/${fund.code}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
        >
          Fintables <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

function PerfMini({ label, value }: { label: string; value: number }) {
  if (!Number.isFinite(value)) {
    return (
      <div className="rounded bg-bg-card px-2 py-1.5">
        <div className="text-[10px] text-slate-500">{label}</div>
        <div className="tabular-nums text-slate-600">—</div>
      </div>
    );
  }
  const tone = value >= 0 ? 'text-success' : 'text-danger';
  return (
    <div className="rounded bg-bg-card px-2 py-1.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={cn('text-sm font-medium tabular-nums', tone)}>
        {value >= 0 ? '+' : ''}{value.toFixed(2)}%
      </div>
    </div>
  );
}
