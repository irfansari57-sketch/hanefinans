import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Radio, TrendingUp } from 'lucide-react';
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
import { DividendCalendarWidget } from '@/components/domain/DividendCalendarWidget';
import { MarketSummaryPremium } from '@/components/domain/MarketSummaryPremium';
import { PanelHero } from '@/components/domain/PanelHero';
import { Newspaper, Sparkles, Activity, BarChart3, Pin, PinOff, Briefcase, CalendarClock } from 'lucide-react';
import { readRiskProfile } from '@/lib/riskProfile';
import { PortfolioPanelSummary } from './PortfolioPanelSummary';
import { PortfolioHealthPanel } from './PortfolioHealthPanel';
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
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
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
  const [fundsPeriod, setFundsPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [stocksPeriod, setStocksPeriod] = useState<'day' | 'week' | 'month'>('day');
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

      // 2. Background: kalan BIST sembollerini 50'lik batch'lerle çek.
      // Kritik: Batch geldikce setStocks etmiyoruz — kullanici list sıralamasının
      // "gidip gelmesini" göruyordu. Tum batch'ler bitince tek setStocks: liste
      // stabil kalıyor, sadece final tam kapsamlı gainers/losers gösteriliyor.
      const remaining = allSymbols.filter((sym) => !priorityStockSyms.includes(sym));
      const BATCH_SIZE = 50;
      const accumulated: Stock[] = [...s.data];
      for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
        const batch = remaining.slice(i, i + BATCH_SIZE);
        const batchResult = await loadStocks(batch);
        accumulated.push(...batchResult.data);
      }
      // Tek atomik update — sıralama flicker'ı biter
      if (accumulated.length > s.data.length) {
        setStocks(accumulated);
      }
    } finally {
      setRefreshing(false);
    }
  }, [allSymbols, symbols]);

  useEffect(() => {
    // İlk yüklemede daima cache'i atla → eski mock değer asla görünmesin
    refresh(true);
  }, [refresh]);
  // Polling: sekme arka planda iken durur, öne gelince tekrar başlar
  useVisibleInterval(() => refresh(true), AUTO_REFRESH_MS);

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
    // BIST günlük fiyat marjı ana pazar için ±%10. %11'i aşan değişimler
    // veri hatası (yanlış previousClose / bölünme / temettü ayarlaması) olma
    // ihtimali çok yüksek — outlier'ları filtrele.
    () => stocks
      .filter((s) => s.price > 0 && Math.abs(s.changePct) <= 11)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 24),
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

      {/* Live ticker geçici olarak kaldırıldı — snapshot cache tutarsızlığından
          dolayı yanlış getiri gösteriyordu. Yerine daha güvenilir Son Dakika bandı öne alındı. */}

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
      {/* Kullanici talebi: "Son ziyaretten · guncelleniyor" metni kaldirildi —
          gorunum degisikligi/kayma yaratiyor. Arka planda sessiz yenileme yeterli.
          LiveBadge de gizlendi — canli veri her zaman aktif, ayri gostergeye gerek yok. */}

      {/* Reklam banner — admin Ayarlar'dan açtıysa + PRO/ELITE değilse */}
      {adBannerEnabled && !proUser && <AdBanner className="mb-5" />}

      {/* Risk Profili CTA — Panel ana ekranda gosterilmiyor.
          Sol menudeki "Risk Profilim" linki zaten cagriyi karsiliyor;
          Panel'in ust yerini bu banner tutmasin. Ihtiyaç halinde geri acilabilir. */}

      {/* PANEL HERO — Varyant B: pill ticker + BIST 100 buyuk grafik + AI komenter (Q ikonu).
          FVT'nin bilgi yogunlugunu yakalar ama Q emerald imzasi ve AI yorum ile ayirt edilir. */}
      {macro.length === 0 ? (
        <div className="mb-5 rounded-xl border border-slate-700/30 bg-bg-card/50 p-4">
          <MarketSkeletonGrid count={8} />
        </div>
      ) : (
        <div className="mb-5">
          <PanelHero macro={macro} />
        </div>
      )}

      {/* Piyasa Ozeti akordiyon kaldirildi — PanelHero ust seridi tum gostergeleri sunuyor.
          Kullanici pill'lere tiklayarak grafik degistirebiliyor (FVT tarzi). Metal/Kripto
          detay listesi Panel dışında Emtia + Kripto nav linkleri altında ayrıca var. */}

      {/* Top movers — hisseler (pin'lenebilir, her ekranda aç/kapa) */}
      {/* GUNUN ENLERI — Tek karti icinde tab yapisi (FVT tarzi).
          Tab'lar: Hisseler / Fonlar. Her tab kendi period toggle'ini gosterir. */}
      <GununEnleriCard
        stocks={stocksForTopMovers}
        stocksPeriod={stocksPeriod}
        setStocksPeriod={setStocksPeriod}
        stocksSource={stocksSource}
        stocksReturnsLoading={stocksReturnsLoading}
        topFunds={topFunds}
        fundsPeriod={fundsPeriod}
        setFundsPeriod={setFundsPeriod}
        macro={macro}
      />

      {/* Portfoyum Ozeti — auth'lu kullanici icin akordeon + yan yana Hisse + Fon karti.
          PortfolioHealthPanel kendi içinde mb-5 uyguluyor (boş portfolyoda null dönüyor,
          boşuna beyaz satır oluşmaması için wrapper margin kaldırıldı). */}
      {user && (
        <>
          <PortfolioHealthPanel />
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
        </>
      )}

      {/* Ekonomik + Temettü Takvimi — kullanici talebi: en alta tasindi
          (hisse/fon/portfoy listelerinden sonra). */}
      <PinnableAccordion
        id="panel-calendars"
        title="Ekonomik & Temettü Takvimi"
        icon={<CalendarClock size={16} />}
        iconColorClass="bg-accent/15 text-accent"
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <EconomicCalendarWidget compact maxItems={6} daysAhead={30} collapsible={false} />
          <DividendCalendarWidget compact maxItems={6} daysAhead={90} />
        </div>
      </PinnableAccordion>
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

