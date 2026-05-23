import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PiggyBank, RefreshCw, Zap, Briefcase, PieChart, Bell, BellOff } from 'lucide-react';
import { BrokerRecommendations } from '@/components/domain/BrokerRecommendations';
import { BrokerPortfolios } from '@/components/domain/BrokerPortfolios';
import { RecPoolStats } from '@/components/domain/RecPoolStats';
import { BROKER_RECOMMENDATIONS } from '@/data/brokerRecommendations';
import { BROKER_PORTFOLIOS } from '@/data/brokerPortfolios';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { loadStocks, clearServiceCaches } from '@/data/services';
import { fetchHistoricalYahoo, fetchIndexYahoo } from '@/data/api/yahoo';
import { ema, type OHLC } from '@/lib/indicators';
import {
  analyzeTimeframe, aggregateTo4h, computeBigPlayerLean, buildVerdict,
  type TimeframeAnalysis, type MultiTimeframeResult,
} from '@/lib/multiTimeframe';
import { sendTelegram, getTelegramChatId } from '@/lib/telegram';
import { MOCK_STOCKS } from '@/data/mock';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import type { Stock, FundPerformance } from '@/data/types';
import { useWatchlist } from '@/store/watchlist';
import { cn } from '@/lib/utils';

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

const BROKER_COUNT = BROKER_RECOMMENDATIONS.length;
const PORTFOLIO_COUNT = BROKER_PORTFOLIOS.length;

const AUTO_REFRESH_MS = 120_000;

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
        const message = `🚨 <b>Yeni TAZE Golden Cross</b> (${tfLabel(tf)})\n\n` +
          lines.join('\n') +
          `\n\n🌐 hanefinans.net/recommendations`;
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
