import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PiggyBank, RefreshCw, Zap, Briefcase, PieChart, Bell, BellOff, TrendingUp, Star, ExternalLink } from 'lucide-react';
import { BrokerRecommendations } from '@/components/domain/BrokerRecommendations';
import { BrokerPortfolios } from '@/components/domain/BrokerPortfolios';
import { RecPoolStats } from '@/components/domain/RecPoolStats';
import { BROKER_RECOMMENDATIONS } from '@/data/brokerRecommendations';
import { BROKER_PORTFOLIOS } from '@/data/brokerPortfolios';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { loadStocks, clearServiceCaches } from '@/data/services';
import { fetchHistoricalYahoo, fetchIndexYahoo } from '@/data/api/yahoo';
import { ema, type OHLC } from '@/lib/indicators';
import {
  analyzeTimeframe, aggregateTo4h, computeBigPlayerLean, buildVerdict,
  type TimeframeAnalysis, type MultiTimeframeResult,
} from '@/lib/multiTimeframe';
import { sendTelegram, getTelegramChatId } from '@/lib/telegram';
import { MOCK_STOCKS } from '@/data/mock';
import { BIST_SCOPES, isInBistScope, type BistScopeCode } from '@/data/bistIndices';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import type { Stock, FundPerformance } from '@/data/types';
import { formatMoney } from '@/lib/format';
import { useWatchlist } from '@/store/watchlist';
import { cn } from '@/lib/utils';
import { PinnableAccordion } from '@/components/domain/PinnableAccordion';
import { AnalystCommentary } from '@/components/domain/AnalystCommentary';
import { MessageSquare } from 'lucide-react';

// Modüler section'lar — `./sections/` altında her biri kendi dosyasında
import type { ScalpTf, ScalpRec, DailySnapshotEntry, DailySnapshot } from './sections/types';
import { CUSTOM_SCAN_SYMBOLS, isCustomSymbol } from './sections/types';
import {
  aggregateTo15m, detectGoldenCross, isFreshForTf, isLongForTf, scoreForTf, tfLabel,
} from './sections/scalpHelpers';
import { loadSnapshots, saveSnapshots, todayDate, daysAgo, SNAPSHOT_MAX_DAYS } from './sections/snapshotStore';
import { HistoricalPerformanceCard } from './sections/HistoricalPerformanceCard';
import { ScalpPoolStats } from './sections/ScalpPoolStats';
import { ScalpRowItem } from './sections/ScalpRowItem';
import { FundConsensusStrip, computeFundPoolStats } from './sections/FundConsensusStrip';
import { FundAccordionItem } from './sections/FundAccordionItem';
import { StrongBuyTab } from './sections/StrongBuyTab';
import { FundPoolTab } from './sections/FundPoolTab';
import { SeoHead } from '@/components/seo/SeoHead';
import { SortableHeader } from '@/components/ui/SortableHeader';

type TrendFundSortKey = 'day' | 'week' | 'month' | 'threeMonth' | 'sixMonth' | 'ytd' | 'year';
type AlgoSortKey = 'price' | 'changePct';

const BROKER_COUNT = BROKER_RECOMMENDATIONS.length;
const PORTFOLIO_COUNT = BROKER_PORTFOLIOS.length;

const AUTO_REFRESH_MS = 120_000;

// Module-level memo cache — sayfa değişimlerinde yeniden fetch'i önler
const RECS_MEMO_TTL_MS = 2 * 60_000;
interface RecsMemo {
  fetchedAt: number;
  recs: ScalpRec[];
  topFunds: FundPerformance[];
  fundsConfigured: boolean;
  updatedAt: number;
}
let recsMemo: RecsMemo | null = null;

