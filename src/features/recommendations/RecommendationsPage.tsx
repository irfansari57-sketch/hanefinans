import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Flame, TrendingUp, TrendingDown, AlertTriangle, Star,
  PiggyBank, ChevronRight, RefreshCw, ExternalLink, BarChart3, Activity,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { ChartButton } from '@/components/domain/ChartButton';
import { AlertButton } from '@/components/domain/AlertButton';
import { NoteButton } from '@/components/domain/NoteButton';
import { loadStocks, clearServiceCaches } from '@/data/services';
import { fetchHistoricalYahoo } from '@/data/api/yahoo';
import { rsi as calcRsi, rsiSignal, macd, supportResistance, type OHLC } from '@/lib/indicators';
import { MOCK_STOCKS } from '@/data/mock';
import { MOCK_FUNDS } from '@/data/mockFunds';
import type { Stock, FundPerformance } from '@/data/types';
import { formatMoney } from '@/lib/format';
import { useWatchlist } from '@/store/watchlist';
import { cn } from '@/lib/utils';

const AUTO_REFRESH_MS = 60_000;

interface StockRec {
  stock: Stock;
  rsi?: number;
  rsiNote?: string;
  macdBullish: boolean;
  macdBearish: boolean;
  resistance?: number;
  support?: number;
  resistancePct?: number;
  supportPct?: number;
  momentum: number; // composite score
}