/**
 * GununEnleriCard — FVT tarzi tab yapisi.
 * Tek karti icinde: Hisseler / Fonlar sekmeler. Her sekme kendi period toggle'ini gosterir.
 * Kripto sekmesi placeholder (ileride cripto kazananlar/kaybedenler eklenebilir).
 */
type EnleriTab = 'stocks' | 'funds' | 'crypto';
function GununEnleriCard(props: {
  stocks: Stock[];
  stocksPeriod: 'day' | 'week' | 'month';
  setStocksPeriod: (p: 'day' | 'week' | 'month') => void;
  stocksSource: 'live' | 'mock' | 'mixed';
  stocksReturnsLoading: boolean;
  topFunds: FundPerformance[];
  fundsPeriod: 'day' | 'week' | 'month';
  setFundsPeriod: (p: 'day' | 'week' | 'month') => void;
  macro: MacroIndicator[];
}) {
  const [tab, setTab] = useState<EnleriTab>('stocks');
  const {
    stocks, stocksPeriod, setStocksPeriod, stocksSource, stocksReturnsLoading,
    topFunds, fundsPeriod, setFundsPeriod, macro,
  } = props;

  // Kripto listesi macro'dan turetilir — BTC/ETH/XRP/SOL/BNB + varsa digerleri
  const cryptoItems = useMemo(() => {
    return macro
      .filter((m) => m.key.endsWith('/USD') && !['USD/TRY', 'EUR/TRY'].includes(m.key))
      .filter((m) => m.changePct != null && Number.isFinite(m.changePct));
  }, [macro]);

  const activePeriod = tab === 'stocks' ? stocksPeriod : tab === 'funds' ? fundsPeriod : 'day';
  const setActivePeriod = tab === 'stocks' ? setStocksPeriod : tab === 'funds' ? setFundsPeriod : () => {};

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-border bg-bg-soft/30">
      {/* Baslik + tab sekmeleri + period toggle */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-bg-card/40 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <TrendingUp size={15} className="text-success" /> Günün Enleri
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab('stocks')}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-semibold transition',
              tab === 'stocks'
                ? 'bg-bg-card text-accent'
                : 'text-slate-400 hover:bg-bg-soft/50 hover:text-slate-200',
            )}
          >
            Hisseler
          </button>
          <button
            type="button"
            onClick={() => setTab('funds')}
            disabled={topFunds.length === 0}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
              tab === 'funds'
                ? 'bg-bg-card text-accent'
                : 'text-slate-400 hover:bg-bg-soft/50 hover:text-slate-200',
            )}
          >
            Fonlar
          </button>
          <button
            type="button"
            onClick={() => setTab('crypto')}
            disabled={cryptoItems.length === 0}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
              tab === 'crypto'
                ? 'bg-bg-card text-accent'
                : 'text-slate-400 hover:bg-bg-soft/50 hover:text-slate-200',
            )}
          >
            Kripto
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-bg-soft p-0.5">
            {(['day', 'week', 'month'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setActivePeriod(p)}
                className={cn(
                  'rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wider transition',
                  activePeriod === p ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {p === 'day' ? 'Gün' : p === 'week' ? 'Hafta' : 'Ay'}
              </button>
            ))}
          </div>
          {tab === 'stocks' && (
            <>
              {stocksReturnsLoading && stocksPeriod !== 'day' && (
                <span className="text-[10px] text-slate-500">yükleniyor…</span>
              )}
              <SourceBadge source={stocksSource} />
            </>
          )}
          {tab === 'funds' && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">canlı</span>
          )}
          {tab === 'crypto' && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">canlı</span>
          )}
        </div>
      </div>

      {/* Icerik */}
      <div className="bg-bg-card/40 p-3">
        {tab === 'stocks' && <TopMovers stocks={stocks} limit={10} period={stocksPeriod} />}
        {tab === 'funds' && (
          topFunds.length > 0
            ? <TopFundMovers funds={topFunds} limit={10} period={fundsPeriod} />
            : <div className="grid place-items-center py-6 text-xs text-slate-500">Fon verisi yükleniyor…</div>
        )}
        {tab === 'crypto' && <CryptoMovers items={cryptoItems} />}
      </div>
    </div>
  );
}

