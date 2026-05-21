import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Flame, Star, PiggyBank, ChevronRight, RefreshCw, ExternalLink, Zap, Briefcase, PieChart,
} from 'lucide-react';
import { BrokerRecommendations } from '@/components/domain/BrokerRecommendations';
import { BrokerPortfolios } from '@/components/domain/BrokerPortfolios';
import { RecPoolStats, type PoolStatBoxData } from '@/components/domain/RecPoolStats';
import { BROKER_RECOMMENDATIONS } from '@/data/brokerRecommendations';
import { BROKER_PORTFOLIOS } from '@/data/brokerPortfolios';

const BROKER_COUNT = BROKER_RECOMMENDATIONS.length;
const PORTFOLIO_COUNT = BROKER_PORTFOLIOS.length;
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { ChartButton } from '@/components/domain/ChartButton';
import { AlertButton } from '@/components/domain/AlertButton';
import { NoteButton } from '@/components/domain/NoteButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { loadStocks, clearServiceCaches } from '@/data/services';
import { fetchHistoricalYahoo, fetchIndexYahoo } from '@/data/api/yahoo';
import { ema, type OHLC } from '@/lib/indicators';
import { analyzeTimeframe, aggregateTo4h, computeBigPlayerLean, buildVerdict, type TimeframeAnalysis, type MultiTimeframeResult } from '@/lib/multiTimeframe';
import { useAuth, isPro } from '@/store/auth';
import { Lock, Bell, BellOff } from 'lucide-react';
import { sendTelegram, getTelegramChatId } from '@/lib/telegram';
import { MOCK_STOCKS } from '@/data/mock';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import type { Stock, FundPerformance } from '@/data/types';
import { formatMoney } from '@/lib/format';
import { useWatchlist } from '@/store/watchlist';
import { cn } from '@/lib/utils';

const AUTO_REFRESH_MS = 120_000;

/**
 * BIST disindaki extra tarama sembolleri (emtia spot).
 * Yahoo symbol: XAUUSD=X (Altin), XAGUSD=X (Gumus) — bistSuffix=false ile cekilir.
 */
interface CustomScanSymbol {
  symbol: string;       // Yahoo ticker (XAUUSD=X)
  displayName: string;
  sector: string;
}
const CUSTOM_SCAN_SYMBOLS: CustomScanSymbol[] = [
  { symbol: 'XAUUSD=X', displayName: 'Altin Spot (USD)', sector: 'Emtia' },
  { symbol: 'XAGUSD=X', displayName: 'Gumus Spot (USD)', sector: 'Emtia' },
];
const isCustomSymbol = (sym: string) => CUSTOM_SCAN_SYMBOLS.some((c) => c.symbol === sym);

type ScalpTf = '5m' | '15m' | '1h' | '4h' | '1d';

interface ScalpRec {
  stock: Stock;
  // 5dk timeframe — Golden Cross (EMA 50/200) sinyali
  scalp5mLong: boolean;
  scalp5mScore: number;
  scalp5mFreshCross: boolean;
  // 15dk timeframe — 5m bar 3'erli aggregate
  scalp15mLong: boolean;
  scalp15mScore: number;
  scalp15mFreshCross: boolean;
  // Multi-timeframe
  trend1h: TimeframeAnalysis | null;
  trend4h: TimeframeAnalysis | null;
  trend1d: TimeframeAnalysis | null;
  // EMA değerleri (günlük)
  emas: { period: number; value: number }[];
  // PRO için: büyük oyuncu eğilimi + algoritmik yorum
  bigPlayerLean: 'alıcı' | 'satıcı' | 'kararsız';
  verdict?: string;
  // Toplam long skoru
  longScore: number;
}

/**
 * 5m bar'ları 3'erli birleştirip 15m bar'a çevir.
 */
function aggregateTo15m(closes5m: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < closes5m.length; i += 3) {
    const chunk = closes5m.slice(i, Math.min(i + 3, closes5m.length));
    if (chunk.length === 0) continue;
    // close = son bar'in close'u (3 5m → 1 15m)
    out.push(chunk[chunk.length - 1]);
  }
  return out;
}

/**
 * Selected timeframe icin long sinyalini cikar.
 * 5m/15m: scalp detect5mLong (EMA 8 vs 21), 1h/4h/1d: trend analizi.
 */
function isLongForTf(rec: ScalpRec, tf: ScalpTf): boolean {
  switch (tf) {
    case '5m': return rec.scalp5mLong;
    case '15m': return rec.scalp15mLong;
    case '1h': return rec.trend1h?.trend === 'long';
    case '4h': return rec.trend4h?.trend === 'long';
    case '1d': return rec.trend1d?.trend === 'long';
  }
}

function tfLabel(tf: ScalpTf): string {
  return { '5m': '5DK', '15m': '15DK', '1h': '1H', '4h': '4H', '1d': '1G' }[tf];
}

/**
 * Tarihsel snapshot — algoritmik onerilerin gecmis performansini takip eder.
 * Her gun ilk basarili refresh'te bugunun toplam onerilerini kaydederiz.
 * Sonradan mevcut fiyatlarla karsilastirip kazanci/kaybi hesaplariz.
 */
interface DailySnapshotEntry {
  symbol: string;
  name?: string;
  entryPrice: number;
  isLongAtEntry: boolean;
  isFreshAtEntry: boolean;
}
interface DailySnapshot {
  date: string;          // YYYY-MM-DD
  ts: number;            // unix ms (ilk kayit)
  selectedTf: ScalpTf;
  entries: DailySnapshotEntry[];
}

