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
import { EconomicCalendarWidget } from '@/components/domain/EconomicCalendarWidget';
import { db } from '@/data/db';
import { useAuth } from '@/store/auth';
import { MiniAreaChart } from '@/components/domain/PanelStyleChart';
import { usePersistedState } from '@/lib/usePersistedState';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { isBistOpen } from '@/lib/marketCalendar';
import { useWatchlist } from '@/store/watchlist';
import { loadStocks, loadNews, loadMacroAll, primePanelCaches } from '@/data/services';
import { loadPanelSnapshot } from '@/data/api/panelSnapshot';
import { fetchHistoricalYahoo, fetchQuotesYahoo } from '@/data/api/yahoo';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import { CRYPTOS } from '@/data/cryptoSymbols';
import { MOCK_STOCKS } from '@/data/mock';
import type { MacroIndicator, NewsItem, Stock, FundPerformance } from '@/data/types';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';
import { DataFreshness } from '@/components/ui/DataFreshness';
import { EvidenceLink } from '@/components/ui/EvidenceLink';

const SWR_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_REFRESH_MS = 30_000;

/** Soft pulse yeşil nokta — sadece aktif refresh anında görünür */
function RefreshDot({ active }: { active: boolean }) {
  if (!active) return null;
  return <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-label="Güncelleniyor" />;
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

  // Günün Enleri aktif sekme — BES tab'ı eklendi (11 Eki)
  const [enlerTab, setEnlerTab] = useState<'stocks' | 'funds' | 'bes' | 'crypto'>('stocks');

  // Günün Enleri — unified CF Function /api/panel/top-movers 4 kategori birden döner.
  // Her kategori: pre-sorted top 10 gainers + top 10 losers. FVT paritesi, edge cache 60sn.
  interface Mover { kod: string; ad: string; pct: number; fiyat: number }
  interface TopMoversPayload {
    stocks: { gainers: Mover[]; losers: Mover[]; stale?: boolean; staleDate?: string; asOf?: string };
    funds:  { gainers: Mover[]; losers: Mover[]; stale?: boolean; staleDate?: string; asOf?: string };
    bes:    { gainers: Mover[]; losers: Mover[] };
    crypto: { gainers: Mover[]; losers: Mover[]; stale?: boolean; staleDate?: string; asOf?: string };
  }
  const [topMovers, setTopMovers] = useState<TopMoversPayload | null>(null);
  const loadTopMovers = useCallback(async () => {
    try {
      const r = await fetch('/api/panel/top-movers');
      if (!r.ok) return;
      const j = (await r.json()) as { ok: boolean } & TopMoversPayload;
      if (!j.ok) return;
      setTopMovers({ stocks: j.stocks, funds: j.funds, bes: j.bes, crypto: j.crypto });
    } catch { /* silent */ }
  }, []);
  useEffect(() => {
    const t = setTimeout(loadTopMovers, 800); // kritik path dışı: 0,8 sn ertele
    return () => clearTimeout(t);
  }, [loadTopMovers]);
  // 15 Eki 2026: "Bugün" seans boyunca canlı — açıkken 60 sn (sunucu TTL ile aynı),
  // kapalıyken 10 dk (fon/BES NAV'ları gün sonu değişir). Sekme gizliyken durur.
  const [bistOpenNow, setBistOpenNow] = useState(() => isBistOpen());
  useVisibleInterval(() => setBistOpenNow(isBistOpen()), 60_000, { fireOnVisible: true });
  useVisibleInterval(loadTopMovers, bistOpenNow ? 60_000 : 10 * 60_000, { fireOnVisible: true });

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
      // 11 Eki 2026: 8 → 30 — kritik haber (konkordato vb.) ilk 8'in dışında kalıyordu
      loadNews({ max: 30 }).then((n) => n && setNews(n.data)).catch(() => {});
      // loadFundsAsPerformance() KALDIRILDI (11 Eki): /api/funds/live 1.4s + 235KB
      // critical path'ten çıktı. Günün Enleri Fonlar tab'ı artık /api/panel/top-movers
      // FVT endpoint'inden geliyor (daha güvenilir + tek fetch unified). Fallback
      // olarak sadece portfolio'da fon pozisyonu varsa fundMap effect'i yüklüyor.
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

  // 4 kategori için FVT paritesi — topMovers payload'ından enlerDir'e göre seç.
  const moverToStock = (x: Mover): Stock => ({
    symbol: x.kod,
    name: x.ad || x.kod,
    price: x.fiyat,
    changePct: x.pct,
    updatedAt: new Date().toISOString(),
  });

  const topStocks = useMemo(() => {
    if (topMovers) {
      const list = enlerDir === 'up' ? topMovers.stocks.gainers : topMovers.stocks.losers;
      if (list.length > 0) return list.map(moverToStock);
    }
    // 23 Eki 2026: küçük "öncelikli hisse" kümesine DÜŞÜLMEZ — "Yükselenler" diye yanlış
    // sıralama göstermek itibar riski. Sunucu seans öncesi/tatilde son kapanış kopyasını verir;
    // o da yoksa liste boş kalır ve açıklama gösterilir.
    return [];
  }, [topMovers, enlerDir]);

  // Fonlar — FVT top-movers endpoint'inden pre-sorted + outlier filtered
  const topFundsSorted = useMemo(() => {
    if (topMovers) {
      const list = enlerDir === 'up' ? topMovers.funds.gainers : topMovers.funds.losers;
      // FundPerformance shape — kod + day sırası için yeterli
      return list.map((f) => ({
        code: f.kod,
        name: f.ad || f.kod,
        day: f.pct,
        week: NaN, month: NaN, threeMonth: NaN, sixMonth: NaN, ytd: NaN, year: NaN,
        tefas: true,
        tefasOpen: true,
        category: 'Diğer' as const,
      }) as FundPerformance);
    }
    // Fallback: old loadFundsAsPerformance data
    return sortByDir(
      topFunds.filter((f) =>
        Number.isFinite(f.day) && f.day !== 0 && Math.abs(f.day) <= 10 && f.tefasOpen !== false &&
        !/TASFIYE|TASFİYE|KAPALI|KURUCU DEVR|BİRLEŞ|SONA ER/i.test(f.name ?? '')
      ),
      (f) => f.day,
    ).slice(0, 10);
  }, [topFunds, topMovers, enlerDir]);

  // BES fonları — FVT top-movers
  const topBes = useMemo(() => {
    if (!topMovers) return [];
    const list = enlerDir === 'up' ? topMovers.bes.gainers : topMovers.bes.losers;
    return list.map((f) => ({ kod: f.kod, ad: f.ad, pct: f.pct, fiyat: f.fiyat }));
  }, [topMovers, enlerDir]);

  const topCrypto = useMemo(() => {
    // 21 Eki 2026: sunucu kripto listesi boşsa (CoinGecko erişilemedi) Yahoo yedeğine düş
    if (topMovers && (topMovers.crypto.gainers.length > 0 || topMovers.crypto.losers.length > 0)) {
      const list = enlerDir === 'up' ? topMovers.crypto.gainers : topMovers.crypto.losers;
      // kod zaten "BTC/USD" biçiminde gelebilir (CoinGecko yolu) — çift ek engelle
      return list.map((c) => ({ symbol: c.kod.includes('/') ? c.kod : c.kod + '/USD', price: c.fiyat, changePct: c.pct }));
    }
    // Fallback: Yahoo-based crypto quotes
    return sortByDir(
      cryptoQuotes.filter((c) => Number.isFinite(c.changePct)),
      (c) => c.changePct,
    ).slice(0, 10);
  }, [cryptoQuotes, topMovers, enlerDir]);

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
      const qty = p.lot ?? 0;
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


  // Portföy yoğunluğu — deterministik risk cümlesi (Design 03 Signature #10, v1)
  const concentration = useMemo(() => {
    const vals: number[] = [];
    for (const p of positions) {
      const qty = p.lot ?? 0;
      const price = p.kind === 'fund' ? fundMap.get(p.symbol)?.nav : stockMap.get(p.symbol)?.price;
      if (price && price > 0) vals.push(price * qty);
    }
    const total = vals.reduce((a, b) => a + b, 0);
    if (total <= 0 || vals.length === 0) return null;
    const sorted = [...vals].sort((a, b) => b - a);
    const top = Math.min(3, sorted.length);
    const topShare = sorted.slice(0, top).reduce((a, b) => a + b, 0) / total;
    const hhi = vals.reduce((a, v) => a + (v / total) ** 2, 0);
    return { top, topShare, hhi, effN: 1 / hhi, count: vals.length };
  }, [positions, fundMap, stockMap]);

  const watched = useMemo(
    () => symbols.map((sym) => stockMap.get(sym)).filter((x): x is Stock => !!x && x.price > 0).slice(0, 6),
    [symbols, stockMap],
  );

  const criticalNews = useMemo(() => news.filter((n) => n.critical).slice(0, 2), [news]);
  // 21 Eki 2026: kritik haberler akıştan ÇIKARILMIYOR — akışta kronolojik, vurgulu
  // (kırmızı sol çizgi + neden rozeti). Kritikler önce sıralanmaz; zaman sırası korunur.
  const feedNews = useMemo(() => news.slice(0, 8), [news]);

  const Pct = ({ v, invert }: { v: number | null | undefined; invert?: boolean }) => {
    if (v == null || !Number.isFinite(v)) return <span className="font-mono text-fg-3">—</span>;
    const good = invert ? v <= 0 : v >= 0;
    return <span className={cn('font-mono font-semibold', v === 0 ? 'text-neutral' : good ? 'text-success' : 'text-danger')}>{v > 0 ? '+' : ''}{v.toFixed(2)}%</span>;
  };

  const MoverRow = ({ to, code, name, pct }: { to: string; code: string; name?: string; pct: number }) => (
    <Link to={to} className="flex h-row items-center justify-between border-b border-border/60 last:border-0 hover:bg-bg-card -mx-1 px-1 rounded text-table">
      <span className="flex min-w-0 items-baseline gap-2"><span className="shrink-0 font-mono font-semibold text-fg">{code}</span>{name && <span className="hidden min-w-0 truncate text-[11px] text-fg-3 sm:inline">{name.replace(/\s+(A\.Ş\.|A\.S\.|AŞ|T\.A\.Ş\.|Sanayi ve Ticaret|San\. ve Tic\.).*$/i, '')}</span>}</span>
      <Pct v={pct} />
    </Link>
  );

  type EnlerRow = { key: string; to: string; code: string; name?: string; pct: number };
  const enlerList: EnlerRow[] = (() => {
    if (enlerTab === 'stocks') return topStocks.map((s) => ({ key: s.symbol, to: `/stock/${s.symbol}`, code: s.symbol, name: s.name !== s.symbol ? s.name : undefined, pct: s.changePct }));
    if (enlerTab === 'funds') return topFundsSorted.map((f) => ({ key: f.code, to: `/fund/${f.code}`, code: f.code, name: f.name !== f.code ? f.name : undefined, pct: f.day }));
    if (enlerTab === 'bes') return topBes.map((f) => ({ key: f.kod, to: `/fund/${f.kod}`, code: f.kod, name: f.ad !== f.kod ? f.ad : undefined, pct: f.pct }));
    return topCrypto.map((c) => ({ key: c.symbol, to: `/crypto/${encodeURIComponent(c.symbol.split('/')[0])}`, code: c.symbol, name: undefined, pct: c.changePct }));
  })();

  return (
    <>
      <SeoHead title="Piyasa Durumu" description="InvestliQ — BIST, döviz, altın, kripto ve portföy: bugün ne oldu, neden, ne izlemeli." path="/" />

      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-[22px] font-semibold leading-[30px] text-fg">Piyasa Durumu</h1>
        <RefreshDot active={refreshing} />
        {updatedAt && <span className="ml-auto text-[11px] text-fg-3">Güncellendi {new Date(updatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      {/* 12 sütun: 7 grafik + 5 Bugün */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7 min-w-0">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-base font-semibold text-fg">BIST 100</h2>
            <span className="font-mono text-xl font-semibold text-fg">{fmtValue(bist100?.value)}</span>
            <Pct v={bist100?.changePct} />
            {bist100 && <DataFreshness source={bist100.feedSource} asOf={bist100.asOf ?? bist100.updatedAt} delayMin={15} compact />}
            <div className="ml-auto flex gap-0.5">
              {(['1mo', '3mo', '6mo', 'ytd', '1y'] as const).map((p) => (
                <button key={p} onClick={() => setHeroPeriod(p)} className={cn('rounded px-2 py-0.5 text-[11px]', heroPeriod === p ? 'bg-bg-card text-fg' : 'text-fg-2 hover:text-fg')}>
                  {p === 'ytd' ? 'YTD' : p === '1mo' ? '1A' : p === '3mo' ? '3A' : p === '6mo' ? '6A' : '1Y'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 300 }} className="mt-2">
            {heroSeries.length > 1 ? <MiniAreaChart data={heroSeries} positive={bist100Positive} variant="line" /> : <div className="h-full rounded-md bg-bg-soft" />}
          </div>
        </section>

        <section className="lg:col-span-5 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-fg">Bugün</h2>
            <div className="ml-auto inline-flex h-7 overflow-hidden rounded-md border border-border bg-bg-soft">
              {([['stocks', 'Hisseler'], ['funds', 'Fonlar'], ['bes', 'BES'], ['crypto', 'Kripto']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setEnlerTab(k)} className={cn('px-2 text-[11px]', enlerTab === k ? 'bg-bg-card text-fg' : 'text-fg-2 hover:text-fg')}>{label}</button>
              ))}
            </div>
            <div className="inline-flex h-7 overflow-hidden rounded-md border border-border bg-bg-soft">
              <button type="button" onClick={() => setEnlerDir('up')} className={cn('px-2 text-[11px]', enlerDir === 'up' ? 'bg-bg-card text-success' : 'text-fg-2')}>▲</button>
              <button type="button" onClick={() => setEnlerDir('down')} className={cn('px-2 text-[11px]', enlerDir === 'down' ? 'bg-bg-card text-danger' : 'text-fg-2')}>▼</button>
            </div>
          </div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-3">
            {enlerDir === 'up' ? '▲ Yükselenler' : '▼ Düşenler'} · günlük %
            <span className="ml-1.5 font-normal normal-case tracking-normal">
              {(() => {
                const cat = enlerTab === 'stocks' ? topMovers?.stocks : enlerTab === 'funds' ? topMovers?.funds : enlerTab === 'crypto' ? topMovers?.crypto : undefined;
                if (cat?.stale) {
                  const d = cat.staleDate ? new Date(cat.staleDate + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : 'önceki';
                  return <span className="text-warning">· {d} kapanışı (seans öncesi)</span>;
                }
                return enlerTab === 'stocks' ? '· İş Yatırım · ~15 dk gecikmeli' : enlerTab === 'funds' ? '· TEFAS · önceki gün NAV' : enlerTab === 'crypto' ? '· CoinGecko · 24s' : '';
              })()}
            </span>
          </div>
          <div className="mt-1">
            {enlerList.length === 0
              ? <div className="py-4 text-[12px] text-fg-3">{enlerTab === 'bes' ? 'BES günlük verisi için kaynak geçici olarak yok (önceki sağlayıcı erişimi kapattı); alternatif bağlanınca açılacak.' : 'Seans verisi henüz oluşmadı; son kapanış kopyası da yok. Seans 10:00\'da başlar.'}</div>
              : enlerList.slice(0, 7).map((r) => <MoverRow key={r.key} to={r.to} code={r.code} name={r.name} pct={r.pct} />)}
          </div>
          {enlerTab === 'stocks' && <Link to="/stocks" className="mt-1 inline-block text-[11px] text-accent hover:underline">Tüm hisseler →</Link>}

          {criticalNews.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-danger">● Kritik ({criticalNews.length})</div>
              {criticalNews.map((n) => (
                <a key={n.id ?? n.url} href={n.url} target="_blank" rel="noopener noreferrer" className="flex h-row items-center justify-between border-b border-border/60 last:border-0 text-table hover:bg-bg-card -mx-1 px-1 rounded">
                  <span className="min-w-0 truncate text-fg">
                    {n.symbols[0] && <span className="mr-2 font-mono font-semibold">{n.symbols[0]}</span>}
                    {n.criticalReason && <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-danger">{n.criticalReason}</span>}
                    {n.title}
                  </span>
                  <span className="ml-2 shrink-0 text-[11px] text-fg-3">{new Date(n.publishedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* 15 Eki 2026: Haber + takvim, Takip/Portföy üstüne alındı (kullanıcı talebi) */}
        <section className="lg:col-span-7 min-w-0">
          <div className="flex items-center"><h2 className="text-base font-semibold text-fg">Haber akışı</h2><Link to="/news" className="ml-auto text-[11px] text-accent hover:underline">Tümü →</Link></div>
          <div className="mt-2">
            {feedNews.length === 0 ? <div className="py-3 text-[12px] text-fg-3">Haberler yükleniyor…</div> : feedNews.map((n) => (
              <a
                key={n.id ?? n.url} href={n.url} target="_blank" rel="noopener noreferrer"
                className={cn(
                  'flex min-h-[var(--row-h)] items-start gap-3 border-b border-border/60 py-2 last:border-0 text-table -mx-1 px-1 rounded hover:bg-bg-card',
                  n.critical && 'border-l-2 border-l-danger bg-danger/[0.06] pl-2 hover:bg-danger/10',
                )}
              >
                <span className={cn('mt-0.5 shrink-0 font-mono text-[11px]', n.critical ? 'text-danger' : 'text-fg-3')}>{new Date(n.publishedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="min-w-0">
                  {n.critical && (
                    <span className="mr-1.5 inline-flex items-center gap-1 rounded border border-danger/40 bg-danger/15 px-1 py-px align-middle text-[9px] font-bold uppercase tracking-wider text-danger">
                      ● Kritik{n.criticalReason ? ` · ${n.criticalReason}` : ''}
                    </span>
                  )}
                  <span className={cn('line-clamp-2', n.critical ? 'font-semibold text-fg' : 'text-fg')}>{n.title}</span>
                  {n.critical && n.symbols && n.symbols.length > 0 && (
                    <span className="ml-1 font-mono text-[10px] text-fg-2">{n.symbols.slice(0, 3).join(' · ')}</span>
                  )}
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 min-w-0">
          <div className="flex items-center"><h2 className="text-base font-semibold text-fg">Ekonomik takvim</h2><Link to="/takvim" className="ml-auto text-[11px] text-accent hover:underline">Tümü →</Link></div>
          <div className="mt-2"><EconomicCalendarWidget compact maxItems={6} daysAhead={14} collapsible={false} /></div>
        </section>

        <section className="lg:col-span-6 min-w-0">
          <h2 className="text-base font-semibold text-fg">Takip Listesi <span className="text-[12px] font-normal text-fg-3">{symbols.length}</span></h2>
          <div className="mt-2">
            {symbols.length === 0 ? (
              <div className="py-3 text-[12px] text-fg-3">Takip listen boş. <Link to="/stocks" className="text-accent hover:underline">Hisselerden yıldızla</Link>.</div>
            ) : watched.length === 0 ? (
              <div className="py-3 text-[12px] text-fg-3">Fiyatlar yükleniyor…</div>
            ) : watched.map((s) => (
              <Link key={s.symbol} to={`/stock/${s.symbol}`} className="flex h-row items-center justify-between border-b border-border/60 last:border-0 hover:bg-bg-card -mx-1 px-1 rounded text-table">
                <span className="min-w-0 truncate"><span className="font-mono font-semibold text-fg">{s.symbol}</span><span className="ml-2 hidden text-[11px] text-fg-3 sm:inline">{s.name}</span></span>
                <span className="flex items-center gap-4"><span className="font-mono text-fg">{s.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><Pct v={s.changePct} /></span>
              </Link>
            ))}
            {symbols.length > 6 && <Link to="/watchlist" className="mt-1 inline-block text-[11px] text-accent hover:underline">Tümü ({symbols.length}) →</Link>}
          </div>
        </section>

        <section className="lg:col-span-6 min-w-0">
          <h2 className="text-base font-semibold text-fg">Portföy</h2>
          {user && portfolio.hasData ? (
            <>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-mono text-[28px] font-semibold leading-8 text-fg">₺{portfolio.totalValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
                <span className="text-[12px] text-fg-2">bugün <Pct v={portfolio.dailyPct} /></span>
                <span className="text-[12px] text-fg-2">toplam <Pct v={portfolio.totalPnlPct} /></span>
              </div>
              {concentration && (
                <div className="mt-2 text-[13px] text-fg">
                  Risk: {concentration.top} pozisyon portföyün %{Math.round(concentration.topShare * 100)}'i
                  {concentration.topShare >= 0.6 ? ' — yoğunlaşma yüksek' : concentration.topShare >= 0.4 ? ' — orta yoğunlaşma' : ' — dağılım dengeli'}
                  <EvidenceLink
                    title="Yoğunlaşma hesabı"
                    rows={[
                      { label: 'Pozisyon sayısı', value: String(concentration.count) },
                      { label: `İlk ${concentration.top} pozisyon payı`, value: `%${(concentration.topShare * 100).toFixed(1)}`, source: 'piyasa değeri' },
                      { label: 'HHI', value: concentration.hhi.toFixed(3) },
                      { label: 'Etkin pozisyon (1/HHI)', value: concentration.effN.toFixed(1) },
                    ]}
                  />
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Link to="/portfoy" className="btn-secondary h-8 px-3 text-xs">Detay</Link>
                <Link to="/portfoy?tab=stocks" className="btn-secondary h-8 px-3 text-xs">Risk raporu</Link>
              </div>
              <div className="mt-2 text-[11px] text-fg-3">Yatırım tavsiyesi değildir.</div>
            </>
          ) : (
            <div className="mt-2 text-[12px] text-fg-2">
              {user ? 'Henüz pozisyon yok. ' : 'Giriş yapıp pozisyon ekle; '}
              <Link to="/portfoy" className="text-accent hover:underline">değer, günlük K/Z ve risk cümlesi burada görünür</Link>.
            </div>
          )}
        </section>

      </div>
    </>
  );
}