export function RecommendationsPage() {
  const [tab, setTab] = useState<'stocks' | 'funds'>('stocks');
  const [stocks, setStocks] = useState<Stock[]>(MOCK_STOCKS);
  const [stockRecs, setStockRecs] = useState<StockRec[]>([]);
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
      setStocks(r.data);

      // Top 15 by momentum (mutlak değişim × yön ağırlığı)
      const top = [...r.data]
        .filter((s) => s.price > 0 && Number.isFinite(s.changePct))
        .sort((a, b) => Math.abs(b.changePct) * (b.changePct > 0 ? 1.2 : 1) - Math.abs(a.changePct) * (a.changePct > 0 ? 1.2 : 1))
        .slice(0, 15);

      // Her biri için RSI + MACD + S/R hesapla
      const recs: StockRec[] = await Promise.all(
        top.map(async (stock) => {
          const hist = await fetchHistoricalYahoo(stock.symbol, '3mo', '1d');
          if (!hist || hist.bars.length < 20) {
            return {
              stock,
              macdBullish: false,
              macdBearish: false,
              momentum: Math.abs(stock.changePct),
            };
          }
          const closes = hist.bars.map((b) => b.close);
          const bars: OHLC[] = hist.bars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
          const rsiVal = calcRsi(closes, 14).at(-1);
          const macdR = macd(closes);
          const sr = supportResistance(bars, 60);
          return {
            stock,
            rsi: Number.isFinite(rsiVal as number) ? (rsiVal as number) : undefined,
            rsiNote: Number.isFinite(rsiVal as number) ? rsiSignal(rsiVal as number) : undefined,
            macdBullish: macdR.recentBullishCross,
            macdBearish: macdR.recentBearishCross,
            resistance: sr.resistance,
            support: sr.support,
            resistancePct: ((sr.resistance - stock.price) / stock.price) * 100,
            supportPct: ((stock.price - sr.support) / stock.price) * 100,
            momentum: Math.abs(stock.changePct) * (stock.changePct > 0 ? 1.2 : 1),
          };
        }),
      );
      setStockRecs(recs);
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

  const topFunds = useMemo(() => {
    return [...MOCK_FUNDS]
      .filter((f) => Number.isFinite(f.year))
      .sort((a, b) => (b.year as number) - (a.year as number))
      .slice(0, 10);
  }, []);

  return (
    <>
      <PageHeader
        title="Öneriler"
        subtitle="Günün momentum'u en güçlü hisseleri ve performans lideri fonlar — teknik göstergelerle birlikte."
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
            tab === 'stocks' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
          )}
          onClick={() => setTab('stocks')}
        >
          <Flame size={14} /> Trend Hisseler ({stockRecs.length})
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

      {tab === 'stocks' && (
        <div className="space-y-3">
          {stockRecs.length === 0 && !loading && (
            <div className="rounded-xl border border-border bg-bg-soft p-6 text-center text-sm text-slate-500">
              Trend hesaplaması için veri yükleniyor…
            </div>
          )}
          {stockRecs.map((rec, i) => {
            const watched = watchlistHas(rec.stock.symbol);
            const overbought = (rec.rsi ?? 0) >= 75;
            const oversold = (rec.rsi ?? 0) > 0 && (rec.rsi ?? 0) <= 30;
            const tone = rec.stock.changePct >= 0 ? 'text-success' : 'text-danger';
            const sign = rec.stock.changePct >= 0 ? '+' : '';

            return (
              <div key={rec.stock.symbol} className="glass-card p-5">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/10 font-bold text-accent">
                      #{i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link to={`/stock/${rec.stock.symbol}`} className="font-mono text-xl font-bold text-accent hover:underline">
                          {rec.stock.symbol}
                        </Link>
                        {rec.stock.sector && (
                          <span className="rounded border border-border bg-bg-soft px-1.5 py-0.5 text-[10px] text-slate-400">
                            {rec.stock.sector}
                          </span>
                        )}
                        <span className="rounded bg-bg-soft px-1.5 py-0.5 text-[10px] text-slate-400">BIST</span>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-300">{rec.stock.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums text-slate-100">{formatMoney(rec.stock.price)}</div>
                    <div className={cn('text-lg font-semibold tabular-nums', tone)}>
                      {sign}{rec.stock.changePct.toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* Indicators */}
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <IndicatorBox
                    label="RSI (14)"
                    value={rec.rsi != null ? rec.rsi.toFixed(1) : '—'}
                    note={rec.rsiNote ?? '—'}
                    tone={overbought ? 'warning' : oversold ? 'success' : 'neutral'}
                  />
                  <IndicatorBox
                    label="MACD"
                    value={rec.macdBullish ? 'Bullish ✓' : rec.macdBearish ? 'Bearish ✗' : 'Nötr'}
                    note="EMA12 vs EMA26 kesişimi"
                    tone={rec.macdBullish ? 'success' : rec.macdBearish ? 'danger' : 'neutral'}
                  />
                  <IndicatorBox
                    label="Kritik Direnç"
                    value={rec.resistance ? formatMoney(rec.resistance) : '—'}
                    note={rec.resistancePct != null ? `%${rec.resistancePct.toFixed(1)} uzakta` : ''}
                    tone="neutral"
                  />
                  <IndicatorBox
                    label="Kritik Destek"
                    value={rec.support ? formatMoney(rec.support) : '—'}
                    note={rec.supportPct != null ? `%${rec.supportPct.toFixed(1)} uzakta` : ''}
                    tone="neutral"
                  />
                </div>

                {/* Verdict */}
                <div className="mt-4 rounded-lg border border-border bg-bg-card p-3 text-xs leading-relaxed text-slate-300">
                  <strong>Yorum: </strong>
                  {buildVerdict(rec)}
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    to={`/stock/${rec.stock.symbol}`}
                    className="btn-primary"
                  >
                    Detay sayfası <ChevronRight size={14} />
                  </Link>
                  <button
                    onClick={() => toggleWatch(rec.stock.symbol)}
                    className={cn('btn-secondary', watched && 'border-warning/40 bg-warning/10 text-warning')}
                  >
                    <Star size={14} fill={watched ? 'currentColor' : 'none'} /> {watched ? 'Takipte' : 'Takip et'}
                  </button>
                  <ChartButton symbol={rec.stock.symbol} name={rec.stock.name} />
                  <AlertButton stock={rec.stock} />
                  <NoteButton symbol={rec.stock.symbol} hint={`${rec.stock.symbol} — momentum önerisi`} />
                  <a
                    href={`https://www.tradingview.com/chart/?symbol=BIST:${rec.stock.symbol}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:text-accent"
                  >
                    TradingView <ExternalLink size={11} />
                  </a>
                  {overbought && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                      <AlertTriangle size={10} /> RSI ≥ 75 — aşırı alım
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-500">
            ⚠️ Bu sıralama otomatik momentum skoru; yatırım tavsiyesi değildir. Karar vermeden teknik göstergeleri kendi araçlarınla doğrula.
          </p>
        </div>
      )}

      {tab === 'funds' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Yıllık getirisi en yüksek 10 fon. Detay için TEFAS/Fintables linklerini kullan.
          </p>
          {topFunds.map((fund, i) => (
            <FundRecCard key={fund.code} fund={fund} rank={i + 1} />
          ))}
        </div>
      )}
    </>
  );
}

function buildVerdict(rec: StockRec): string {
  const parts: string[] = [];
  const ch = rec.stock.changePct;
  if (ch > 5) parts.push('Çok güçlü günlük hareket.');
  else if (ch > 2) parts.push('Belirgin pozitif momentum.');
  else if (ch < -5) parts.push('Sert düşüş, panik satışı.');
  else if (ch < -2) parts.push('Negatif momentum.');
  else parts.push('Ölçülü hareket.');

  if (rec.rsi != null) {
    if (rec.rsi >= 75) parts.push('RSI aşırı alım bölgesinde — geri çekilme riski.');
    else if (rec.rsi <= 30) parts.push('RSI aşırı satım — dipten dönüş izle.');
    else if (rec.rsi >= 60) parts.push('Yükseliş momentumu güçlü.');
    else if (rec.rsi <= 40) parts.push('Düşüş momentumu görülüyor.');
  }

  if (rec.macdBullish) parts.push('MACD bullish crossover yaptı — kısa vadeli pozitif sinyal.');
  if (rec.macdBearish) parts.push('MACD bearish crossover — temkinli ol.');

  if (rec.resistancePct != null && rec.resistancePct < 3 && rec.resistancePct > 0) {
    parts.push(`Kritik direnç %${rec.resistancePct.toFixed(1)} uzakta — kırılırsa hızlanabilir.`);
  }
  if (rec.supportPct != null && rec.supportPct < 3 && rec.supportPct > 0) {
    parts.push(`Kritik desteğe yakın (%${rec.supportPct.toFixed(1)}) — bu seviye kritik.`);
  }

  return parts.join(' ');
}

function IndicatorBox({
  label, value, note, tone,
}: { label: string; value: string; note: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }) {
  const tones = {
    success: 'border-success/30 bg-success/5 text-success',
    danger:  'border-danger/30 bg-danger/5 text-danger',
    warning: 'border-warning/30 bg-warning/5 text-warning',
    neutral: 'border-border bg-bg-card text-slate-100',
  };
  return (
    <div className={cn('rounded-lg border p-3', tones[tone])}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] opacity-70">{note}</div>
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
          Detay sayfası <ChevronRight size={14} />
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
        <NoteButton symbol={fund.code} hint={`${fund.code} fon önerisi`} />
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