const SNAPSHOT_KEY = 'fa.scalp.dailySnapshots.v1';
const SNAPSHOT_MAX_DAYS = 14;

function loadSnapshots(): DailySnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as DailySnapshot[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveSnapshots(snaps: DailySnapshot[]): void {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snaps)); } catch { /* */ }
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

/** Sadece 5m/15m fresh golden cross destekler (1h/4h/1d trend analizinde yok). */
function isFreshForTf(rec: ScalpRec, tf: ScalpTf): boolean {
  if (tf === '5m') return rec.scalp5mFreshCross;
  if (tf === '15m') return rec.scalp15mFreshCross;
  return false;
}

/** TF-specific score — siralama icin. */
function scoreForTf(rec: ScalpRec, tf: ScalpTf): number {
  switch (tf) {
    case '5m': return rec.scalp5mScore;
    case '15m': return rec.scalp15mScore;
    case '1h':
    case '4h':
    case '1d':
      // Trend analizi 'long' ise 10 puan baz, neutral 0, short -10
      const t = tf === '1h' ? rec.trend1h : tf === '4h' ? rec.trend4h : rec.trend1d;
      if (!t) return 0;
      if (t.trend === 'long') return 10;
      if (t.trend === 'short') return -10;
      return 0;
  }
}

/**
 * Golden Cross dedektörü — guclu uzun trend sinyali.
 *  - Fiyat EMA 50 ustunde (kisa vade momentum)
 *  - EMA 50 > EMA 200 (golden cross aktif)
 *  - Taze cross: son 10 bar oncesinde 50 < 200 idi → simdi yukari kesti = bonus
 *
 * EMA 50/200 5m'de cok daha gec ve guvenli sinyal verir.
 * En az 200 bar veri gerek (yetersizse false doner).
 */
function detectGoldenCross(closes: number[]): { isLong: boolean; score: number; freshCross: boolean } {
  if (closes.length < 200) return { isLong: false, score: 0, freshCross: false };
  const last = closes[closes.length - 1];
  const ema50Arr = ema(closes, 50);
  const ema200Arr = ema(closes, 200);
  const ema50 = ema50Arr.at(-1) ?? NaN;
  const ema200 = ema200Arr.at(-1) ?? NaN;
  if (!Number.isFinite(ema50) || !Number.isFinite(ema200)) {
    return { isLong: false, score: 0, freshCross: false };
  }

  const goldenCross = ema50 > ema200;
  const aboveEma50 = last > ema50;
  const isLong = goldenCross && aboveEma50;

  // Taze cross: 10 bar once EMA 50 <= EMA 200 idi, simdi ustunde
  const lookback = Math.min(10, ema50Arr.length - 1);
  const ema50Past = ema50Arr[ema50Arr.length - 1 - lookback];
  const ema200Past = ema200Arr[ema200Arr.length - 1 - lookback];
  const freshCross = Number.isFinite(ema50Past) && Number.isFinite(ema200Past)
    ? ema50Past <= ema200Past && goldenCross
    : false;

  // Skor: golden cross + aboveEma50 + freshness + above-distance
  const distancePct = ((last - ema200) / ema200) * 100;
  const score = (isLong ? 10 : 0) + (freshCross ? 5 : 0) + Math.min(distancePct, 5);
  return { isLong, score, freshCross };
}

