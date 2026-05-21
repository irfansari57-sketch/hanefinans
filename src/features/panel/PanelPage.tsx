import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, AlertTriangle, CalendarClock, MessageSquare, Radio, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { AdBanner } from '@/components/domain/AdBanner';
import { useAuth, isPro, isAdmin } from '@/store/auth';
import { NewsCard } from '@/components/domain/NewsCard';
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
import { Newspaper, Sparkles, Activity, BarChart3 } from 'lucide-react';
import {
  MOCK_EVENTS, MOCK_SENTIMENT, MOCK_STOCKS, MOCK_MACRO_FALLBACK, MOCK_NEWS,
} from '@/data/mock';
import { BIST_UNIQUE } from '@/data/bistAll';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import { fetchHistoricalYahoo, computePeriodReturns } from '@/data/api/yahoo';
import { loadStocks, loadNews, loadMacroAll, loadSentiment, clearServiceCaches } from '@/data/services';
import type { MacroIndicator, NewsItem, Stock, SentimentMention, FundPerformance } from '@/data/types';
import { useWatchlist } from '@/store/watchlist';
import { cn } from '@/lib/utils';
import { daysUntil, formatDateShort } from '@/lib/date';
import { macroKeyToRoute } from '@/lib/macroRoutes';

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

const AUTO_REFRESH_MS = 60_000;

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

  const [macro, setMacro] = useState<MacroIndicator[]>(MOCK_MACRO_FALLBACK);
  const [stocks, setStocks] = useState<Stock[]>(MOCK_STOCKS);
  const [news, setNews] = useState<NewsItem[]>(MOCK_NEWS);
  const [newsSource, setNewsSource] = useState<'live' | 'mock' | 'mixed'>('mock');
  const [stocksSource, setStocksSource] = useState<'live' | 'mock' | 'mixed'>('mock');
  const [sentiment, setSentiment] = useState<SentimentMention[]>(MOCK_SENTIMENT);
  const [sentimentSource, setSentimentSource] = useState<'live' | 'mock' | 'derived'>('mock');
  const [topFunds, setTopFunds] = useState<FundPerformance[]>([]);
  const [fundsPeriod, setFundsPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [stocksPeriod, setStocksPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [stocksReturns, setStocksReturns] = useState<Record<string, { '1h'?: number; '1a'?: number }>>({});
  const [stocksReturnsLoading, setStocksReturnsLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [refreshing, setRefreshing] = useState(false);

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
      setNewsSource(n.source);
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

  const watchlistStocks = useMemo(
    () => symbols.map((sym) => stocks.find((s) => s.symbol === sym)).filter((s): s is Stock => !!s),
    [symbols, stocks],
  );

  const topNews = news.slice(0, 4);
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
      {/* Live ticker — sayfanın en üstünde */}
      <div className="mb-3">
        <Ticker stocks={tickerStocks} speed={50} />
      </div>

      {/* Son Dakika haber bandı — önem >= 5 ve son 48 saatteki haberler.
          Filtreyi gevşek tutuyoruz ki band her zaman görünür olsun;
          gerçek "son dakika" geldiğinde önem rozeti (●8, ●9) ile öne çıkar. */}
      <div className="mb-4">
        <BreakingNewsTicker
          minImportance={5}
          maxAgeHours={48}
          fallback={news}
          speed={60}
        />
      </div>

      <PageHeader
        title="Panel"
        subtitle="BIST gelişmeleri, makro durum ve takip listenizdeki hisseler için canlı feed."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={refreshing} label="CANLI" />
            <button
              className="btn-secondary"
              onClick={() => refresh(true)}
              disabled={refreshing}
              title="Şimdi yenile"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Yenile
            </button>
            <Link to="/news" className="btn-secondary">
              Tüm gelişmeleri gör <ArrowUpRight size={16} />
            </Link>
          </div>
        }
      />

      {/* Reklam banner — PRO/ELITE'de gizli */}
      {!proUser && <AdBanner className="mb-5" />}

      {/* BIST endeksleri — birinci öncelik */}
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-accent">
            BIST Endeksleri
          </h2>
          <span className="text-[10px] text-slate-500">öncelikli</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {macro
            .filter((m) => m.key === 'BIST 100' || m.key === 'BIST 30')
            .map((m) => {
              const route = macroKeyToRoute(m.key);
              const card = (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">{m.label}</span>
                    {m.source === 'live' && (
                      <></>
                    )}
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-slate-100">
                    {m.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                  </div>
                  {m.changePct != null && (
                    <div className={cn('text-sm tabular-nums', m.changePct >= 0 ? 'text-success' : 'text-danger')}>
                      {m.changePct >= 0 ? '+' : ''}{m.changePct.toFixed(2)}%
                    </div>
                  )}
                </>
              );
              return route ? (
                <Link key={m.key} to={route} className="glass-card block p-4 transition hover:border-accent/40">
                  {card}
                </Link>
              ) : (
                <div key={m.key} className="glass-card p-4">{card}</div>
              );
            })}
          {/* USD/TRY ve EUR/TRY de BIST'le birlikte göster */}
          {macro
            .filter((m) => m.key === 'USD/TRY' || m.key === 'EUR/TRY')
            .map((m) => {
              const route = macroKeyToRoute(m.key);
              const card = (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">{m.label}</span>
                    {m.source === 'live' && (
                      <></>
                    )}
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-slate-100">
                    {m.value.toFixed(2)}
                  </div>
                  {m.changePct != null && (
                    <div className={cn('text-sm tabular-nums', m.changePct >= 0 ? 'text-success' : 'text-danger')}>
                      {m.changePct >= 0 ? '+' : ''}{m.changePct.toFixed(2)}%
                    </div>
                  )}
                </>
              );
              return route ? (
                <Link key={m.key} to={route} className="glass-card block p-4 transition hover:border-accent/40">
                  {card}
                </Link>
              ) : (
                <div key={m.key} className="glass-card p-4">{card}</div>
              );
            })}
        </div>
      </section>

      {/* Emtia ikinci plan */}
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Altın · Gümüş · Platin (Gram TL / Ons USD)
          </h2>
          <span className="text-[10px] text-slate-500">ikincil</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {macro
            .filter((m) => ['Gram Altın', 'Gram Gümüş', 'Gram Platin', 'Ons Altın', 'Ons Gümüş', 'Ons Platin'].includes(m.key))
            .map((m) => (
              <MacroCard key={m.key} item={m} compact />
            ))}
        </div>
      </section>

      {/* Top movers — hisseler (mobilde collapse) */}
      <details className="group mb-5 lg:open:block lg:!block" open>
        <summary className="mb-2 flex cursor-pointer items-center justify-between px-1 lg:cursor-default lg:list-none">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            {stocksPeriod === 'day' ? 'Günlük' : stocksPeriod === 'week' ? 'Haftalık' : 'Aylık'} Hareketler — Hisseler ({stocks.length})
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
            <span className="text-xs text-slate-500 group-open:rotate-180 transition-transform lg:hidden">▼</span>
          </div>
        </summary>
        <TopMovers stocks={stocksForTopMovers} limit={5} period={stocksPeriod} />
      </details>

      {/* AI Agent'lar — PRO/Elite üyelere özel, akordeon + pin */}
      {proUser ? (
        <section className="mb-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-warning flex items-center gap-1.5">
              <Sparkles size={14} /> AI Agent'lar
            </h2>
            <span className="text-[11px] text-slate-500">— başlığa tıkla aç/kapa, pinlersen her açılışta açık gelir</span>
          </div>
          <PinnableAccordion
            id="agent-sentiment"
            title="Sentiment Agent"
            description="Hisse bazlı haber duyarlılığı (Claude Haiku)"
            icon={<Activity size={16} />}
            iconColorClass="bg-success/15 text-success"
          >
            <SentimentAgentCard />
          </PinnableAccordion>
          <PinnableAccordion
            id="agent-news"
            title="News Agent"
            description="Günün top 5 etki haberi + AI özet"
            icon={<Newspaper size={16} />}
            iconColorClass="bg-accent/15 text-accent"
          >
            <NewsAgentCard />
          </PinnableAccordion>
          <PinnableAccordion
            id="agent-macro"
            title="Macro Agent"
            description="Risk skoru + makro yorum"
            icon={<BarChart3 size={16} />}
            iconColorClass="bg-warning/15 text-warning"
          >
            <MacroAgentCard />
          </PinnableAccordion>
          <PinnableAccordion
            id="agent-indicator"
            title="Indicator Agent"
            description="Teknik sinyal tarayıcı"
            icon={<Sparkles size={16} />}
            iconColorClass="bg-accent/15 text-accent"
          >
            <IndicatorAgentCard />
          </PinnableAccordion>
        </section>
      ) : (
        <Link
          to="/uyelik"
          className="mb-5 block rounded-xl border border-warning/30 bg-gradient-to-br from-warning/5 to-accent/5 p-5 transition hover:border-warning/60 hover:from-warning/10 hover:to-accent/10"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
              <Radio size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-100">AI Agent'lar</h2>
                <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
                  PRO Özel
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                Claude Haiku tabanlı 4 yapay zeka asistanı — günlük piyasaya tam görünürlük.
              </p>
              <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2 text-xs text-slate-400">
                <div className="flex items-start gap-1.5"><span className="text-accent">[S]</span><span><strong className="text-slate-300">Sentiment</strong> — hisse bazlı haber duyarlılığı</span></div>
                <div className="flex items-start gap-1.5"><span className="text-accent">[N]</span><span><strong className="text-slate-300">News</strong> — günün top 5 etki haberi</span></div>
                <div className="flex items-start gap-1.5"><span className="text-accent">[M]</span><span><strong className="text-slate-300">Macro</strong> — risk skoru + yorum</span></div>
                <div className="flex items-start gap-1.5"><span className="text-accent">[I]</span><span><strong className="text-slate-300">Indicator</strong> — teknik sinyal tarayıcı</span></div>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-warning px-3 py-1.5 text-xs font-bold text-bg shadow-lg shadow-warning/30">
                PRO'ya Yükselt -&gt;
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Top movers — fonlar — sadece canlı feed bağlıyken göster */}
      {topFunds.length > 0 && (
        <details className="group mb-5" open>
          <summary className="mb-2 flex cursor-pointer items-center justify-between px-1 lg:cursor-default lg:list-none">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              {fundsPeriod === 'day' ? 'Günlük' : fundsPeriod === 'week' ? 'Haftalık' : 'Aylık'} En İyi & En Kötü Fonlar
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
              <span className="text-xs text-slate-500 group-open:rotate-180 transition-transform lg:hidden">▼</span>
            </div>
          </summary>
          <TopFundMovers funds={topFunds} limit={5} period={fundsPeriod} />
        </details>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* News column (2/3) */}
        <section className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Canlı Gelişmeler</h2>
            <SourceBadge source={newsSource} />
          </div>
          <div className="space-y-3">
            {topNews.map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
            <Link
              to="/news"
              className="block rounded-xl border border-dashed border-border bg-bg-soft/50 px-4 py-3 text-center text-xs text-slate-400 hover:border-slate-500/40 hover:text-slate-200"
            >
              Tüm gelişmeleri gör →
            </Link>
          </div>
        </section>

        {/* Sidebar (1/3) */}
        <aside className="space-y-4">
          {/* Watchlist */}
          <div className="rounded-xl border border-border bg-bg-soft p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Takip Listem</h2>
              <SourceBadge source={stocksSource} />
            </div>
            {watchlistStocks.length === 0 ? (
              <p className="px-1 py-3 text-xs text-slate-500">
                Listende hisse yok. <Link to="/watchlist" className="text-accent hover:underline">Hisse ekle</Link>
              </p>
            ) : (
              <div className="divide-y divide-border">
                {watchlistStocks.map((s) => (
                  <StockRow key={s.symbol} stock={s} />
                ))}
              </div>
            )}
          </div>

          {/* Makro + Sentiment blokları kaldırıldı — global piyasa verisi için /global sayfasına yönlendir */}
          <Link
            to="/global"
            className="block rounded-xl border border-accent/30 bg-accent/5 p-3 transition hover:border-accent/60 hover:bg-accent/10"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">Global Piyasalar →</h2>
            <p className="mt-1 text-[11px] text-slate-400">
              ABD/Avrupa/Asya endeksleri, Brent, VIX, DXY, Türkiye CDS — hepsi tek sayfada
            </p>
          </Link>
        </aside>
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
