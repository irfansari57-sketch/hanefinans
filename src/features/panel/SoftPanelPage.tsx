/**
 * SoftPanelPage — Varyant A "soft instant" panel tasarımı.
 *
 * Mevcut PanelPage'in alternatifi — route: /panel-v2
 * Mimari:
 *   - Veri kaynakları aynı: usePersistedState SWR + loadPanelSnapshot aggregator
 *   - İlk render INSTANT: localStorage'daki son değerler statik olarak gösterilir
 *   - Skeleton flash YOK — kart iskeleti her zaman var, sadece değerler fade-in
 *   - Tek canlı animasyon: refresh noktası (3sn soft pulse)
 *   - Layout: üst strip + sol büyük chart + 4 mini kart | sağ sütun (haber/enler/portföy)
 *
 * Veri akışı:
 *   mount → loadPanelSnapshot (edge cache ~200ms) → primePanelCaches → loadStocks/News instant
 *   30sn auto-refresh (useVisibleInterval)
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { TrendingUp, Newspaper, Briefcase, Zap } from 'lucide-react';
import { db } from '@/data/db';
import { useAuth } from '@/store/auth';
import { MiniAreaChart } from '@/components/domain/PanelStyleChart';
import { usePersistedState } from '@/lib/usePersistedState';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { useWatchlist } from '@/store/watchlist';
import { loadStocks, loadNews, loadMacroAll, primePanelCaches } from '@/data/services';
import { loadPanelSnapshot } from '@/data/api/panelSnapshot';
import { fetchHistoricalYahoo, fetchQuotesYahoo } from '@/data/api/yahoo';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import { CRYPTOS } from '@/data/cryptoSymbols';
import { MOCK_STOCKS } from '@/data/mock';
import { macroKeyToRoute } from '@/lib/macroRoutes';
import type { MacroIndicator, NewsItem, Stock, FundPerformance } from '@/data/types';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';

const SWR_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_REFRESH_MS = 30_000;

// Üst ticker için gösterilen 7 kritik gösterge (sabit sıra, kullanıcı hep aynı yerde bulur)
const TICKER_KEYS: Array<{ key: string; label: string; unit?: string }> = [
  { key: 'BIST 100',    label: 'BIST 100' },
  { key: 'USD/TRY',     label: 'USD/TRY' },
  { key: 'EUR/TRY',     label: 'EUR/TRY' },
  { key: 'Gram Altın',  label: 'Gram Altın' },
  { key: 'Gram Gümüş',  label: 'Gram Gümüş' },
  { key: 'BTC/USD',     label: 'BTC/USD' },
  { key: 'Brent',       label: 'Brent' },
];

// Mini kart (4 adet) için sabit gösterge seti
const MINI_KEYS: Array<{ key: string; label: string }> = [
  { key: 'BIST 30',    label: 'BIST 30' },
  { key: 'Ons Altın',  label: 'Ons Altın' },
  { key: 'VIX',        label: 'VIX' },
  { key: 'ETH/USD',    label: 'ETH/USD' },
];

/** Soft pulse yeşil nokta — sadece aktif refresh anında görünür */
function RefreshDot({ active }: { active: boolean }) {
  if (!active) return null;
  return <span className="soft-pulse-dot" aria-label="Güncelleniyor" />;
}

/** Yüzdelik değişim göstergesi (compact) */
function Delta({ v, prefix }: { v: number | null | undefined; prefix?: string }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-slate-500 text-[11px]">—</span>;
  const positive = v >= 0;
  const sign = positive ? '+' : '';
  return (
    <span className={cn('text-[11px] font-medium tabular-nums', positive ? 'text-success' : 'text-danger')}>
      {prefix}{sign}{v.toFixed(2)}%
    </span>
  );
}

/** Değer formatlama (Türkçe locale) */
function fmtValue(v: number | null | undefined, maxFrac = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  // Büyük sayılar için K/M kısaltma
  if (Math.abs(v) >= 100_000) {
    return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  }
  if (Math.abs(v) >= 1000) {
    return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  }
  return v.toLocaleString('tr-TR', { maximumFractionDigits: maxFrac });
}