export function RecommendationsPage() {
  const [tab, setTab] = useState<'broker' | 'portfolio' | 'scalp' | 'funds' | 'fundpool' | 'strongbuy'>('fundpool');
  // Trend Fonlar tab sort
  const [tfSortKey, setTfSortKey] = useState<TrendFundSortKey>('year');
  const [tfSortDir, setTfSortDir] = useState<'asc' | 'desc'>('desc');
  const setTfSort = (k: TrendFundSortKey) => {
    if (k === tfSortKey) setTfSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setTfSortKey(k); setTfSortDir('desc'); }
  };
  // Algoritmik tab sort (Fiyat / Gün %); null = default heuristic sort (TAZE > Long > Score)
  const [algoSortKey, setAlgoSortKey] = useState<AlgoSortKey | null>(null);
  const [algoSortDir, setAlgoSortDir] = useState<'asc' | 'desc'>('desc');
  const setAlgoSort = (k: AlgoSortKey) => {
    if (k === algoSortKey) setAlgoSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setAlgoSortKey(k); setAlgoSortDir('desc'); }
  };
  const [scalpFilter, setScalpFilter] = useState<'all' | 'longonly' | 'watchlist'>('all');
  // BIST kapsamı — Algoritmik (MA Üçlü Üst) havuzunda default BIST 100
  const [algoScopeFilter, setAlgoScopeFilter] = useState<BistScopeCode>(() => {
    try {
      const saved = localStorage.getItem('fa.algo.scopeFilter');
      if (saved === 'XU100' || saved === 'XU030' || saved === 'BISTTUM') return saved;
    } catch { /* */ }
    return 'XU100';
  });
  useEffect(() => {
    try { localStorage.setItem('fa.algo.scopeFilter', algoScopeFilter); } catch { /* */ }
  }, [algoScopeFilter]);
  const [selectedTf, setSelectedTf] = useState<ScalpTf>('5m');
  const [searchQuery, setSearchQuery] = useState('');
  const [tazeAlertsEnabled, setTazeAlertsEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('fa.scalp.tazeAlertsEnabled') === '1'; } catch { return false; }
  });
  const [recs, setRecs] = useState<ScalpRec[]>(() => recsMemo?.recs ?? []);
  const [topFunds, setTopFunds] = useState<FundPerformance[]>(() => recsMemo?.topFunds ?? []);
  const [fundsConfigured, setFundsConfigured] = useState(() => recsMemo?.fundsConfigured ?? true);
  const [loading, setLoading] = useState(() => !recsMemo);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(() => recsMemo?.updatedAt);

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
        // First time — sadece kaydet, bildirimsiz (spam önleme)
        try { localStorage.setItem(storageKey, JSON.stringify(currentTaze)); } catch { /* */ }
        continue;
      }
      const newOnes = currentTaze.filter((s) => !prevTaze!.includes(s));
      if (newOnes.length > 0) {
        const lines = newOnes.map((sym) => {
          const rec = recs.find((r) => r.stock.symbol === sym);
          if (!rec) return `• ${sym}`;
          const s = rec.stock.changePct >= 0 ? '+' : '';
          return `• <b>${sym}</b> — ₺${rec.stock.price.toFixed(2)} (${s}${rec.stock.changePct.toFixed(2)}%)`;
        });
        const message = `🚨 <b>Yeni TAZE MA Üçlü Üst</b> (${tfLabel(tf)})\n\n` +
          lines.join('\n') +
          `\n\n🌐 investliq.com/recommendations`;
        sendTelegram(message, 'HTML').catch(() => { /* sessizce geç */ });
      }
      try { localStorage.setItem(storageKey, JSON.stringify(currentTaze)); } catch { /* */ }
    }
  }, [recs, tazeAlertsEnabled]);

  // Daily snapshot — her günün ilk başarılı refresh'inde bugünkü listeyi kaydet
  useEffect(() => {
    if (recs.length === 0) return;
    const today = todayDate();
    const snaps = loadSnapshots();
    const todaySnap = snaps.find((s) => s.date === today);
    if (todaySnap) return; // bugün zaten kaydedildi

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
      // Önce filtre: bugün hareketli olanlar (mutlak değişim > 0.1)
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
            // EMA 200 için yeterli warm-up sunar
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
          const emas: { period: number; value: number }[] = [];
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

      // Sort: useMemo'da selectedTf-aware yapılır (refresh'te initial olarak longScore)
      computed.sort((a, b) => b.longScore - a.longScore);

      setRecs(computed.slice(0, 17));
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  // Memo cache sync
  useEffect(() => {
    if (recs.length > 0 && updatedAt) {
      recsMemo = {
        fetchedAt: Date.now(),
        recs,
        topFunds,
        fundsConfigured,
        updatedAt,
      };
    }
  }, [recs, topFunds, fundsConfigured, updatedAt]);

  useEffect(() => {
    const memoAge = recsMemo ? Date.now() - recsMemo.fetchedAt : Infinity;
    if (memoAge < RECS_MEMO_TTL_MS) {
      setLoading(false);
      const id = setInterval(() => refresh(true), AUTO_REFRESH_MS);
      return () => clearInterval(id);
    }
    refresh(true);
    const id = setInterval(() => refresh(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fon Havuzu için TÜM fonları sakla; Trend Fonlar için ilk 10'u türet
  const [allFunds, setAllFunds] = useState<FundPerformance[]>([]);

  useEffect(() => {
    if (recsMemo && (recsMemo.topFunds.length > 0 || !recsMemo.fundsConfigured)) return;
    let alive = true;
    loadFundsAsPerformance().then((r) => {
      if (!alive) return;
      if (!r) {
        setFundsConfigured(false);
        setTopFunds([]);
        setAllFunds([]);
        return;
      }
      setAllFunds(r.funds);
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
      <SeoHead title="Öneriler" description="Hisse ve fon önerileri — scalp, swing, uzun vadeli sinyaller. Çoklu zaman dilimi teknik analiz." path="/recommendations" />

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


      {/* Sira: Fon Havuzu -> Hisse Havuzu -> Algoritmik (MA Uclu Ust) -> Araci Kurum -> Model Portfoyler.
          Hepsi default kapali — kullanici hangisini isterse acar. */}
      <PinnableAccordion id="recs-fundpool" title="Fon Havuzu" icon={<PiggyBank size={16} />} iconColorClass="bg-accent/15 text-accent">
        <FundPoolTab allFunds={allFunds} />
      </PinnableAccordion>
      <PinnableAccordion id="recs-strongbuy" title="Guclu Al Hisse Havuzu" icon={<TrendingUp size={16} />} iconColorClass="bg-success/15 text-success">
        <StrongBuyTab />
      </PinnableAccordion>
      <PinnableAccordion id="recs-analyst" title="Aracı Kurum Bültenleri" icon={<MessageSquare size={16} />} iconColorClass="bg-info/15 text-info">
        <AnalystCommentary />
      </PinnableAccordion>
      <PinnableAccordion id="recs-broker" title={`Araci Kurum (${BROKER_COUNT})`} icon={<Briefcase size={16} />} iconColorClass="bg-warning/15 text-warning">
        <BrokerRecommendations />
      </PinnableAccordion>
      <PinnableAccordion id="recs-portfolio" title={`Model Portfoyler (${PORTFOLIO_COUNT})`} icon={<PieChart size={16} />} iconColorClass="bg-info/15 text-info">
        <BrokerPortfolios />
      </PinnableAccordion>

      <PinnableAccordion id="recs-algo" title="Algoritmik (MA Uclu Ust)" icon={<Zap size={16} />} iconColorClass="bg-accent/15 text-accent">
        <>
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-slate-300">
            <Zap size={12} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <strong className="text-accent">MA Üçlü Üst stratejisi:</strong> Seçili zaman diliminde fiyatı{' '}
              <strong>MA 5, MA 8 ve MA 13</strong>'ün tümünün üstünde + dizilim sağlam (MA 5 &gt; MA 8 &gt; MA 13) olan hisseler.
              Güçlü kısa vade yukarı trend. <strong>TAZE</strong> rozeti son 5 bar içinde bu duruma geçen yeni sinyali işaretler.
            </span>
          </div>

          {sortedRecs.length > 0 && <HistoricalPerformanceCard recs={sortedRecs} />}

          {/* Algoritmik tab üst özet bloğu (ScalpPoolStats) kullanıcı talebi ile kaldırıldı. */}

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

              {/* BIST kapsam chip'leri — BIST 100 / BIST 30 / BIST Tüm (en başta) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Kapsam:</span>
                {BIST_SCOPES.map((sc) => {
                  const isActive = algoScopeFilter === sc.code;
                  return (
                    <button
                      key={sc.code}
                      type="button"
                      onClick={() => setAlgoScopeFilter(sc.code)}
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-[11px] font-medium transition',
                        isActive
                          ? 'border-accent/50 bg-accent/15 text-accent shadow-sm shadow-accent/10'
                          : 'border-border bg-bg-soft text-slate-400 hover:border-accent/30 hover:text-slate-200',
                      )}
                      aria-pressed={isActive}
                    >
                      {sc.label}
                    </button>
                  );
                })}
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
                  ? 'TAZE bildirimleri aktif — yeni MA Üçlü Üst olunca Telegram\'a push'
                  : 'TAZE bildirimleri kapali — etkinlestir'}
              >
                {tazeAlertsEnabled ? <Bell size={11} /> : <BellOff size={11} />}
                <span className="hidden sm:inline">TAZE Bildirim</span>
              </button>
            </div>
          )}

          {loading && sortedRecs.length === 0 ? (
            <TableSkeleton rows={10} cols={9} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
              <table className="w-full min-w-[860px] text-xs">
                <thead className="border-b border-border bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="sticky left-0 z-20 bg-bg-soft px-2 py-2.5 text-left">#</th>
                    <th className="sticky left-8 z-20 bg-bg-soft px-2 py-2.5 text-left">Sembol</th>
                    <th className="px-2 py-2.5 text-left hidden md:table-cell">Şirket / Sektör</th>
                    <SortableHeader label="Fiyat" sortKey="price" activeKey={algoSortKey ?? ''} dir={algoSortDir} onClick={setAlgoSort} />
                    <SortableHeader label="Gün %" sortKey="changePct" activeKey={algoSortKey ?? ''} dir={algoSortDir} onClick={setAlgoSort} />
                    <th className="px-2 py-2.5 text-center hidden lg:table-cell">1H</th>
                    <th className="px-2 py-2.5 text-center hidden lg:table-cell">4H</th>
                    <th className="px-2 py-2.5 text-center hidden lg:table-cell">1G</th>
                    <th className="px-2 py-2.5 text-center hidden md:table-cell">Yön</th>
                    <th className="px-2 py-2.5 text-center">Durum</th>
                    <th className="px-2 py-2.5 text-center w-12">⭐</th>
                  </tr>
                </thead>
                <tbody>
                  {(algoSortKey == null
                    ? sortedRecs
                    : [...sortedRecs].sort((a, b) => {
                        const va = algoSortKey === 'price' ? a.stock.price : a.stock.changePct;
                        const vb = algoSortKey === 'price' ? b.stock.price : b.stock.changePct;
                        return algoSortDir === 'asc' ? va - vb : vb - va;
                      })
                  )
                    .filter((rec) => {
                      // BIST kapsam filtresi (XU100 / XU030 / BISTTUM)
                      if (!isInBistScope(rec.stock.symbol, algoScopeFilter)) return false;
                      if (scalpFilter === 'longonly' && !isLongForTf(rec, selectedTf)) return false;
                      if (scalpFilter === 'watchlist' && !watchlistHas(rec.stock.symbol)) return false;
                      const q = searchQuery.trim().toUpperCase();
                      if (q.length > 0) {
                        const sym = rec.stock.symbol.toUpperCase();
                        const name = (rec.stock.name ?? '').toUpperCase();
                        if (!sym.includes(q) && !name.includes(q)) return false;
                      }
                      return true;
                    })
                    .map((rec, i) => (
                      <ScalpTableRow
                        key={rec.stock.symbol}
                        rec={rec}
                        rank={i + 1}
                        selectedTf={selectedTf}
                        watched={watchlistHas(rec.stock.symbol)}
                        onToggle={() => toggleWatch(rec.stock.symbol)}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-500">
            ⚠️ Vur-kaç önerileri kısa vadeli teknik sinyallerdir; yatırım tavsiyesi değildir. Sıkı stop-loss ile pozisyon yönet.
          </p>
        </>
      </PinnableAccordion>

    </>
  );
}

// ============================================================================
// Trend Fonlar tablo satırı — Fonlar sayfası düzeniyle uyumlu
// ============================================================================
function TrendFundRow({ fund, rank }: { fund: FundPerformance; rank: number }) {
  const sign = (v: number) => (v >= 0 ? '+' : '');
  const tone = (v: number | undefined) =>
    v == null || !Number.isFinite(v) ? 'text-slate-500' : v >= 0 ? 'text-success' : 'text-danger';
  const fmt = (v: number | undefined) =>
    v == null || !Number.isFinite(v) ? '—' : `${sign(v)}${v.toFixed(2)}%`;

  return (
    <tr className="group border-b border-border/60 transition hover:bg-bg-card">
      <td className="sticky left-0 z-10 bg-bg-soft px-2 py-2 text-left text-[11px] text-slate-500 tabular-nums">{rank}</td>
      <td className="sticky left-8 z-10 bg-bg-soft px-2 py-2 text-left">
        <Link
          to={`/fund/${fund.code}`}
          className="font-mono text-[13px] font-semibold text-accent hover:underline"
        >
          {fund.code}
        </Link>
      </td>
      <td className="px-2 py-2 text-left hidden md:table-cell">
        {fund.name && <div className="truncate max-w-[260px] text-slate-200">{fund.name}</div>}
        <span className="mt-0.5 inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">
          {fund.category}
        </span>
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums', tone(fund.day))}>{fmt(fund.day)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', tone(fund.week))}>{fmt(fund.week)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums', tone(fund.month))}>{fmt(fund.month)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums', tone(fund.threeMonth))}>{fmt(fund.threeMonth)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', tone(fund.sixMonth))}>{fmt(fund.sixMonth)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums hidden xl:table-cell', tone(fund.ytd))}>{fmt(fund.ytd)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums font-semibold', tone(fund.year))}>{fmt(fund.year)}</td>
      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <a
          href={`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(fund.code)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success hover:bg-success/20"
          title="TEFAS'ta aç"
        >
          TEFAS <ExternalLink size={8} />
        </a>
      </td>
    </tr>
  );
}

// ============================================================================
// Algoritmik Scalp tablo satırı — Fonlar sayfası düzeniyle uyumlu
// ============================================================================
function ScalpTableRow({ rec, rank, selectedTf, watched, onToggle }: {
  rec: ScalpRec;
  rank: number;
  selectedTf: ScalpTf;
  watched: boolean;
  onToggle: () => void;
}) {
  const { stock } = rec;
  const isLong = isLongForTf(rec, selectedTf);
  const dayTone = stock.changePct >= 0 ? 'text-success' : 'text-danger';
  const daySign = stock.changePct >= 0 ? '+' : '';
  const leanColor = rec.bigPlayerLean === 'alıcı' ? 'text-success'
    : rec.bigPlayerLean === 'satıcı' ? 'text-danger'
    : 'text-slate-400';
  const leanLabel = rec.bigPlayerLean === 'alıcı' ? 'Alıcı'
    : rec.bigPlayerLean === 'satıcı' ? 'Satıcı'
    : 'Kararsız';
  const isFresh = (selectedTf === '5m' && rec.scalp5mFreshCross)
    || (selectedTf === '15m' && rec.scalp15mFreshCross);

  // TF mini-trend hücresi (1H / 4H / 1G) — TimeframeAnalysis.trend = 'long' | 'short' | 'neutral'
  const tfCell = (t: TimeframeAnalysis | null | undefined, label: string) => {
    if (!t) return <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-mono text-slate-500">{label}</span>;
    const cls = t.trend === 'long' ? 'bg-success/15 text-success'
      : t.trend === 'short' ? 'bg-danger/15 text-danger'
      : 'bg-slate-500/15 text-slate-400';
    return <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold', cls)}>{label}</span>;
  };

  return (
    <tr className={cn(
      'group border-b border-border/60 transition hover:bg-bg-card',
      isLong && 'bg-success/5',
    )}>
      <td className="sticky left-0 z-10 bg-bg-soft px-2 py-2 text-left text-[11px] text-slate-500 tabular-nums">{rank}</td>
      <td className="sticky left-8 z-10 bg-bg-soft px-2 py-2 text-left">
        <Link
          to={`/stock/${stock.symbol}`}
          className="font-mono text-[13px] font-semibold text-accent hover:underline"
        >
          {stock.symbol}
        </Link>
      </td>
      <td className="px-2 py-2 text-left hidden md:table-cell">
        {stock.name && <div className="truncate max-w-[180px] text-slate-200">{stock.name}</div>}
        {stock.sector && (
          <div className="mt-0.5 text-[9px] text-slate-500">{stock.sector}</div>
        )}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-100">{formatMoney(stock.price)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums font-medium', dayTone)}>
        {daySign}{stock.changePct.toFixed(2)}%
      </td>
      <td className="px-2 py-2 text-center hidden lg:table-cell">{tfCell(rec.trend1h, '1H')}</td>
      <td className="px-2 py-2 text-center hidden lg:table-cell">{tfCell(rec.trend4h, '4H')}</td>
      <td className="px-2 py-2 text-center hidden lg:table-cell">{tfCell(rec.trend1d, '1G')}</td>
      <td className={cn('px-2 py-2 text-center text-[10px] font-semibold hidden md:table-cell', leanColor)}>
        {leanLabel}
      </td>
      <td className="px-2 py-2 text-center">
        <div className="inline-flex items-center gap-1">
          {isLong && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
              <Zap size={8} /> GC
            </span>
          )}
          {isFresh && (
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
              TAZE
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
          className={cn('transition', watched ? 'text-warning' : 'text-slate-600 hover:text-warning')}
          title={watched ? 'Takipten çıkar' : 'Takibe al'}
        >
          <Star size={12} fill={watched ? 'currentColor' : 'none'} />
        </button>
      </td>
    </tr>
  );
}
