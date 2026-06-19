import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { AdBanner } from '@/components/domain/AdBanner';
import { useAuth, isPro, isAdmin } from '@/store/auth';
import { useSiteSettings } from '@/store/siteSettings';
import { MacroCard } from '@/components/domain/MacroCard';
import { StockRow } from '@/components/domain/StockRow';
import { TopMovers } from '@/components/domain/TopMovers';
import { TopFundMovers } from '@/components/domain/TopFundMovers';
import { Ticker } from '@/components/domain/Ticker';
import { BreakingNewsTicker } from '@/components/domain/BreakingNewsTicker';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { SentimentAgentCard } from '@/components/domain/SentimentAgentCard';
import { NewsAgentCard } from '@/components/domain/NewsAgentCard';
import { MacroAgentCard } from '@/components/domain/MacroAgentCard';
import { IndicatorAgentCard } from '@/components/domain/IndicatorAgentCard';
import { PinnableAccordion } from '@/components/domain/PinnableAccordion';
import { EconomicCalendarWidget } from '@/components/domain/EconomicCalendarWidget';
import { MarketSummaryPremium } from '@/components/domain/MarketSummaryPremium';
import { Newspaper, Sparkles, Activity, BarChart3, Pin, PinOff, Shield, ChevronRight, Briefcase } from 'lucide-react';
import { readRiskProfile } from '@/lib/riskProfile';
import { PortfolioPanelSummary } from './PortfolioPanelSummary';
import { usePinnedSection } from '@/lib/usePinnedSection';
import {
  MOCK_EVENTS, MOCK_SENTIMENT, MOCK_STOCKS, MOCK_MACRO_FALLBACK, MOCK_NEWS,
} from '@/data/mock';
import { BIST_UNIQUE } from '@/data/bistAll';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import { fetchHistoricalYahoo, computePeriodReturns } from '@/data/api/yahoo';
import { loadStocks, loadNews, loadMacroAll, loadSentiment, clearServiceCaches } from '@/data/services';
import type { MacroIndicator, NewsItem, Stock, SentimentMention, FundPerformance } from '@/data/types';
import { usePersistedState } from '@/lib/usePersistedState';
import { useWatchlist } from '@/store/watchlist';
import { cn } from '@/lib/utils';
import { daysUntil, formatDateShort } from '@/lib/date';
import { SeoHead } from '@/components/seo/SeoHead';

const sentimentTone = {
  positive: 'text-success',
  neutral: 'text-slate-400',
  negative: 'text-danger',
} as const;

const sentimentLabel = {
  positive: 'Pozitif',
  neutral: 'Nötr',
  negative: 'Negatif',
} as const;

const AUTO_REFRESH_MS = 30_000;

// Sparkline cache — macro key -> kapanis dizisi (in-memory, sayfa geciSinde persist)
interface SparklineMemo { fetchedAt: number; data: Record<string, number[]>; }
const SPARKLINE_TTL_MS = 30 * 60_000; // 30 dakika
let sparklineMemo: SparklineMemo = { fetchedAt: 0, data: {} };

// Macro key -> Yahoo sembolu (sparkline icin)
const MACRO_TO_YAHOO: Record<string, string> = {
  'BIST 100': 'XU100.IS',
  'BIST 30': 'XU030.IS',
  'USD/TRY': 'USDTRY=X',
  'EUR/TRY': 'EURTRY=X',
  'Gram Altın': 'GC=F',
  'Gram Gümüş': 'SI=F',
  'Ons Altın': 'GC=F',
  'Ons Gümüş': 'SI=F',
  'BTC/USD': 'BTC-USD',
  'ETH/USD': 'ETH-USD',
  'XRP/USD': 'XRP-USD',
  'DOGE/USD': 'DOGE-USD',
};


/**
 * Mock/bos veri yerine skeleton — kart yapisinda animated placeholder.
 * Initial render'da cache yoksa burada gozukur, fresh data gelince icerigi
 * gercek MacroCard'lar dolar. Asla mock degeri (15.133, 6.890 vb.) gosterilmez.
 */