/**
 * CryptoMovers — kripto kazananlari/kaybedenler (macro'dan).
 * TopMovers ile ayni gorsel yapida ama kripto sembolleri icin.
 */
function CryptoMovers({ items }: { items: MacroIndicator[] }) {
  const sorted = [...items].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const winners = sorted.slice(0, 10);
  const losers = sorted.slice(-10).reverse();

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <CryptoList title="En Çok Yükselenler" tone="success" items={winners} />
      <CryptoList title="En Çok Düşenler" tone="danger" items={losers} />
    </div>
  );
}

function CryptoList({ title, tone, items }: {
  title: string;
  tone: 'success' | 'danger';
  items: MacroIndicator[];
}) {
  const toneColor = tone === 'success' ? 'text-success' : 'text-danger';
  const toneBg = tone === 'success' ? 'bg-success/10' : 'bg-danger/10';
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
          <span className={cn('grid h-6 w-6 place-items-center rounded-md', toneBg, toneColor)}>
            {tone === 'success' ? <TrendingUp size={12} /> : <TrendingUp size={12} className="rotate-180" />}
          </span>
          {title}
        </h3>
      </div>
      <div className="divide-y divide-border">
        {items.map((c, i) => {
          const cp = c.changePct ?? 0;
          const sign = cp >= 0 ? '+' : '';
          return (
            <Link
              key={c.key}
              to="/kripto"
              className="flex items-center justify-between px-4 py-2.5 hover:bg-bg-soft"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-4 text-[11px] text-slate-500">{i + 1}</span>
                <div className="min-w-0">
                  <div className="font-mono text-xs text-accent">{c.key.replace('/USD', '')}</div>
                  <div className="text-[10px] text-slate-500">{c.label}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium tabular-nums text-slate-100">
                  {c.value < 10 ? c.value.toFixed(3) : c.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                <div className={cn('text-xs tabular-nums', cp >= 0 ? 'text-success' : 'text-danger')}>
                  {sign}{cp.toFixed(2)}%
                </div>
              </div>
            </Link>
          );
        })}
        {items.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-slate-500">Kripto verisi yok.</div>
        )}
      </div>
    </div>
  );
}
