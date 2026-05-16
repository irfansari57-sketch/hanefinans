import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, AlertTriangle, CalendarClock, MessageSquare, Radio, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { AdBanner } from '@/components/domain/AdBanner';
import { useAuth, isPro } from '@/store/auth';
import { NewsCard } from '@/components/domain/NewsCard';
import { MacroCard } from '@/components/domain/MacroCard';
import { StockRow } from '@/components/domain/StockRow';
import { TopMovers } from '@/components/domain/TopMovers';
import { TopFundMovers } from '@/components/domain/TopFundMovers';
import { Ticker } from '@/components/domain/Ticker';
import { LiveBadge } from '@/components/domain/LiveBadge';
import {
  MOCK_EVENTS, MOCK_SENTIMENT, MOCK_STOCKS, MOCK_MACRO_FALLBACK, MOCK_NEWS,
} from '@/data/mock';
import { MOCK_FUNDS } from '@/data/mockFunds';
import { loadStocks, loadNews, loadMacroAll, loadSentiment, clearServiceCaches } from '@/data/services';
import type { MacroIndicator, NewsItem, Stock, SentimentMention } from '@/data/types';
import { useWatchlist } from '@/store/watchlist';
import { cn } from '@/lib/utils';
import { daysUntil, formatDateShort } from '@/lib/date';

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
  const allSymbols = useMemo(() => MOCK_STOCKS.map((s) => s.symbol), []);
  const user = useAuth((s) => s.user);
  const proUser = isPro(user);

  const [macro, setMacro] = useState<MacroIndicator[]>(MOCK_MACRO_FALLBACK);
  const [stocks, setStocks] = useState<Stock[]>(MOCK_STOCKS);
  const [news, setNews] = useState<NewsItem[]>(MOCK_NEWS);
  const [newsSource, setNewsSource] = useState<'live' | 'mock' | 'mixed'>('mock');
  const [stocksSource, setStocksSource] = useState<'live' | 'mock' | 'mixed'>('mock');
  const [sentiment, setSentiment] = useState<SentimentMention[]>(MOCK_SENTIMENT);
  const [sentimentSource, setSentimentSource] = useState<'live' | 'mock' | 'derived'>('mock');
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (force = false) => {
    if (force) clearServiceCaches();
    setRefreshing(true);
    try {
      const [s, m, n, se] = await Promise.all([
        loadStocks(allSymbols),
        loadMacroAll(),
        loadNews({ max: 8 }),
        loadSentiment(),
      ]);
      setStocks(s.data);
      setStocksSource(s.source);
      setMacro(m.data);
      setNews(n.data);
      setNewsSource(n.source);
      setSentiment(se.data);
      setSentimentSource(se.source);
      setUpdatedAt(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, [allSymbols]);

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

  return (
    <>
      {/* Live ticker — sayfanın en üstünde */}
      <div className="mb-4">
        <Ticker stocks={tickerStocks} speed={50} />
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

      {/* Reklam banner — sponsorlu içerik (PRO/ELITE'de gizli) */}
      {!proUser && <AdBanner className="mb-5" />}

      {/* Status banner */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-xs leading-relaxed text-slate-300">
          <span className="font-semibold text-warning">Otomatik yenileme aktif:</span> Hisseler 60 saniyede bir Yahoo
          Finance üzerinden taze çekilir; değişen fiyatlar yeşil/kırmızı parlar.
        </p>
      </div>

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
            .map((m) => (
              <div key={m.key} className="glass-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{m.label}</span>
                  {m.source === 'live' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-medium text-success">
                      <Radio size={8} /> CANLI
                    </span>
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
              </div>
            ))}
          {/* USD/TRY ve EUR/TRY de BIST'le birlikte göster */}
          {macro
            .filter((m) => m.key === 'USD/TRY' || m.key === 'EUR/TRY')
            .map((m) => (
              <div key={m.key} className="glass-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{m.label}</span>
                  {m.source === 'live' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-medium text-success">
                      <Radio size={8} /> CANLI
                    </span>
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
              </div>
            ))}
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
            Günün Hareketleri — Hisseler ({stocks.length})
          </h2>
          <div className="flex items-center gap-2">
            <SourceBadge source={stocksSource} />
            <span className="text-xs text-slate-500 group-open:rotate-180 transition-transform lg:hidden">▼</span>
          </div>
        </summary>
        <TopMovers stocks={stocks} limit={5} />
      </details>

      {/* Top movers — fonlar (mobilde collapse) */}
      <details className="group mb-5" open>
        <summary className="mb-2 flex cursor-pointer items-center justify-between px-1 lg:cursor-default lg:list-none">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Günün Hareketleri — Fonlar
          </h2>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">demo</span>
            <span className="text-xs text-slate-500 group-open:rotate-180 transition-transform lg:hidden">▼</span>
          </div>
        </summary>
        <TopFundMovers funds={MOCK_FUNDS} limit={5} period="day" />
      </details>

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

          {/* Macro */}
          <div className="rounded-xl border border-border bg-bg-soft p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Makro</h2>
              <Link to="/macro" className="text-[10px] text-accent hover:underline">tümü →</Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {topMacro.map((m) => (
                <MacroCard key={m.key} item={m} compact />
              ))}
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <CalendarClock size={11} /> Yaklaşan Olaylar
              </div>
              <ul className="space-y-1.5 px-1 text-xs">
                {upcomingEvents.map((e) => {
                  const dleft = daysUntil(e.date);
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-300">{e.title}</span>
                      <span className="shrink-0 text-slate-500">
                        {formatDateShort(e.date)}
                        <span className="ml-1 text-[10px] text-slate-600">
                          ({dleft <= 0 ? 'bugün' : `${dleft} gün`})
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Sentiment */}
          <div className="rounded-xl border border-border bg-bg-soft p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <MessageSquare size={11} /> En Çok Bahsedilen
              </h2>
              <SourceBadge source={sentimentSource} />
            </div>
            <div className="divide-y divide-border">
              {topMentions.map((m, i) => (
                <div key={m.symbol} className="flex items-center justify-between px-1 py-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-3 text-slate-500">{i + 1}</span>
                    <span className="font-mono text-accent">{m.symbol}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">{m.count} bahis</span>
                    <span className={cn('w-12 text-right font-medium', sentimentTone[m.sentiment])}>
                      {sentimentLabel[m.sentiment]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function SourceBadge({ source }: { source: 'live' | 'mock' | 'mixed' | 'derived' }) {
  if (source === 'live') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
        <Radio size={9} /> CANLI
      </span>
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