function MarketSkeletonCard() {
  return (
    <div className="glass-card p-1.5 sm:p-2 animate-pulse">
      <div className="h-2 w-10 rounded bg-slate-700/60 mb-1.5 sm:h-2.5 sm:w-14" />
      <div className="h-4 w-16 rounded bg-slate-700/50 mb-1 sm:h-6 sm:w-24" />
      <div className="h-2.5 w-8 rounded bg-slate-700/40 sm:h-3.5 sm:w-12" />
    </div>
  );
}

function MarketSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <MarketSkeletonCard key={i} />
      ))}
    </>
  );
}

export function PanelPage() {
  const symbols = useWatchlist((s) => s.symbols);
  // Tüm BIST evreni — top gainers/losers tam kapsamlı hesaplanacak (MOCK 50 değil 270+)
  const allSymbols = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const s of MOCK_STOCKS) {
      if (!seen.has(s.symbol)) { seen.add(s.symbol); list.push(s.symbol); }
    }
    for (const s of BIST_UNIQUE) {
      if (!seen.has(s.symbol)) { seen.add(s.symbol); list.push(s.symbol); }
    }
    return list;
  }, []);
  const user = useAuth((s) => s.user);
  const proUser = isPro(user);
  const adBannerEnabled = useSiteSettings((s) => s.adBannerEnabled);
  // Risk profili kayitli mi? Yoksa CTA goster.
  const [hasRiskProfile, setHasRiskProfile] = useState(() => readRiskProfile() != null);
  useEffect(() => {
    setHasRiskProfile(readRiskProfile() != null);
  }, [user]);

  // SWR cache — 24 saatlik TTL ile son bilinen veri her zaman gosterilir.
  // Cache yoksa skeleton, varsa anlik render + arka planda yenileme.
  // En kotu senaryo: dunku veri + "X saat once" badge — kullanici asla bos kart gormez.
  const SWR_TTL_MS = 24 * 60 * 60 * 1000;
  const [macro, setMacro, macroCached] = usePersistedState<MacroIndicator[]>('hf.cache.macro', SWR_TTL_MS, []);
  const [stocks, setStocks, stocksCached] = usePersistedState<Stock[]>('hf.cache.stocks', SWR_TTL_MS, []);
  const [news, setNews, newsCached] = usePersistedState<NewsItem[]>('hf.cache.news', SWR_TTL_MS, []);
  const [sentiment, setSentiment, sentimentCached] = usePersistedState<SentimentMention[]>('hf.cache.sentiment', SWR_TTL_MS, []);
  const [topFunds, setTopFunds, topFundsCached] = usePersistedState<FundPerformance[]>('hf.cache.topFunds', SWR_TTL_MS, []);
  const [stocksSource, setStocksSource] = useState<'live' | 'mock' | 'mixed'>('mock');
  const [sentimentSource, setSentimentSource] = useState<'live' | 'mock' | 'derived'>('mock');
  // SWR: sayfa cache'ten render ediliyor mu (en az bir kart cache'ten)
  // Bu boolean LiveBadge'e iletilecek — "guncelleniyor" yerine "cache'ten + guncelleniyor" gosterir
  const isAnyCached = macroCached || stocksCached || newsCached || sentimentCached || topFundsCached;
  const [fundsPeriod, setFundsPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [stocksPeriod, setStocksPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [stocksReturns, setStocksReturns] = useState<Record<string, { '1h'?: number; '1a'?: number }>>({});
  const [stocksReturnsLoading, setStocksReturnsLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  // Mini sparkline serileri — macro key -> son ~30 gunluk kapanis dizisi
  const [sparklineMap, setSparklineMap] = useState<Record<string, number[]>>(() => sparklineMemo.data);

  // Pin'lenebilir bölümler — kullanıcı isterse açık/kapalı durumunu kaydeder.
  // Default kapalı (hem mobile hem desktop) — kullanıcı isterse açar, pin'le sabitler.
  const stocksPin = usePinnedSection('panel-top-movers-stocks', false, false);
  const fundsPin = usePinnedSection('panel-top-movers-funds', false, false);

  const refresh = useCallback(async (force = false) => {
    if (force) clearServiceCaches();
    setRefreshing(true);
    try {
      // 1. Hızlı first paint: macro, news, sentiment, funds + watchlist hisseler
      // (watchlist watchlist'teki sembollerden + diğer top movers'ı sonra ekle)
      const priorityStockSyms = Array.from(new Set([...symbols, ...MOCK_STOCKS.slice(0, 30).map((s) => s.symbol)]));
      const [s, m, n, se, fr] = await Promise.all([
        loadStocks(priorityStockSyms),
        loadMacroAll(),
        loadNews({ max: 8 }),
        loadSentiment(),
        loadFundsAsPerformance(),
      ]);
      setStocks(s.data);
      setStocksSource(s.source);
      setMacro(m.data);
      setNews(n.data);
      setSentiment(se.data);
      setSentimentSource(se.source);
      setTopFunds(fr ? fr.funds : []);
      setUpdatedAt(Date.now());

      // 2. Background: kalan BIST sembollerini 50'lik batch'lerle çek
      // top gainers/losers tam kapsam için
      const remaining = allSymbols.filter((sym) => !priorityStockSyms.includes(sym));
      const BATCH_SIZE = 50;
      const accumulated: Stock[] = [...s.data];
      for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
        const batch = remaining.slice(i, i + BATCH_SIZE);
        const batchResult = await loadStocks(batch);
        accumulated.push(...batchResult.data);
        setStocks([...accumulated]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [allSymbols, symbols]);

  useEffect(() => {
    // İlk yüklemede daima cache'i atla → eski mock değer asla görünmesin
    refresh(true);
    const id = setInterval(() => refresh(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Sparkline veri fetch — TTL icinde memo'dan, degilse Yahoo'dan
  useEffect(() => {
    const now = Date.now();
    if (now - sparklineMemo.fetchedAt < SPARKLINE_TTL_MS && Object.keys(sparklineMemo.data).length > 0) {
      setSparklineMap(sparklineMemo.data);
      return;
    }
    let cancelled = false;
    (async () => {
      const result: Record<string, number[]> = {};
      const keys = Object.keys(MACRO_TO_YAHOO);
      // 4'lu batchler halinde, 200ms aralikla — proxy rate-limit'i acmadan
      const BATCH = 4;
      for (let i = 0; i < keys.length; i += BATCH) {
        const batch = keys.slice(i, i + BATCH);
        await Promise.all(batch.map(async (key) => {
          try {
            const sym = MACRO_TO_YAHOO[key];
            const hist = await fetchHistoricalYahoo(sym, '1mo', '1d', { bistSuffix: false });
            if (hist && hist.bars.length > 0) {
              result[key] = hist.bars.map((b) => b.close).slice(-30);
            }
          } catch { /* sembol hata verirse atla */ }
        }));
        if (cancelled) return;
        if (i + BATCH < keys.length) await new Promise((r) => setTimeout(r, 200));
      }
      if (cancelled) return;
      sparklineMemo = { fetchedAt: Date.now(), data: result };
      setSparklineMap(result);
    })();
    return () => { cancelled = true; };
  }, []);

  const watchlistStocks = useMemo(
    () => symbols.map((sym) => stocks.find((s) => s.symbol === sym)).filter((s): s is Stock => !!s),
    [symbols, stocks],
  );

  const upcomingEvents = useMemo(() => [...MOCK_EVENTS].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3), []);
  const topMentions = sentiment.slice(0, 3);
  const topMacro = useMemo(
    () => macro.filter((m) => ['USD/TRY', 'BIST 100', 'Politika Faizi', 'Brent', 'Gram Altın', 'VIX'].includes(m.key)),
    [macro],
  );

  // Ticker için: değişimi olan ve fiyatı 0'dan büyük olanlar
  const tickerStocks = useMemo(
    () => stocks.filter((s) => s.price > 0).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 24),
    [stocks],
  );

  // Hisse top movers — week/month periodu için Yahoo historical batch fetch (lazy)
  useEffect(() => {
    if (stocksPeriod === 'day') return;
    if (Object.keys(stocksReturns).length > 0) return; // bir kere yeterli
    const symbols = stocks.filter((s) => s.price > 0).map((s) => s.symbol);
    if (symbols.length === 0) return;
    setStocksReturnsLoading(true);
    const BATCH = 8;
    (async () => {
      const map: Record<string, { '1h'?: number; '1a'?: number }> = {};
      for (let i = 0; i < symbols.length; i += BATCH) {
        const slice = symbols.slice(i, i + BATCH);
        const results = await Promise.all(slice.map(async (sym) => {
          try {
            const hist = await fetchHistoricalYahoo(sym, '6mo', '1d', { bistSuffix: true });
            if (hist) {
              const r = computePeriodReturns(hist.closes);
              return [sym, { '1h': r['1h'], '1a': r['1a'] }] as const;
            }
          } catch { /* ignore */ }
          return null;
        }));
        results.forEach((r) => { if (r) map[r[0]] = r[1]; });
        setStocksReturns((prev) => ({ ...prev, ...map }));
      }
      setStocksReturnsLoading(false);
    })();
  }, [stocksPeriod, stocks, stocksReturns]);

  // Period'a göre enriched stocks — TopMovers changePct ile sıralıyor, biz onu period değerine override
  const stocksForTopMovers = useMemo(() => {
    if (stocksPeriod === 'day') return stocks;
    return stocks.map((s) => {
      const ret = stocksReturns[s.symbol];
      const val = stocksPeriod === 'week' ? ret?.['1h'] : ret?.['1a'];
      return { ...s, changePct: val != null && Number.isFinite(val) ? val : NaN };
    });
  }, [stocks, stocksReturns, stocksPeriod]);

  return (
    <>
      <SeoHead title="Panel" description="BIST endeksleri, takip listeniz, fonlar, kripto ve makro göstergelerin canlı özet panosu." path="/panel" />

      {/* Live ticker — sayfanın en üstünde */}
      <div className="mb-3">
        <Ticker stocks={tickerStocks} speed={65} />
      </div>

      {/* Son Dakika haber bandı — önem >= 5 ve son 48 saatteki haberler.
          Filtreyi gevşek tutuyoruz ki band her zaman görünür olsun;
          gerçek "son dakika" geldiğinde önem rozeti (●8, ●9) ile öne çıkar. */}
      <div className="mb-4">
        <BreakingNewsTicker
          minImportance={5}
          maxAgeHours={48}
          fallback={news}
          speed={35}
        />
      </div>

      {/* Panel basligi kullanici talebiyle kaldirildi.
          LiveBadge'i ufak bir cubukta sag ust köşede tutuyoruz.
          SWR cache: ilk render localStorage'dan instant — eger eski veri varsa
          arka planda yenileme yapilirken kullaniciya bilgi verir (gozumsenmez bir flash). */}
      <div className="mb-3 flex justify-end items-center gap-2">
        {isAnyCached && refreshing && (
          <span className="text-[10px] text-slate-500 italic">
            Son ziyaretten · guncelleniyor…
          </span>
        )}
        <LiveBadge updatedAt={updatedAt} refreshing={refreshing} label="CANLI" />
      </div>

      {/* Reklam banner — admin Ayarlar'dan açtıysa + PRO/ELITE değilse */}
      {adBannerEnabled && !proUser && <AdBanner className="mb-5" />}

      {/* Risk Profili CTA — sadece auth'lu kullanici icin, profili kayitli degilse */}
      {user && !hasRiskProfile && (
        <Link
          to="/risk-profili"
          className="mb-5 flex items-center gap-3 rounded-xl border border-accent/40 bg-gradient-to-r from-accent/10 via-accent/5 to-transparent p-4 transition hover:border-accent/60 hover:bg-accent/10"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/20 text-accent">
            <Shield size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-100">Risk profilinizi 2 dakikada belirleyin</div>
            <div className="text-[11px] text-slate-400 leading-tight">
              7 soruluk anket — yaş, vade, risk toleransı, hedef + SPK nitelikli yatırımcı kontrolü.
              Sonunda kişiselleştirilmiş TEFAS fon paketi.
            </div>
          </div>
          <ChevronRight size={18} className="shrink-0 text-accent" />
        </Link>
      )}

      {/* Piyasa Özeti — premium 3 sütun (Endeks+Döviz / Metal / Kripto), satır clickable */}
      <PinnableAccordion
        id="panel-market-summary"
        title="Piyasa Özeti"
        icon={<BarChart3 size={16} />}
        iconColorClass="bg-accent/15 text-accent"
        defaultOpen
      >
        {macro.length === 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            <div className="rounded-xl border border-slate-700/30 bg-bg-card/50 p-3"><MarketSkeletonGrid count={4} /></div>
            <div className="rounded-xl border border-slate-700/30 bg-bg-card/50 p-3"><MarketSkeletonGrid count={4} /></div>
            <div className="rounded-xl border border-slate-700/30 bg-bg-card/50 p-3"><MarketSkeletonGrid count={4} /></div>
          </div>
        ) : (
          <MarketSummaryPremium macro={macro} />
        )}
      </PinnableAccordion>

      {/* Top movers — hisseler (pin'lenebilir, her ekranda aç/kapa) */}
      <details
        className={cn(
          'group mb-5 overflow-hidden rounded-xl border bg-bg-soft/30 transition',
          stocksPin.pinned ? 'border-warning/30' : 'border-border',
        )}
        open={stocksPin.open}
        onToggle={stocksPin.onToggle}
      >
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 select-none [&::-webkit-details-marker]:hidden hover:bg-bg-card/30">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            {stocksPeriod === 'day' ? 'Günlük' : stocksPeriod === 'week' ? 'Haftalık' : 'Aylık'} Hareketler — Hisseler
            {stocksPin.pinned && (
              <span className="rounded-full bg-warning/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">
                Pinli
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {/* Period toggle */}
            <div className="inline-flex rounded-md border border-border bg-bg-soft p-0.5" onClick={(e) => e.preventDefault()}>
              {(['day', 'week', 'month'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={(e) => { e.preventDefault(); setStocksPeriod(p); }}
                  className={cn(
                    'rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wider transition',
                    stocksPeriod === p ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
                  )}
                >
                  {p === 'day' ? 'Gün' : p === 'week' ? 'Hafta' : 'Ay'}
                </button>
              ))}
            </div>
            {stocksReturnsLoading && stocksPeriod !== 'day' && (
              <span className="text-[10px] text-slate-500">yükleniyor…</span>
            )}
            <SourceBadge source={stocksSource} />
            <button
              type="button"
              onClick={stocksPin.togglePin}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition',
                stocksPin.pinned
                  ? 'border-warning/40 bg-warning/10 text-warning'
                  : 'border-border bg-bg-card text-slate-400 hover:border-warning/30 hover:text-warning',
              )}
              title={stocksPin.pinned ? 'Pin\'i kaldır' : 'Pinle (sonraki açılışta açık gelir)'}
              aria-label={stocksPin.pinned ? 'Pin\'i kaldır' : 'Pinle'}
            >
              {stocksPin.pinned ? <Pin size={11} fill="currentColor" /> : <PinOff size={11} />}
              <span className="hidden sm:inline">{stocksPin.pinned ? 'Pinli' : 'Pin'}</span>
            </button>
            <span className="text-xs text-slate-500 transition-transform group-open:rotate-180">▼</span>
          </div>
        </summary>
        <div className="border-t border-border bg-bg-card/40 p-3">
          <TopMovers stocks={stocksForTopMovers} limit={5} period={stocksPeriod} />
        </div>
      </details>

      {/* Top movers — fonlar — pin'lenebilir, sadece canlı feed bağlıyken göster */}
      {topFunds.length > 0 && (
        <details
          className={cn(
            'group mb-5 overflow-hidden rounded-xl border bg-bg-soft/30 transition',
            fundsPin.pinned ? 'border-warning/30' : 'border-border',
          )}
          open={fundsPin.open}
          onToggle={fundsPin.onToggle}
        >
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 select-none [&::-webkit-details-marker]:hidden hover:bg-bg-card/30">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              {fundsPeriod === 'day' ? 'Günlük' : fundsPeriod === 'week' ? 'Haftalık' : 'Aylık'} En İyi & En Kötü Fonlar
              {fundsPin.pinned && (
                <span className="rounded-full bg-warning/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">
                  Pinli
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {/* Period toggle */}
              <div className="inline-flex rounded-md border border-border bg-bg-soft p-0.5" onClick={(e) => e.preventDefault()}>
                {(['day', 'week', 'month'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={(e) => { e.preventDefault(); setFundsPeriod(p); }}
                    className={cn(
                      'rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wider transition',
                      fundsPeriod === p ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
                    )}
                  >
                    {p === 'day' ? 'Gün' : p === 'week' ? 'Hafta' : 'Ay'}
                  </button>
                ))}
              </div>
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">canlı</span>
              <button
                type="button"
                onClick={fundsPin.togglePin}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition',
                  fundsPin.pinned
                    ? 'border-warning/40 bg-warning/10 text-warning'
                    : 'border-border bg-bg-card text-slate-400 hover:border-warning/30 hover:text-warning',
                )}
                title={fundsPin.pinned ? 'Pin\'i kaldır' : 'Pinle (sonraki açılışta açık gelir)'}
                aria-label={fundsPin.pinned ? 'Pin\'i kaldır' : 'Pinle'}
              >
                {fundsPin.pinned ? <Pin size={11} fill="currentColor" /> : <PinOff size={11} />}
                <span className="hidden sm:inline">{fundsPin.pinned ? 'Pinli' : 'Pin'}</span>
              </button>
              <span className="text-xs text-slate-500 transition-transform group-open:rotate-180">▼</span>
            </div>
          </summary>
          <div className="border-t border-border bg-bg-card/40 p-3">
            <TopFundMovers funds={topFunds} limit={5} period={fundsPeriod} />
          </div>
        </details>
      )}

      {/* Portfoyum Ozeti — auth'lu kullanici icin akordeon + yan yana Hisse + Fon karti */}
      {user && (
        <PinnableAccordion
          id="panel-portfolio"
          title="Portföyüm"
          description="Hisse + Fon ozet, gunluk degisim ve toplam kar/zarar"
          icon={<Briefcase size={16} />}
          iconColorClass="bg-accent/15 text-accent"
          defaultOpen
        >
          <PortfolioPanelSummary isLoggedIn={!!user} />
        </PinnableAccordion>
      )}

      {/* Ekonomik Takvim — sadece mobilde göster (desktop sağ rail'de var) */}
      <div className="mb-5 lg:hidden">
        <EconomicCalendarWidget compact maxItems={5} daysAhead={14} collapsible />
      </div>
    </>
  );
}

function SourceBadge({ source }: { source: 'live' | 'mock' | 'mixed' | 'derived' }) {
  if (source === 'live') {
    return (
      <></>
    );
  }
  if (source === 'mixed') {
    return (
      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
        karma
      </span>
    );
  }
  if (source === 'derived') {
    return (
      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
        haberden
      </span>
    );
  }
  return (
    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">
      demo
    </span>
  );
}