export function RecommendationsPage() {
  const [tab, setTab] = useState<'broker' | 'portfolio' | 'scalp' | 'funds'>('scalp');
  const [scalpFilter, setScalpFilter] = useState<'all' | 'longonly' | 'watchlist'>('all');
  const [selectedTf, setSelectedTf] = useState<ScalpTf>('5m');
  const [searchQuery, setSearchQuery] = useState('');
  const [tazeAlertsEnabled, setTazeAlertsEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('fa.scalp.tazeAlertsEnabled') === '1'; } catch { return false; }
  });
  const [recs, setRecs] = useState<ScalpRec[]>([]);
  const [topFunds, setTopFunds] = useState<FundPerformance[]>([]);
  const [fundsConfigured, setFundsConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();

  const watchlistHas = useWatchlist((s) => s.has);
  const toggleWatch = useWatchlist((s) => s.toggle);

  const allSymbols = useMemo(() => MOCK_STOCKS.map((s) => s.symbol), []);

  // Seçili TF'e göre dinamik sıralama: önce TAZE GC, sonra Long, sonra skor.
  const sortedRecs = useMemo(() => {
    return [...recs].sort((a, b) => {
      const aFresh = isFreshForTf(a, selectedTf);
      const bFresh = isFreshForTf(b, selectedTf);
      if (aFresh !== bFresh) return aFresh ? -1 : 1;
      const aLong = isLongForTf(a, selectedTf);
      const bLong = isLongForTf(b, selectedTf);
      if (aLong !== bLong) return aLong ? -1 : 1;
      return scoreForTf(b, selectedTf) - scoreForTf(a, selectedTf);
    });
  }, [recs, selectedTf]);

  // Persist toggle
  useEffect(() => {
    try { localStorage.setItem('fa.scalp.tazeAlertsEnabled', tazeAlertsEnabled ? '1' : '0'); } catch { /* */ }
  }, [tazeAlertsEnabled]);

  // TAZE GC diff + Telegram notify — her refresh sonrası 5m ve 15m'yi tarar
  useEffect(() => {
    if (recs.length === 0 || !tazeAlertsEnabled) return;
    const chatId = getTelegramChatId();
    if (!chatId) return;
    for (const tf of ['5m', '15m'] as ScalpTf[]) {
      const currentTaze = recs.filter((r) => isFreshForTf(r, tf)).map((r) => r.stock.symbol).sort();
      const storageKey = `fa.scalp.lastTaze.${tf}`;
      let prevTaze: string[] | null = null;
      try {
        const raw = localStorage.getItem(storageKey);
        prevTaze = raw ? JSON.parse(raw) : null;
      } catch { prevTaze = null; }
      if (prevTaze === null) {
        // First time — sadece kaydet, bildirimsiz (spam onleme)
        try { localStorage.setItem(storageKey, JSON.stringify(currentTaze)); } catch { /* */ }
        continue;
      }
      const newOnes = currentTaze.filter((s) => !prevTaze!.includes(s));
      if (newOnes.length > 0) {
        const lines = newOnes.map((sym) => {
          const rec = recs.find((r) => r.stock.symbol === sym);
          if (!rec) return `• ${sym}`;
          const sign = rec.stock.changePct >= 0 ? '+' : '';
          return `• <b>${sym}</b> — ₺${rec.stock.price.toFixed(2)} (${sign}${rec.stock.changePct.toFixed(2)}%)`;
        });
        const message = `🚨 <b>Yeni TAZE Golden Cross</b> (${tfLabel(tf)})\n\n` +
          lines.join('\n') +
          `\n\n🌐 hanefinans.net/recommendations`;
        sendTelegram(message, 'HTML').catch(() => { /* sessizce gec */ });
      }
      try { localStorage.setItem(storageKey, JSON.stringify(currentTaze)); } catch { /* */ }
    }
  }, [recs, tazeAlertsEnabled]);

  // Daily snapshot — her gunun ilk basarili refresh'inde bugunkulistesini kaydet
  useEffect(() => {
    if (recs.length === 0) return;
    const today = todayDate();
    const snaps = loadSnapshots();
    const todaySnap = snaps.find((s) => s.date === today);
    if (todaySnap) return; // bugun zaten kaydedildi

    const entries: DailySnapshotEntry[] = recs.slice(0, 20).map((r) => ({
      symbol: r.stock.symbol,
      name: r.stock.name,
      entryPrice: r.stock.price,
      isLongAtEntry: isLongForTf(r, selectedTf),
      isFreshAtEntry: isFreshForTf(r, selectedTf),
    }));
    const newSnap: DailySnapshot = {
      date: today,
      ts: Date.now(),
      selectedTf,
      entries,
    };
    const updated = [newSnap, ...snaps]
      .filter((s) => daysAgo(s.date) <= SNAPSHOT_MAX_DAYS)
      .slice(0, SNAPSHOT_MAX_DAYS);
    saveSnapshots(updated);
  }, [recs, selectedTf]);

  const refresh = async (force = false) => {
    if (force) clearServiceCaches();
    setLoading(true);
    try {
      const r = await loadStocks(allSymbols);
      // Önce filtre: bugün hareketli olanlar (mutlak değişim > 0.3)
      const bistCandidates = [...r.data]
        .filter((s) => s.price > 0 && Number.isFinite(s.changePct) && Math.abs(s.changePct) > 0.1)
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 23); // Top 23 BIST + 2 emtia = 25 total

      // Emtia (XAUUSD, XAGUSD) spot çek
      const customStocks = await Promise.all(
        CUSTOM_SCAN_SYMBOLS.map(async (c) => {
          const spot = await fetchIndexYahoo(c.symbol);
          if (!spot) return null;
          return {
            symbol: c.symbol,
            name: c.displayName,
            sector: c.sector,
            price: spot.value,
            changePct: spot.changePct,
            updatedAt: new Date().toISOString(),
          } as Stock;
        })
      );
      const customCandidates = customStocks.filter((s): s is Stock => s !== null);
      const candidates = [...bistCandidates, ...customCandidates];

      // Her biri için 5m + 1h + 1d historical fetch + analiz
      const computed: ScalpRec[] = await Promise.all(
        candidates.map(async (stock) => {
          // Emtia sembolleri için BIST suffix (.IS) eklenmemeli
          const bistSuffix = !isCustomSymbol(stock.symbol);
          const [hist5m, hist1h, hist1d] = await Promise.all([
            // 1mo range: 5m'de ~5760 bar, 15m'e aggregate edince ~1920 bar
            // EMA 200 icin yeterli warm-up sunar
            fetchHistoricalYahoo(stock.symbol, '1mo', '5m', { bistSuffix }),
            fetchHistoricalYahoo(stock.symbol, '1mo', '60m', { bistSuffix }),
            fetchHistoricalYahoo(stock.symbol, '6mo', '1d', { bistSuffix }),
          ]);

          // 5m Golden Cross detect (EMA 50 > EMA 200 + fiyat > EMA 50)
          let scalp5mLong = false;
          let scalp5mScore = 0;
          let scalp5mFreshCross = false;
          let scalp15mLong = false;
          let scalp15mScore = 0;
          let scalp15mFreshCross = false;
          if (hist5m && hist5m.bars.length >= 200) {
            const closes5m = hist5m.bars.map((b) => b.close);
            const r5 = detectGoldenCross(closes5m);
            scalp5mLong = r5.isLong;
            scalp5mScore = r5.score;
            scalp5mFreshCross = r5.freshCross;
            // 15m: 5m'leri 3'erli aggregate et
            const closes15m = aggregateTo15m(closes5m);
            if (closes15m.length >= 200) {
              const r15 = detectGoldenCross(closes15m);
              scalp15mLong = r15.isLong;
              scalp15mScore = r15.score;
              scalp15mFreshCross = r15.freshCross;
            }
          }

          // Multi-timeframe
          let trend1h: TimeframeAnalysis | null = null;
          let trend4h: TimeframeAnalysis | null = null;
          let trend1d: TimeframeAnalysis | null = null;
          let emas: { period: number; value: number }[] = [];
          let bigPlayerLean: 'alıcı' | 'satıcı' | 'kararsız' = 'kararsız';

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
            const ohlc: OHLC[] = hist1d.bars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
            bigPlayerLean = computeBigPlayerLean(ohlc);
          }

          // Toplam long skoru — 5m + multi-TF
          const longCount = [trend1h, trend4h, trend1d].filter((t) => t?.trend === 'long').length;
          const longScore = scalp5mScore + longCount * 3 + (stock.changePct > 0 ? stock.changePct : 0);

          // Algoritmik yorum
          const mtBase: Omit<MultiTimeframeResult, 'verdict'> = {
            symbol: stock.symbol, label: stock.name, price: stock.price, changePct: stock.changePct,
            tf1h: trend1h, tf4h: trend4h, tf1d: trend1d, bigPlayerLean,
          };
          const verdict = buildVerdict(mtBase);

          return {
            stock,
            scalp5mLong,
            scalp5mScore,
            scalp5mFreshCross,
            scalp15mLong,
            scalp15mScore,
            scalp15mFreshCross,
            trend1h,
            trend4h,
            trend1d,
            emas,
            bigPlayerLean,
            verdict,
            longScore,
          };
        }),
      );

      // Sort: useMemo'da selectedTf-aware yapilir (refresh'te initial olarak longScore)
      computed.sort((a, b) => b.longScore - a.longScore);

      setRecs(computed.slice(0, 17));
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
        subtitle="Aracı kurum hisse önerileri, trend fonlar ve algoritmik kısa vade sinyalleri."
        actions={
          <div className="flex items-center gap-2">
            {tab !== 'broker' && <LiveBadge updatedAt={updatedAt} refreshing={loading} />}
            {tab !== 'broker' && (
              <button className="btn-secondary" onClick={() => refresh(true)} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
              </button>
            )}
          </div>
        }
      />

      <div className="mb-4 inline-flex flex-wrap rounded-lg border border-border bg-bg-soft p-1">
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition',
            tab === 'scalp' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
          )}
          onClick={() => setTab('scalp')}
        >
          <Zap size={14} /> Algoritmik ({sortedRecs.filter((r) => isLongForTf(r, selectedTf)).length}/{sortedRecs.length})
        </button>
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition',
            tab === 'broker' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
          )}
          onClick={() => setTab('broker')}
        >
          <Briefcase size={14} /> Aracı Kurum ({BROKER_COUNT})
        </button>
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition',
            tab === 'portfolio' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
          )}
          onClick={() => setTab('portfolio')}
        >
          <PieChart size={14} /> Model Portföyler ({PORTFOLIO_COUNT})
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

      {tab === 'broker' && <BrokerRecommendations />}
      {tab === 'portfolio' && <BrokerPortfolios />}

      {tab === 'scalp' && (
        <>
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-slate-300">
            <Zap size={12} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <strong className="text-accent">Golden Cross stratejisi:</strong> Seçili zaman diliminde EMA 50 üstüne çıkmış ve
              EMA 50 &gt; EMA 200 (golden cross aktif) hisseler. <strong>TAZE</strong> rozeti son 10 bar içinde gerçekleşen yeni golden cross'u işaretler.
            </span>
          </div>

          {sortedRecs.length > 0 && <HistoricalPerformanceCard recs={sortedRecs} />}

          {sortedRecs.length > 0 && <ScalpPoolStats recs={sortedRecs} selectedTf={selectedTf} />}

          {sortedRecs.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {/* Timeframe selector */}
              <div className="inline-flex rounded-lg border border-border bg-bg-soft p-1">
                <span className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">Zaman</span>
                {(['5m', '15m', '1h', '4h', '1d'] as const).map((tf) => (
                  <button
                    key={tf}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs font-mono transition',
                      selectedTf === tf ? 'bg-accent/20 text-accent' : 'text-slate-400 hover:text-slate-200',
                    )}
                    onClick={() => setSelectedTf(tf)}
                  >
                    {tfLabel(tf)}
                  </button>
                ))}
              </div>

              {/* Filter selector */}
              <div className="inline-flex rounded-lg border border-border bg-bg-soft p-1">
                {(['all', 'longonly', 'watchlist'] as const).map((f) => (
                  <button
                    key={f}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs transition',
                      scalpFilter === f ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
                    )}
                    onClick={() => setScalpFilter(f)}
                  >
                    {f === 'all' ? 'Tumu' : f === 'longonly' ? `Yalniz ${tfLabel(selectedTf)} Long` : 'Yalniz watchlist'}
                  </button>
                ))}
              </div>

              {/* Symbol search */}
              <input
                type="text"
                placeholder="Hisse ara (THYAO, GARAN...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input text-xs ml-auto w-full sm:w-56"
              />

              {/* TAZE alert toggle */}
              <button
                type="button"
                onClick={() => setTazeAlertsEnabled((v) => !v)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition',
                  tazeAlertsEnabled
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-border bg-bg-soft text-slate-400 hover:text-slate-200',
                )}
                title={tazeAlertsEnabled
                  ? 'TAZE bildirimleri aktif — yeni Golden Cross olunca Telegram\'a push'
                  : 'TAZE bildirimleri kapali — etkinlestir'}
              >
                {tazeAlertsEnabled ? <Bell size={11} /> : <BellOff size={11} />}
                <span className="hidden sm:inline">TAZE Bildirim</span>
              </button>
            </div>
          )}

          {loading && sortedRecs.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="rect" height={56} />)}
            </div>
          ) : (
            <div className="space-y-1.5">
              {sortedRecs
                .filter((rec) => {
                  // Filter chip
                  if (scalpFilter === 'longonly' && !isLongForTf(rec, selectedTf)) return false;
                  if (scalpFilter === 'watchlist' && !watchlistHas(rec.stock.symbol)) return false;
                  // Search query
                  const q = searchQuery.trim().toUpperCase();
                  if (q.length > 0) {
                    const sym = rec.stock.symbol.toUpperCase();
                    const name = (rec.stock.name ?? '').toUpperCase();
                    if (!sym.includes(q) && !name.includes(q)) return false;
                  }
                  return true;
                })
                .map((rec, i) => (
                  <ScalpRowItem
                    key={rec.stock.symbol}
                    rec={rec}
                    rank={i + 1}
                    selectedTf={selectedTf}
                    watched={watchlistHas(rec.stock.symbol)}
                    onToggle={() => toggleWatch(rec.stock.symbol)}
                  />
                ))}
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
                Yıllık getirisi en yüksek 10 fon (canlı TEFAS). Satıra tıklayıp açın, detay için TEFAS/Fintables linklerini kullan.
              </p>

              {/* Havuz istatistikleri */}
              <RecPoolStats boxes={computeFundPoolStats(topFunds)} />

              {/* Top/Bottom strip */}
              <FundConsensusStrip funds={topFunds} />

              {/* Akordeon liste */}
              <div className="space-y-1.5">
                {topFunds.map((fund, i) => (
                  <FundAccordionItem key={fund.code} fund={fund} rank={i + 1} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Tarihsel Performans karti — gecmis daily snapshot'lardaki onerilerin
 * MEVCUT (recs[]) fiyatlarla karsilastirildiginda performansi.
 *
 * recs[]: bugunkulistede su anda olan semboller (entry fiyatlari yok)
 * snapshots[]: gecmis gunlerden donen onerilerin o gunku entry fiyatlari
 *
 * Mantik: her snapshot icin, snapshot'daki sembolleri recs[]'te bul.
 * Mevcut fiyat ile snapshot.entryPrice arasindaki yuzde fark = getirisi.
 */
function HistoricalPerformanceCard({ recs }: { recs: ScalpRec[] }) {
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);

  useEffect(() => {
    setSnapshots(loadSnapshots());
  }, [recs]);

  // Bugunun snapshot'ini atla, yalniz gecmis gunler
  const today = todayDate();
  const pastSnaps = snapshots.filter((s) => s.date !== today);

  if (pastSnaps.length === 0) {
    return (
      <details className="card mb-3">
        <summary className="cursor-pointer px-3 py-2 text-xs text-slate-400 [&::-webkit-details-marker]:hidden flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gecmis Performans</span>
          <ChevronRight size={11} className="transition-transform group-open:rotate-90" />
          <span className="ml-auto text-[10px] text-slate-500">henuz kayit yok</span>
        </summary>
        <div className="border-t border-border px-3 py-3 text-xs text-slate-400">
          Bu gunkulistesi bu seansta kaydedildi. Yarin ve sonraki gunlerde geri donen onerilerin
          gercek performansini bu kartta gorebileceksin.
        </div>
      </details>
    );
  }

  // Her snapshot icin getirisini hesapla
  const recsBySymbol = new Map(recs.map((r) => [r.stock.symbol, r]));
  const perfData = pastSnaps.map((snap) => {
    const detailed = snap.entries.map((e) => {
      const current = recsBySymbol.get(e.symbol);
      if (!current) return null;
      const returnPct = ((current.stock.price - e.entryPrice) / e.entryPrice) * 100;
      return { ...e, currentPrice: current.stock.price, returnPct };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    if (detailed.length === 0) {
      return { snap, hitRate: 0, avgReturn: 0, count: 0, top: null, bottom: null };
    }
    const positive = detailed.filter((d) => d.returnPct > 0).length;
    const hitRate = (positive / detailed.length) * 100;
    const avgReturn = detailed.reduce((s, d) => s + d.returnPct, 0) / detailed.length;
    const sorted = [...detailed].sort((a, b) => b.returnPct - a.returnPct);
    return {
      snap,
      hitRate,
      avgReturn,
      count: detailed.length,
      top: sorted[0],
      bottom: sorted[sorted.length - 1],
    };
  });

  return (
    <details className="card group mb-3">
      <summary className="cursor-pointer px-3 py-2.5 text-xs [&::-webkit-details-marker]:hidden flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gecmis Performans</span>
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent">{pastSnaps.length} kayit</span>
        <ChevronRight size={11} className="text-slate-500 transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border px-3 py-3">
        <div className="space-y-2">
          {perfData.map(({ snap, hitRate, avgReturn, count, top, bottom }) => {
            const ageDays = daysAgo(snap.date);
            const ageLabel = ageDays === 0 ? 'bugun' : ageDays === 1 ? '1 gun once' : `${ageDays} gun once`;
            const returnClass = avgReturn >= 0 ? 'text-success' : 'text-danger';
            const sign = avgReturn >= 0 ? '+' : '';
            return (
              <div key={snap.date} className="rounded-lg border border-border bg-bg-soft p-2.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-mono text-slate-300">{snap.date}</span>
                  <span className="text-slate-500">{ageLabel}</span>
                  <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[9px] uppercase text-slate-400">
                    {tfLabel(snap.selectedTf)} · {count} eslesme
                  </span>
                  <span className={cn('ml-auto font-semibold tabular-nums', returnClass)}>
                    Ort: {sign}{avgReturn.toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Isabet: %{hitRate.toFixed(0)}
                  </span>
                </div>
                {(top || bottom) && (
                  <div className="mt-1.5 flex gap-3 text-[10px]">
                    {top && (
                      <span className="text-success">
                        En iyi: <span className="font-mono font-bold">{top.symbol}</span> +{top.returnPct.toFixed(2)}%
                      </span>
                    )}
                    {bottom && bottom.returnPct < 0 && (
                      <span className="text-danger">
                        En kotu: <span className="font-mono font-bold">{bottom.symbol}</span> {bottom.returnPct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
          ℹ Bu metrik bugun listede HALA olan sembolleri esleştirir. Listeden cikmis semboller hesapta yer almaz.
          Snapshot her gun ilk refresh'te otomatik kaydedilir.
        </p>
      </div>
    </details>
  );
}

function ScalpPoolStats({ recs, selectedTf }: { recs: ScalpRec[]; selectedTf: ScalpTf }) {
  const total = recs.length;
  const scalpLong = recs.filter((r) => isLongForTf(r, selectedTf)).length;
  const avgChange = total > 0 ? recs.reduce((s, r) => s + r.stock.changePct, 0) / total : 0;
  const alici = recs.filter((r) => r.bigPlayerLean === 'alıcı').length;
  const satici = recs.filter((r) => r.bigPlayerLean === 'satıcı').length;
  const kararsiz = total - alici - satici;
  const positiveCount = recs.filter((r) => r.stock.changePct > 0).length;
  const hitRate = total > 0 ? (positiveCount / total) * 100 : 0;
  const topSymbol = recs[0]?.stock.symbol;
  const topChange = recs[0]?.stock.changePct ?? 0;

  return (
    <div className="card mb-3 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <PoolStatBox label="Toplam" value={`${total}`} tone="slate" />
        <PoolStatBox label={`${tfLabel(selectedTf)} Long`} value={`${scalpLong}/${total}`} tone="success" />
        <PoolStatBox label="Ort. Degisim" value={`${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`} tone={avgChange >= 0 ? 'success' : 'danger'} />
        <PoolStatBox label="Pozitif Oran" value={`%${hitRate.toFixed(0)}`} tone="accent" />
        <PoolStatBox label="Alici/Satici" value={`${alici} / ${satici}`} sub={`${kararsiz} kararsiz`} tone="warning" />
        <PoolStatBox label="Lider" value={topSymbol ?? '-'} sub={topChange ? `${topChange >= 0 ? '+' : ''}${topChange.toFixed(2)}%` : undefined} tone={topChange >= 0 ? 'success' : 'danger'} />
      </div>
    </div>
  );
}

function PoolStatBox({ label, value, sub, tone }: {
  label: string;
  value: string;
  sub?: string;
  tone: 'slate' | 'success' | 'danger' | 'accent' | 'warning';
}) {
  const colorClass = tone === 'success' ? 'text-success'
    : tone === 'danger' ? 'text-danger'
    : tone === 'accent' ? 'text-accent'
    : tone === 'warning' ? 'text-warning'
    : 'text-slate-100';
  return (
    <div className="rounded-lg border border-border bg-bg-soft px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-0.5 text-base font-bold tabular-nums leading-tight', colorClass)}>{value}</div>
      {sub && <div className="text-[9px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ScalpRowItem({ rec, rank, selectedTf, watched, onToggle }: {
  rec: ScalpRec;
  rank: number;
  selectedTf: ScalpTf;
  watched: boolean;
  onToggle: () => void;
}) {
  const { stock } = rec;
  const isLong = isLongForTf(rec, selectedTf);
  const tone = stock.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = stock.changePct >= 0 ? '+' : '';
  const leanColor = rec.bigPlayerLean === 'alıcı' ? 'text-success'
    : rec.bigPlayerLean === 'satıcı' ? 'text-danger'
    : 'text-slate-400';
  const leanLabel = rec.bigPlayerLean === 'alıcı' ? 'Alici'
    : rec.bigPlayerLean === 'satıcı' ? 'Satici'
    : 'Kararsiz';

  return (
    <details className={cn(
      'group rounded-lg border transition',
      isLong ? 'border-success/40 bg-success/5' : 'border-border bg-bg-soft hover:border-accent/40',
    )}>
      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm select-none [&::-webkit-details-marker]:hidden">
        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md border font-bold text-xs', isLong ? 'border-success/40 bg-success/10 text-success' : 'border-accent/30 bg-accent/10 text-accent')}>
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link to={`/stock/${stock.symbol}`} className="font-mono font-bold text-slate-100 hover:text-accent" onClick={(e) => e.stopPropagation()}>
              {stock.symbol}
            </Link>
            {stock.sector && (
              <span className="rounded border border-border bg-bg-card px-1 py-0.5 text-[9px] text-slate-400">{stock.sector}</span>
            )}
            {isLong && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                <Zap size={8} />{tfLabel(selectedTf)} GC
              </span>
            )}
            {((selectedTf === '5m' && rec.scalp5mFreshCross) || (selectedTf === '15m' && rec.scalp15mFreshCross)) && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                TAZE
              </span>
            )}
            {watched && <Star size={10} className="text-warning" fill="currentColor" />}
          </div>
          <div className="truncate text-[10px] text-slate-500">{stock.name}</div>
        </div>
        <div className="hidden lg:flex items-center gap-1 text-[9px]">
          {(['1h', '4h', '1d'] as const).map((tfKey) => {
            const t = tfKey === '1h' ? rec.trend1h : tfKey === '4h' ? rec.trend4h : rec.trend1d;
            const label = tfKey === '1h' ? '1H' : tfKey === '4h' ? '4H' : '1G';
            const selected = selectedTf === tfKey;
            if (!t) return <span key={tfKey} className={cn('rounded px-1 py-0.5 text-slate-500', selected ? 'ring-1 ring-accent' : 'bg-slate-500/15')}>{label}</span>;
            const cls = t.trend === 'long' ? 'bg-success/15 text-success' : t.trend === 'short' ? 'bg-danger/15 text-danger' : 'bg-slate-500/15 text-slate-400';
            return <span key={tfKey} className={cn('rounded px-1 py-0.5 font-mono', cls, selected && 'ring-1 ring-accent')}>{label}</span>;
          })}
        </div>
        <span className={cn('hidden md:inline-block w-16 text-right text-[10px] font-semibold', leanColor)}>
          {leanLabel}
        </span>
        <div className="w-20 text-right">
          <div className="text-sm font-bold tabular-nums text-slate-100">{formatMoney(stock.price)}</div>
          <div className={cn('text-[10px] font-semibold tabular-nums', tone)}>{sign}{stock.changePct.toFixed(2)}%</div>
        </div>
        <ChevronRight size={14} className="shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border">
        <ScalpCard rec={rec} rank={rank} watched={watched} onToggle={onToggle} />
      </div>
    </details>
  );
}

function ScalpCard({ rec, rank, watched, onToggle }: {
  rec: ScalpRec;
  rank: number;
  watched: boolean;
  onToggle: () => void;
}) {
  const user = useAuth((s) => s.user);
  const proUser = isPro(user);
  const { stock } = rec;
  const tone = stock.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = stock.changePct >= 0 ? '+' : '';
  const leanColor = rec.bigPlayerLean === 'alıcı' ? 'border-success/40 bg-success/10 text-success'
    : rec.bigPlayerLean === 'satıcı' ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-slate-500/40 bg-slate-500/10 text-slate-300';

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

      {/* Multi-timeframe trend — 1H açık, 4H/1D PRO */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <TfBox label="1 SAATLİK" ta={rec.trend1h} />
        {proUser ? <TfBox label="4 SAATLİK" ta={rec.trend4h} /> : <LockedTfBox label="4 SAATLİK" />}
        {proUser ? <TfBox label="GÜNLÜK" ta={rec.trend1d} /> : <LockedTfBox label="GÜNLÜK" />}
      </div>

      {/* Büyük Oyuncu Eğilimi — PRO */}
      {proUser ? (
        <div className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', leanColor)}>
          <div className="flex items-center justify-between">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Büyük Oyuncu Eğilimi</span>
            <span className="font-bold uppercase">
              {rec.bigPlayerLean === 'alıcı' ? '↑ ALICI BASKIN' : rec.bigPlayerLean === 'satıcı' ? '↓ SATICI BASKIN' : '↔ KARARSIZ'}
            </span>
          </div>
        </div>
      ) : (
        <Link
          to="/uyelik"
          className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning transition hover:bg-warning/15"
        >
          <span className="flex items-center gap-2">
            <Lock size={11} />
            <span className="font-semibold uppercase tracking-wider text-[10px]">Büyük Oyuncu Eğilimi</span>
          </span>
          <span className="font-bold uppercase">🔒 PRO</span>
        </Link>
      )}

      {/* Algoritmik Yorum — PRO */}
      {rec.verdict && (
        proUser ? (
          <div className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-300">
            <strong className="text-accent">Algoritmik Yorum: </strong>
            {rec.verdict}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-slate-400">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <Lock size={11} className="text-warning" />
                <strong className="text-warning">Algoritmik Yorum</strong> — 4H + Günlük + büyük oyuncu analizini içerir
              </span>
              <Link to="/uyelik" className="rounded-md bg-warning/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-warning hover:bg-warning/30">
                PRO'ya Geç →
              </Link>
            </div>
          </div>
        )
      )}

      {/* EMA Fiyatları — PRO */}
      {rec.emas.length > 0 && (
        proUser ? (
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
        ) : (
          <Link to="/uyelik" className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning hover:bg-warning/10">
            <span className="flex items-center gap-1.5">
              <Lock size={11} />
              <span className="font-semibold uppercase tracking-wider text-[10px]">EMA Pozisyonları (Günlük)</span>
            </span>
            <span className="text-[10px] font-bold uppercase">🔒 PRO</span>
          </Link>
        )
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

function LockedTfBox({ label }: { label: string }) {
  return (
    <Link
      to="/uyelik"
      className="group relative rounded border border-warning/30 bg-warning/5 p-2 text-center transition hover:bg-warning/10"
      title="PRO/ELITE üyelere özel — Yükselt"
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 flex items-center justify-center gap-1 text-sm font-bold text-warning">
        <Lock size={11} /> PRO
      </div>
      <div className="mt-0.5 text-[9px] text-warning/80 group-hover:underline">
        Yükselt →
      </div>
    </Link>
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

/**
 * TEFAS fonları için pool stats (toplam fon, ortalama YTD, pozitif oran,
 * en yüksek/en düşük 1Y, dominant kategori).
 */
function computeFundPoolStats(funds: FundPerformance[]): PoolStatBoxData[] {
  const total = funds.length;
  if (total === 0) return [];
  const validYear = funds.filter((f) => Number.isFinite(f.year));
  const validYtd = funds.filter((f) => Number.isFinite(f.ytd));
  const avgYear = validYear.length > 0
    ? validYear.reduce((s, f) => s + f.year, 0) / validYear.length
    : 0;
  const avgYtd = validYtd.length > 0
    ? validYtd.reduce((s, f) => s + f.ytd, 0) / validYtd.length
    : 0;
  const positives = validYear.filter((f) => f.year >= 0).length;
  const positiveRatio = validYear.length > 0 ? (positives / validYear.length) * 100 : 0;
  const sortedYear = [...validYear].sort((a, b) => b.year - a.year);
  const best = sortedYear[0];
  const worst = sortedYear[sortedYear.length - 1];

  // Dominant kategori
  const catCounts = new Map<string, number>();
  funds.forEach((f) => catCounts.set(f.category, (catCounts.get(f.category) ?? 0) + 1));
  const dominantCat = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return [
    { label: 'Toplam Fon',  value: `${total}`, sub: `${catCounts.size} kategori`, tone: 'slate' },
    { label: 'Ort. 1Y',     value: `${avgYear >= 0 ? '+' : ''}${avgYear.toFixed(1)}%`, tone: avgYear >= 0 ? 'success' : 'danger' },
    { label: 'Ort. YTD',    value: `${avgYtd >= 0 ? '+' : ''}${avgYtd.toFixed(1)}%`, tone: avgYtd >= 0 ? 'success' : 'danger' },
    { label: 'Pozitif Oran', value: `%${positiveRatio.toFixed(0)}`, sub: `${positives}/${validYear.length}`, tone: 'accent' },
    { label: 'En Yüksek',   value: best ? best.code : '-', sub: best ? `+${best.year.toFixed(1)}%` : undefined, tone: 'success' },
    { label: 'Dominant',    value: dominantCat ? dominantCat[0] : '-', sub: dominantCat ? `${dominantCat[1]} fon` : undefined, tone: 'warning' },
  ];
}

/** Top 3 / Bottom 3 fon (1Y getiri bazlı). */
function FundConsensusStrip({ funds }: { funds: FundPerformance[] }) {
  const valid = funds.filter((f) => Number.isFinite(f.year));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => b.year - a.year);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();

  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-success">Top 3 (1Y)</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {top3.map((f) => (
            <Link key={f.code} to={`/fund/${f.code}`} className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 font-mono font-semibold text-success hover:bg-success/20">
              {f.code}<span className="text-[10px] opacity-70">+{f.year.toFixed(1)}%</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-danger">Bottom 3 (1Y)</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {bottom3.map((f) => (
            <Link key={f.code} to={`/fund/${f.code}`} className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-0.5 font-mono font-semibold text-danger hover:bg-danger/20">
              {f.code}<span className="text-[10px] opacity-70">{f.year >= 0 ? '+' : ''}{f.year.toFixed(1)}%</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * TEFAS fonu akordeon satırı. Summary'de kod + kategori + 1Y getiri,
 * açılınca tüm dönem performansları + detay linkleri.
 */
function FundAccordionItem({ fund, rank }: { fund: FundPerformance; rank: number }) {
  const yearTone = fund.year >= 0 ? 'text-success' : 'text-danger';
  const isLong = fund.year > 0;

  return (
    <details className={cn(
      'group rounded-lg border transition',
      isLong ? 'border-success/40 bg-success/5' : 'border-border bg-bg-soft hover:border-accent/40',
    )}>
      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm select-none [&::-webkit-details-marker]:hidden">
        <span className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-md border font-bold text-xs',
          isLong ? 'border-success/40 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning',
        )}>
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link to={`/fund/${fund.code}`} className="font-mono font-bold text-slate-100 hover:text-accent" onClick={(e) => e.stopPropagation()}>
              {fund.code}
            </Link>
            <span className="rounded border border-border bg-bg-card px-1 py-0.5 text-[9px] text-slate-400">{fund.category}</span>
            {fund.tefas && (
              <span className="rounded bg-success/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">TEFAS</span>
            )}
          </div>
          {fund.name && <div className="truncate text-[10px] text-slate-500">{fund.name}</div>}
        </div>
        <div className="hidden md:flex items-center gap-1 text-[9px]">
          <PerfMicro label="1A" value={fund.month} />
          <PerfMicro label="3A" value={fund.threeMonth} />
          <PerfMicro label="YTD" value={fund.ytd} />
        </div>
        <div className="w-20 text-right">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">1 Yıl</div>
          <div className={cn('text-sm font-bold tabular-nums', yearTone)}>
            {fund.year >= 0 ? '+' : ''}{fund.year.toFixed(2)}%
          </div>
        </div>
        <ChevronRight size={14} className="shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
      </summary>

      <div className="border-t border-border bg-bg-card p-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
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
    </details>
  );
}

/** Summary'de compact mini perf chip (1A/3A/YTD için). */
function PerfMicro({ label, value }: { label: string; value: number }) {
  if (!Number.isFinite(value)) {
    return <span className="rounded bg-bg-card px-1 py-0.5 text-slate-500">{label} —</span>;
  }
  const tone = value >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger';
  return (
    <span className={cn('rounded px-1 py-0.5 font-mono tabular-nums', tone)}>
      {label} {value >= 0 ? '+' : ''}{value.toFixed(1)}
    </span>
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