export function SoftPanelPage() {
  const symbols = useWatchlist((s) => s.symbols);
  const user = useAuth((s) => s.user);
  const positions = useLiveQuery(() => db.portfolio.toArray(), []) ?? [];

  // SWR cache — ilk render ANINDA (localStorage'dan)
  const [macro, setMacro] = usePersistedState<MacroIndicator[]>('hf.cache.macro', SWR_TTL_MS, []);
  const [stocks, setStocks] = usePersistedState<Stock[]>('hf.cache.stocks', SWR_TTL_MS, []);
  const [news, setNews] = usePersistedState<NewsItem[]>('hf.cache.news', SWR_TTL_MS, []);
  const [topFunds, setTopFunds] = usePersistedState<FundPerformance[]>('hf.cache.topFunds', SWR_TTL_MS, []);
  const [cryptoQuotes, setCryptoQuotes] = useState<Array<{ symbol: string; price: number; changePct: number }>>([]);

  // Günün Enleri aktif sekme (default: fonlar, kullanıcı en çok ilgilendiği alan)
  const [enlerTab, setEnlerTab] = useState<'funds' | 'stocks' | 'crypto'>('funds');
  // Yön: kazandıran (up) veya kaybettiren (down)
  const [enlerDir, setEnlerDir] = useState<'up' | 'down'>('up');

  // BIST 100 hero chart serisi
  const [heroSeries, setHeroSeries] = useState<Array<{ date: number; close: number }>>([]);
  const [heroPeriod, setHeroPeriod] = useState<'1mo' | '3mo' | '6mo' | '1y' | 'ytd'>('ytd');

  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // WAVE 0: Aggregator — tüm sub-cache'leri doyurur
      try {
        const panel = await loadPanelSnapshot();
        if (panel) primePanelCaches({ snapshot: panel.snapshot, news: panel.news });
      } catch { /* fail → wave 1 fallback */ }

      // WAVE 1: Macro + Stocks paralel (cache primed olduysa instant)
      const prioritySyms = Array.from(new Set([...symbols, ...MOCK_STOCKS.slice(0, 20).map((s) => s.symbol)]));
      try {
        const [m, s] = await Promise.all([
          loadMacroAll(),
          loadStocks(prioritySyms),
        ]);
        setMacro(m.data);
        setStocks(s.data);
        setUpdatedAt(Date.now());
      } catch { /* devam */ }

      // WAVE 2: News + Top funds non-blocking
      loadNews({ max: 8 }).then((n) => n && setNews(n.data)).catch(() => {});
      loadFundsAsPerformance().then((f) => f && setTopFunds(f.funds)).catch(() => {});
    } finally {
      setRefreshing(false);
    }
  }, [symbols]);

  // Kripto quote fetch — 1.5sn defer (kritik path dışı)
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const syms = CRYPTOS.map((c) => c.yahoo);
        const quotes = await fetchQuotesYahoo(syms);
        if (cancelled || !quotes) return;
        const items = quotes.map((q) => {
          const meta = CRYPTOS.find((c) => c.yahoo === q.symbol);
          return {
            symbol: meta ? `${meta.symbol}/USD` : q.symbol,
            price: q.price,
            changePct: q.changePct,
          };
        }).filter((x) => Number.isFinite(x.changePct));
        setCryptoQuotes(items);
      } catch { /* silent */ }
    }, 1500);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useVisibleInterval(() => refresh(), AUTO_REFRESH_MS);

  // Hero chart yükle (BIST 100, period değişince)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hist = await fetchHistoricalYahoo('XU100.IS', heroPeriod, '1d');
        if (cancelled || !hist) return;
        setHeroSeries(hist.closes);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [heroPeriod]);

  const macroMap = useMemo(() => {
    const m = new Map<string, MacroIndicator>();
    for (const x of macro) m.set(x.key, x);
    return m;
  }, [macro]);

  const bist100 = macroMap.get('BIST 100');
  const bist100Positive = (bist100?.changePct ?? 0) >= 0;

  // Günün Enleri — enlerDir ('up' kazandıran | 'down' kaybettiren) yönüne göre sırala
  const sortByDir = <T,>(arr: T[], getVal: (x: T) => number) =>
    [...arr].sort((a, b) => enlerDir === 'up' ? getVal(b) - getVal(a) : getVal(a) - getVal(b));

  const topStocks = useMemo(() => sortByDir(
    stocks.filter((s) => s.price > 0 && Number.isFinite(s.changePct) && Math.abs(s.changePct) <= 11),
    (s) => s.changePct,
  ).slice(0, 5), [stocks, enlerDir]);

  // Fon outlier filtresi: TEFAS feed'inde bazı serbest fonlar fon-kapanısı
  // sonrası -100% veya absürt değerler döndürüyor (kurucu değişimi, likidasyon).
  // ±%50 üstü günlük değişim mantıksız — veri hatası, filtreliyoruz.
  const topFundsSorted = useMemo(() => sortByDir(
    topFunds.filter((f) => Number.isFinite(f.day) && Math.abs(f.day) <= 50),
    (f) => f.day,
  ).slice(0, 5), [topFunds, enlerDir]);

  const topCrypto = useMemo(() => sortByDir(
    cryptoQuotes.filter((c) => Number.isFinite(c.changePct)),
    (c) => c.changePct,
  ).slice(0, 5), [cryptoQuotes, enlerDir]);

  // Portföy özet — fiyat haritası + maliyet üzerinden hesapla
  const [fundMap, setFundMap] = useState<Map<string, FundPerformance>>(new Map());
  useEffect(() => {
    const fundPositions = positions.filter((p) => p.kind === 'fund');
    if (fundPositions.length === 0) { setFundMap(new Map()); return; }
    let alive = true;
    loadFundsAsPerformance().then((r) => {
      if (!alive || !r?.funds) return;
      const m = new Map<string, FundPerformance>();
      for (const f of r.funds) m.set(f.code, f);
      setFundMap(m);
    });
    return () => { alive = false; };
  }, [positions.length]);

  // Portföyde olup priority listede olmayan hisseleri de ayrıca fetchle —
  // böylece panel'deki Portföyüm kartı her sembole fiyat bulur.
  const [portfolioStockMap, setPortfolioStockMap] = useState<Map<string, Stock>>(new Map());
  useEffect(() => {
    const stockPositions = positions.filter((p) => p.kind !== 'fund');
    if (stockPositions.length === 0) { setPortfolioStockMap(new Map()); return; }
    let alive = true;
    const syms = Array.from(new Set(stockPositions.map((p) => p.symbol)));
    loadStocks(syms).then(({ data }) => {
      if (!alive) return;
      const m = new Map<string, Stock>();
      for (const s of data) m.set(s.symbol, s);
      setPortfolioStockMap(m);
    });
    return () => { alive = false; };
  }, [positions.length, positions.map((p) => p.symbol).join(',')]);

  const stockMap = useMemo(() => {
    // Önce portföy-özel fetch, sonra genel stocks list fallback
    const m = new Map<string, Stock>(portfolioStockMap);
    for (const s of stocks) if (!m.has(s.symbol)) m.set(s.symbol, s);
    return m;
  }, [stocks, portfolioStockMap]);

  const portfolio = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let dailyPnl = 0;
    for (const p of positions) {
      const qty = p.quantity ?? 0;
      const cost = (p.avgPrice ?? 0) * qty;
      let currentPrice: number | undefined;
      let dayChangePct: number | undefined;
      if (p.kind === 'fund') {
        const f = fundMap.get(p.symbol);
        currentPrice = f?.nav;
        dayChangePct = f?.day;
      } else {
        const s = stockMap.get(p.symbol);
        currentPrice = s?.price;
        dayChangePct = s?.changePct;
      }
      if (currentPrice && currentPrice > 0) {
        const value = currentPrice * qty;
        totalValue += value;
        totalCost += cost;
        if (dayChangePct != null && Number.isFinite(dayChangePct)) {
          // Günlük değişim = bugünkü_değer - dünkü_değer; dayChangePct yüzdeyle
          const prevValue = value / (1 + dayChangePct / 100);
          dailyPnl += (value - prevValue);
        }
      }
    }
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const dailyPct = totalValue > 0 ? (dailyPnl / (totalValue - dailyPnl)) * 100 : 0;
    return {
      totalValue,
      totalCost,
      totalPnl,
      totalPnlPct,
      dailyPnl,
      dailyPct,
      count: positions.length,
      hasData: positions.length > 0 && totalValue > 0,
    };
  }, [positions, stockMap, fundMap]);

  // Son dakika — ilk 4 haber
  const topNews = useMemo(() => news.slice(0, 4), [news]);

  return (
    <>
      <SeoHead title="Panel" description="InvestliQ ana panel — BIST, döviz, altın, kripto ve portföy özeti." path="/panel-v2" />

      {/* Soft pulse animasyonu + hero gradient — tek sefer tanım */}
      <style>{`
        @keyframes soft-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
        .soft-pulse-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #10b981;
          margin-left: 8px;
          animation: soft-pulse 2.5s ease-in-out infinite;
          vertical-align: middle;
        }
        .ticker-chip {
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid rgba(51, 65, 85, 0.3);
          border-radius: 10px;
          padding: 10px 12px;
          transition: background 0.2s, border-color 0.2s;
        }
        .ticker-chip:hover {
          background: rgba(30, 41, 59, 0.6);
          border-color: rgba(16, 185, 129, 0.3);
        }
        .mini-card {
          background: rgba(30, 41, 59, 0.3);
          border: 1px solid rgba(51, 65, 85, 0.3);
          border-radius: 12px;
          padding: 14px 16px;
          transition: background 0.2s;
        }
        .mini-card:hover { background: rgba(30, 41, 59, 0.5); }
        .side-card {
          background: rgba(30, 41, 59, 0.3);
          border: 1px solid rgba(51, 65, 85, 0.3);
          border-radius: 12px;
          padding: 16px 18px;
        }
        .hero-card {
          background: linear-gradient(180deg, rgba(16, 185, 129, 0.04) 0%, transparent 100%);
          border: 1px solid rgba(51, 65, 85, 0.4);
          border-radius: 16px;
          padding: 20px 24px;
        }
      `}</style>

      {/* PageHeader kaldırıldı — kullanıcı daha fazla dikey alan istiyor.
          Güncel saat + refresh indicator ticker strip'in sağ üstünde göze çarpmayacak. */}

      {/* ============ ÜST TICKER STRIP (7 chip) + mini durum ============ */}
      {updatedAt && (
        <div className="mb-2 flex items-center justify-end gap-2 text-[10px] text-slate-500">
          <RefreshDot active={refreshing} />
          <span>Güncel · {new Date(updatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {TICKER_KEYS.map((t) => {
          const m = macroMap.get(t.key);
          const positive = (m?.changePct ?? 0) >= 0;
          const route = macroKeyToRoute(t.key) ?? '/panel';
          return (
            <Link
              key={t.key}
              to={route}
              className="ticker-chip block"
            >
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{t.label}</div>
              <div className="text-sm font-semibold tabular-nums text-slate-100 mt-0.5">{fmtValue(m?.value)}</div>
              <div className={cn('text-[11px] font-medium tabular-nums', positive ? 'text-success' : 'text-danger')}>
                {m ? (positive ? '+' : '') + (m.changePct ?? 0).toFixed(2) + '%' : '—'}
              </div>
            </Link>
          );
        })}
      </div>

      {/* ============ ANA GRID (sol: chart+mini, sağ: haber+enler+portföy) ============ */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr]">
        {/* SOL SÜTUN */}
        <div className="flex flex-col gap-3">
          {/* HERO CHART — BIST 100 */}
          <div className="hero-card">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  BIST 100
                </div>
                <div className="mt-0.5 text-3xl font-semibold tabular-nums text-slate-100">
                  {fmtValue(bist100?.value)}
                </div>
                <div className={cn('mt-0.5 text-sm font-medium tabular-nums', bist100Positive ? 'text-success' : 'text-danger')}>
                  {bist100 ? (bist100Positive ? '+' : '') + (bist100.changePct ?? 0).toFixed(2) + '%' : '—'}
                </div>
              </div>
              <div className="flex gap-1">
                {(['1mo', '3mo', '6mo', 'ytd', '1y'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setHeroPeriod(p)}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-medium rounded-md transition',
                      heroPeriod === p ? 'bg-success/15 text-success' : 'text-slate-500 hover:text-slate-300',
                    )}
                  >
                    {p === 'ytd' ? 'YBB' : p === '1mo' ? '1A' : p === '3mo' ? '3A' : p === '6mo' ? '6A' : '1Y'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 200 }}>
              {heroSeries.length > 1 ? (
                <MiniAreaChart data={heroSeries} positive={bist100Positive} />
              ) : (
                <div className="h-full rounded-md bg-bg-soft/20" />
              )}
            </div>
          </div>

          {/* 4 MİNİ KART */}
          <div className="grid grid-cols-2 gap-2">
            {/* Portföyüm — dinamik: pozisyon varsa toplam değer + günlük P/L; yoksa CTA */}
            <Link to="/portfolio" className="mini-card block">
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Portföyüm</div>
              {user && portfolio.hasData ? (
                <>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">
                    ₺{portfolio.totalValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                  </div>
                  <Delta v={portfolio.dailyPct} prefix="Bugün " />
                </>
              ) : (
                <>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">Takibe git →</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">Pozisyon ekle, canlı takip</div>
                </>
              )}
            </Link>
            {MINI_KEYS.map((mk) => {
              const m = macroMap.get(mk.key);
              const route = macroKeyToRoute(mk.key) ?? '/panel';
              return (
                <Link key={mk.key} to={route} className="mini-card block">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{mk.label}</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">{fmtValue(m?.value)}</div>
                  <Delta v={m?.changePct} />
                </Link>
              );
            })}
          </div>
        </div>

        {/* SAĞ SÜTUN */}
        <div className="flex flex-col gap-3">
          {/* Son Dakika */}
          <div className="side-card">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Newspaper size={14} className="text-success" />
                Son Dakika
              </div>
              <Link to="/news" className="text-[10px] text-slate-500 hover:text-accent">Tümü →</Link>
            </div>
            {topNews.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-slate-500">Haberler yükleniyor…</div>
            ) : (
              <div className="divide-y divide-slate-700/20">
                {topNews.map((n) => (
                  <a
                    key={n.id ?? n.url}
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block py-2 text-[12px] text-slate-300 hover:text-slate-100 leading-relaxed"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-success" />
                      <span className="flex-1 line-clamp-2">{n.title}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Günün Enleri — Fonlar / Hisseler / Kripto tab'lı + Kazandıran/Kaybettiren toggle */}
          <div className="side-card">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <TrendingUp size={14} className={enlerDir === 'up' ? 'text-success' : 'text-danger'} />
                Günün Enleri
              </div>
              {/* Kazandıran / Kaybettiren toggle — compact */}
              <div className="inline-flex rounded-md border border-slate-700/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setEnlerDir('up')}
                  className={cn(
                    'rounded px-2 py-0.5 text-[10px] font-medium transition',
                    enlerDir === 'up' ? 'bg-success/15 text-success' : 'text-slate-500 hover:text-slate-300',
                  )}
                >
                  ↑ Kazandıran
                </button>
                <button
                  type="button"
                  onClick={() => setEnlerDir('down')}
                  className={cn(
                    'rounded px-2 py-0.5 text-[10px] font-medium transition',
                    enlerDir === 'down' ? 'bg-danger/15 text-danger' : 'text-slate-500 hover:text-slate-300',
                  )}
                >
                  ↓ Kaybettiren
                </button>
              </div>
            </div>

            {/* Tab seçici — compact pills */}
            <div className="mb-2 flex gap-1">
              {([
                { k: 'funds',  label: 'Fonlar',  disabled: topFundsSorted.length === 0 },
                { k: 'stocks', label: 'Hisseler', disabled: topStocks.length === 0 },
                { k: 'crypto', label: 'Kripto',   disabled: topCrypto.length === 0 },
              ] as const).map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setEnlerTab(t.k)}
                  disabled={t.disabled}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                    enlerTab === t.k
                      ? 'bg-success/15 text-success'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/20',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Aktif tab içeriği */}
            {enlerTab === 'funds' && (
              topFundsSorted.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-slate-500">Fon verisi yükleniyor…</div>
              ) : (
                <div className="divide-y divide-slate-700/20">
                  {topFundsSorted.map((f) => (
                    <Link
                      key={f.code}
                      to={`/fund/${f.code}`}
                      className="flex items-center justify-between py-1.5 text-xs hover:bg-slate-700/10 -mx-2 px-2 rounded"
                      title={f.name || f.code}
                    >
                      <div className="font-mono font-bold text-slate-100">{f.code}</div>
                      <Delta v={f.day} />
                    </Link>
                  ))}
                </div>
              )
            )}

            {enlerTab === 'stocks' && (
              topStocks.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-slate-500">Hisse verisi yükleniyor…</div>
              ) : (
                <div className="divide-y divide-slate-700/20">
                  {topStocks.map((s) => (
                    <Link
                      key={s.symbol}
                      to={`/stock/${s.symbol}`}
                      className="flex items-center justify-between py-1.5 text-xs hover:bg-slate-700/10 -mx-2 px-2 rounded"
                      title={s.name || s.symbol}
                    >
                      <div className="font-mono font-bold text-slate-100">{s.symbol}</div>
                      <Delta v={s.changePct} />
                    </Link>
                  ))}
                </div>
              )
            )}

            {enlerTab === 'crypto' && (
              topCrypto.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-slate-500">Kripto verisi yükleniyor…</div>
              ) : (
                <div className="divide-y divide-slate-700/20">
                  {topCrypto.map((c) => (
                    <Link
                      key={c.symbol}
                      to={`/crypto/${encodeURIComponent(c.symbol.split('/')[0])}`}
                      className="flex items-center justify-between py-1.5 text-xs hover:bg-slate-700/10 -mx-2 px-2 rounded"
                    >
                      <div className="font-mono font-bold text-slate-100">{c.symbol}</div>
                      <Delta v={c.changePct} />
                    </Link>
                  ))}
                </div>
              )
            )}
          </div>

          {/* Portföyüm — pozisyon varsa 4-metrik ozet, yoksa CTA */}
          <Link to="/portfolio" className="side-card block hover:border-success/30 transition">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Briefcase size={14} className="text-success" />
                Portföyüm
              </div>
              {user && portfolio.hasData ? (
                <span className="text-[10px] text-slate-500">{portfolio.count} pozisyon</span>
              ) : (
                <Zap size={14} className="text-slate-500" />
              )}
            </div>
            {user && portfolio.hasData ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-slate-500">Toplam Değer</div>
                  <div className="text-sm font-semibold tabular-nums text-slate-100">
                    ₺{portfolio.totalValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Toplam K/Z</div>
                  <div className={cn('text-sm font-semibold tabular-nums', portfolio.totalPnl >= 0 ? 'text-success' : 'text-danger')}>
                    {portfolio.totalPnl >= 0 ? '+' : ''}₺{Math.abs(portfolio.totalPnl).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                  </div>
                  <div className={cn('text-[10px] tabular-nums', portfolio.totalPnlPct >= 0 ? 'text-success' : 'text-danger')}>
                    {portfolio.totalPnlPct >= 0 ? '+' : ''}{portfolio.totalPnlPct.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Bugünkü K/Z</div>
                  <div className={cn('text-sm font-semibold tabular-nums', portfolio.dailyPnl >= 0 ? 'text-success' : 'text-danger')}>
                    {portfolio.dailyPnl >= 0 ? '+' : ''}₺{Math.abs(portfolio.dailyPnl).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                  </div>
                  <div className={cn('text-[10px] tabular-nums', portfolio.dailyPct >= 0 ? 'text-success' : 'text-danger')}>
                    {portfolio.dailyPct >= 0 ? '+' : ''}{portfolio.dailyPct.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Maliyet</div>
                  <div className="text-sm font-semibold tabular-nums text-slate-300">
                    ₺{portfolio.totalCost.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 leading-relaxed">
                {user ? 'Henüz pozisyon yok. Hisse/fon ekle, canlı takip et.' : 'Pozisyonlarını takip et, performans grafiğini gör, benchmark karşılaştır.'}
              </div>
            )}
          </Link>
        </div>
      </div>

      <div className="mt-6 text-center text-[10px] text-slate-500">
        Klasik görünüme dönmek için{' '}
        <Link to="/panel-eski" className="text-accent hover:underline">eski Panel</Link>
      </div>
    </>
  );
}
