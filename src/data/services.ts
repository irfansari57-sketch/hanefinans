import { MOCK_STOCKS, MOCK_NEWS, MOCK_MACRO_FALLBACK, MOCK_SENTIMENT } from './mock';
import type { Stock, NewsItem, MacroIndicator, SentimentMention } from './types';
import { fetchQuotesTD, fetchMetalSpotTD } from './api/twelvedata';
import { fetchQuotesYahoo, fetchIndexYahoo, YAHOO_SYMBOLS, ouncePriceToGramTRY } from './api/yahoo';
import { fetchNewsGNews } from './api/gnews';
import { fetchGramAltinTRY } from './api/goldapi';
import { loadTcmbMacro } from './api/tcmb';
import { API_KEYS } from './api/keys';
import { loadMacro as loadMacroFx } from './macro';
import { useAgents } from '@/store/agents';
import { deriveSentimentFromNews } from './sentiment';

const CACHE_VERSION = 'v7';
const CACHE_PREFIX = `fa.service.${CACHE_VERSION}.`;
const STOCK_TTL_MS = 30_000;
const NEWS_TTL_MS = 90_000;
const MACRO_TTL_MS = 30_000;
const SENTIMENT_TTL_MS = 5 * 60_000;

(function purgeStaleCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('fa.service.') && !k.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(k);
      }
    }
    localStorage.removeItem('fa.macro.cache.v1');
  } catch { /* ignore */ }
})();

interface CacheEntry<T> { fetchedAt: number; payload: T; }

function readCache<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - parsed.fetchedAt > ttl) return null;
    return parsed.payload;
  } catch { return null; }
}

function writeCache<T>(key: string, payload: T) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ fetchedAt: Date.now(), payload }));
  } catch { /* ignore */ }
}

function enrichStocks(live: Stock[]): Stock[] {
  return live.map((s) => {
    const m = MOCK_STOCKS.find((x) => x.symbol === s.symbol);
    return { ...s, name: m?.name ?? s.name, sector: m?.sector };
  });
}

// Spot metals — inline fetch (no module indirection)
interface SpotMetalQuote { value: number; changePct: number; updatedAt?: string; source?: string }
interface SpotMetalsApi {
  ok: boolean;
  bundleUpdatedAt?: number;
  XAU?: SpotMetalQuote;
  XAG?: SpotMetalQuote;
  XPT?: SpotMetalQuote;
}

/** Per-metal updatedAt bu kadar saatten eski ise o metali kullanma → fallback chain'e geç */
const SPOT_METALS_STALE_HOURS = 12;

function metalAgeHours(updatedAt?: string): number {
  if (!updatedAt) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return (Date.now() - ts) / (60 * 60 * 1000);
}

async function fetchSpotMetalsInline(): Promise<SpotMetalsApi | null> {
  try {
    const r = await fetch('/api/spot-metals');
    if (!r.ok) return null;
    const j = (await r.json()) as SpotMetalsApi;
    if (!j.ok) return null;
    // Per-metal stale check: Stooq hafta sonu eski timestamp ile veri döndürebiliyor.
    // Her metalın updatedAt'i 12h+ eskiyse o metali kaldır → loadMacroAll fetchMetal() chain
    // Yahoo direct'e (XAUUSD=X) geçer.
    if (j.XAU && metalAgeHours(j.XAU.updatedAt) > SPOT_METALS_STALE_HOURS) delete j.XAU;
    if (j.XAG && metalAgeHours(j.XAG.updatedAt) > SPOT_METALS_STALE_HOURS) delete j.XAG;
    if (j.XPT && metalAgeHours(j.XPT.updatedAt) > SPOT_METALS_STALE_HOURS) delete j.XPT;
    if (!j.XAU && !j.XAG && !j.XPT) return null;
    return j;
  } catch {
    return null;
  }
}

// Snapshot endpoint cache — modul-level, tum sayfa boyunca paylasilir
interface SnapshotApi {
  ok: boolean;
  count: number;
  updatedAt: number;
  quotes: Record<string, { price: number; changePct: number; prev: number; updatedAt: number; name?: string }>;
}
let snapshotMemo: { fetchedAt: number; data: SnapshotApi } | null = null;
const SNAPSHOT_TTL_MS = 60_000;

async function fetchSnapshot(): Promise<SnapshotApi | null> {
  if (snapshotMemo && Date.now() - snapshotMemo.fetchedAt < SNAPSHOT_TTL_MS) {
    return snapshotMemo.data;
  }
  try {
    const r = await fetch('/api/yahoo/snapshot');
    if (!r.ok) return null;
    const j = (await r.json()) as SnapshotApi;
    if (!j.ok) return null;
    snapshotMemo = { fetchedAt: Date.now(), data: j };
    return j;
  } catch {
    return null;
  }
}

export async function loadStocks(symbols?: string[]): Promise<{ data: Stock[]; source: 'live' | 'mock' | 'mixed' }> {
  const want = symbols ?? MOCK_STOCKS.map((s) => s.symbol);
  const cacheKey = `stocks-${want.sort().join(',')}`;
  const cached = readCache<{ data: Stock[]; source: 'live' | 'mock' | 'mixed' }>(cacheKey, STOCK_TTL_MS);
  if (cached) return cached;

  const liveMap = new Map<string, Stock>();

  // 1. Snapshot endpoint — tek HTTP isteyle D1 cache'den toplu quote
  const snap = await fetchSnapshot();
  if (snap) {
    for (const sym of want) {
      const ySym = sym.includes('.') || sym.includes('=') || sym.includes('-') ? sym : `${sym}.IS`;
      const q = snap.quotes[ySym];
      // STALE FILTER: changePct === 0 && price > 0 -> Yahoo fetchOne fallback'e yonlendir
      if (q && !(q.changePct === 0 && q.price > 0)) {
        liveMap.set(sym, {
          symbol: sym,
          name: q.name ?? sym,
          price: q.price,
          changePct: q.changePct,
          updatedAt: new Date(q.updatedAt).toISOString(),
        });
      }
    }
  }

  // 2. Snapshot'tan gelmeyenler icin TD/Yahoo fallback
  if (API_KEYS.twelveData) {
    const tdMissing = want.filter((s) => !liveMap.has(s));
    if (tdMissing.length > 0) {
      const tdLive = await fetchQuotesTD(tdMissing);
      if (tdLive) tdLive.forEach((s) => liveMap.set(s.symbol, s));
    }
  }
  const missing = want.filter((s) => !liveMap.has(s));
  if (missing.length > 0) {
    const yLive = await fetchQuotesYahoo(missing);
    if (yLive) yLive.forEach((s) => liveMap.set(s.symbol, s));
  }

  const merged: Stock[] = want.map((sym) => {
    const live = liveMap.get(sym);
    if (live) return live;
    return MOCK_STOCKS.find((x) => x.symbol === sym) ?? {
      symbol: sym, name: sym, price: 0, changePct: 0, updatedAt: new Date().toISOString(),
    };
  });
  const enriched = enrichStocks(merged);

  const liveCount = liveMap.size;
  const source: 'live' | 'mock' | 'mixed' =
    liveCount === want.length ? 'live' : liveCount === 0 ? 'mock' : 'mixed';
  useAgents.getState().setState('indicator', liveCount > 0 ? 'live' : 'mock');

  const result = { data: enriched, source };
  writeCache(cacheKey, result);
  return result;
}

export async function loadNews(opts: { query?: string; symbols?: string[]; max?: number } = {}): Promise<{
  data: NewsItem[];
  source: 'live' | 'mock';
}> {
  const cacheKey = `news-${opts.query ?? 'default'}-${opts.max ?? 25}`;
  const cached = readCache<{ data: NewsItem[]; source: 'live' | 'mock' }>(cacheKey, NEWS_TTL_MS);
  if (cached) return cached;

  try {
    const params = new URLSearchParams();
    params.set('max', String(opts.max ?? 30));
    if (opts.query) params.set('q', opts.query);
    const r = await fetch(`/api/news?${params.toString()}`);
    if (r.ok) {
      const json = (await r.json()) as { ok: boolean; data: NewsItem[] };
      if (json.ok && json.data.length > 0) {
        useAgents.getState().setState('news', 'live');
        const result = { data: json.data, source: 'live' as const };
        writeCache(cacheKey, result);
        return result;
      }
    }
  } catch { /* devam */ }

  if (API_KEYS.gnews) {
    const knownSymbols = opts.symbols ?? MOCK_STOCKS.map((s) => s.symbol);
    const live = await fetchNewsGNews({ query: opts.query, symbols: knownSymbols, max: opts.max });
    if (live && live.length > 0) {
      useAgents.getState().setState('news', 'live');
      const result = { data: live, source: 'live' as const };
      writeCache(cacheKey, result);
      return result;
    }
  }
  useAgents.getState().setState('news', 'mock');
  return { data: [], source: 'mock' };
}

export async function loadMacroAll(): Promise<{ data: MacroIndicator[]; source: 'live' | 'mock' | 'mixed' }> {
  const cacheKey = 'macro-all';
  const cached = readCache<{ data: MacroIndicator[]; source: 'live' | 'mock' | 'mixed' }>(cacheKey, MACRO_TTL_MS);
  if (cached) return cached;

  const base = await loadMacroFx();
  const usdTry = base.find((m) => m.key === 'USD/TRY')?.value ?? null;
  const nowIso = new Date().toISOString();

  // Kıymetli maden — backend Stooq spot birincil, TD spot yedek, Yahoo spot yedek, futures son.
  const spotMetals = await fetchSpotMetalsInline();
  // Debug: console.log helps verify deploy includes this code
  if (typeof window !== 'undefined') {
    try { (window as { __spotMetalsDebug?: SpotMetalsApi | null }).__spotMetalsDebug = spotMetals; } catch { /* ignore */ }
  }

  const fetchMetal = async (
    kind: 'XAU' | 'XAG' | 'XPT',
    tdPair: 'XAU/USD' | 'XAG/USD' | 'XPT/USD',
    spotSym: string,
    futSym: string,
  ): Promise<{ value: number; changePct: number } | null> => {
    const s = spotMetals?.[kind];
    if (s && Number.isFinite(s.value) && s.value > 0) {
      return { value: s.value, changePct: s.changePct };
    }
    const td = await fetchMetalSpotTD(tdPair);
    if (td && Number.isFinite(td.value) && td.value > 0) return td;
    // Spot Yahoo (XAUUSD=X) yedeği kaldırıldı — Yahoo Finance bu sembolü destekemiyor (404).
    // Direkt futures'a düş: GC=F altın, SI=F gümüş, PL=F platin (Comex sözleşmeleri).
    // Spot ile ~$1-5 fark olabilir ama Cuma kapanış değeri kesin var.
    return fetchIndexYahoo(futSym);
  };

  const [bist, bist30, brent, vix, silver, platinum, goldOz, btc, eth, xrp, doge] = await Promise.all([
    fetchIndexYahoo(YAHOO_SYMBOLS.bist100),
    fetchIndexYahoo(YAHOO_SYMBOLS.bist30),
    fetchIndexYahoo(YAHOO_SYMBOLS.brent),
    fetchIndexYahoo(YAHOO_SYMBOLS.vix),
    fetchMetal('XAG', 'XAG/USD', YAHOO_SYMBOLS.silver, 'SI=F'),
    fetchMetal('XPT', 'XPT/USD', YAHOO_SYMBOLS.platinum, 'PL=F'),
    fetchMetal('XAU', 'XAU/USD', YAHOO_SYMBOLS.gold, 'GC=F'),
    fetchIndexYahoo('BTC-USD'),
    fetchIndexYahoo('ETH-USD'),
    fetchIndexYahoo('XRP-USD'),
    fetchIndexYahoo('DOGE-USD'),
  ]);

  if (bist) {
    const i = base.findIndex((m) => m.key === 'BIST 100');
    if (i >= 0) base[i] = { ...base[i], value: bist.value, changePct: bist.changePct, source: 'live', updatedAt: nowIso };
  }
  if (bist30) {
    const i = base.findIndex((m) => m.key === 'BIST 30');
    if (i >= 0) base[i] = { ...base[i], value: bist30.value, changePct: bist30.changePct, source: 'live', updatedAt: nowIso };
  }
  if (brent) {
    const i = base.findIndex((m) => m.key === 'Brent');
    if (i >= 0) base[i] = { ...base[i], value: brent.value, changePct: brent.changePct, source: 'live', updatedAt: nowIso };
  }
  if (vix) {
    const i = base.findIndex((m) => m.key === 'VIX');
    if (i >= 0) base[i] = { ...base[i], value: vix.value, changePct: vix.changePct, source: 'live', updatedAt: nowIso };
  }

  if (silver && usdTry) {
    const i = base.findIndex((m) => m.key === 'Gram Gümüş');
    if (i >= 0) {
      base[i] = { ...base[i], value: ouncePriceToGramTRY(silver.value, usdTry), changePct: silver.changePct, source: 'live', updatedAt: nowIso };
    }
    const oi = base.findIndex((m) => m.key === 'Ons Gümüş');
    if (oi >= 0) {
      base[oi] = { ...base[oi], value: silver.value, changePct: silver.changePct, source: 'live', updatedAt: nowIso };
    }
  }

  if (platinum && usdTry) {
    const i = base.findIndex((m) => m.key === 'Gram Platin');
    if (i >= 0) {
      base[i] = { ...base[i], value: ouncePriceToGramTRY(platinum.value, usdTry), changePct: platinum.changePct, source: 'live', updatedAt: nowIso };
    }
    const oi = base.findIndex((m) => m.key === 'Ons Platin');
    if (oi >= 0) {
      base[oi] = { ...base[oi], value: platinum.value, changePct: platinum.changePct, source: 'live', updatedAt: nowIso };
    }
  }

  let goldFilled = false;
  if (goldOz && usdTry) {
    const i = base.findIndex((m) => m.key === 'Gram Altın');
    if (i >= 0) {
      base[i] = { ...base[i], value: ouncePriceToGramTRY(goldOz.value, usdTry), changePct: goldOz.changePct, source: 'live', updatedAt: nowIso };
      goldFilled = true;
    }
  }
  if (!goldFilled && API_KEYS.goldApi) {
    const gold = await fetchGramAltinTRY(usdTry);
    if (gold) {
      const i = base.findIndex((m) => m.key === 'Gram Altın');
      if (i >= 0) {
        base[i] = { ...base[i], value: gold.value, changePct: gold.changePct, source: 'live', updatedAt: nowIso };
      }
    }
  }
  if (goldOz) {
    const oi = base.findIndex((m) => m.key === 'Ons Altın');
    if (oi >= 0) {
      base[oi] = { ...base[oi], value: goldOz.value, changePct: goldOz.changePct, source: 'live', updatedAt: nowIso };
    }
  }

  // Kripto
  const cryptoMap: Array<[string, { value: number; changePct: number } | null]> = [
    ['BTC/USD', btc],
    ['ETH/USD', eth],
    ['XRP/USD', xrp],
    ['DOGE/USD', doge],
  ];
  for (const [key, data] of cryptoMap) {
    if (data) {
      const i = base.findIndex((m) => m.key === key);
      if (i >= 0) {
        base[i] = { ...base[i], value: data.value, changePct: data.changePct, source: 'live', updatedAt: nowIso };
      }
    }
  }

  try {
    const manual = localStorage.getItem('fa.macro.policyRate');
    if (manual) {
      const v = parseFloat(manual);
      if (Number.isFinite(v) && v > 0) {
        const i = base.findIndex((m) => m.key === 'Politika Faizi');
        if (i >= 0) base[i] = { ...base[i], value: v, source: 'live', subLabel: 'Manuel', updatedAt: nowIso };
      }
    }
  } catch { /* ignore */ }

  try {
    const tcmb = await loadTcmbMacro();
    for (const series of tcmb) {
      const i = base.findIndex((m) => m.label === series.label);
      if (i >= 0) base[i] = { ...series, key: base[i].key };
      else base.push(series);
    }
  } catch { /* tolerate */ }

  const liveCount = base.filter((m) => m.source === 'live').length;
  const source: 'live' | 'mock' | 'mixed' = liveCount === base.length ? 'live' : liveCount === 0 ? 'mock' : 'mixed';
  useAgents.getState().setState('macro', liveCount > 0 ? 'live' : 'mock');
  const result = { data: base, source };
  writeCache(cacheKey, result);
  return result;
}

export async function loadSentiment(): Promise<{ data: SentimentMention[]; source: 'derived' | 'mock' }> {
  const cacheKey = 'sentiment-derived';
  const cached = readCache<{ data: SentimentMention[]; source: 'derived' | 'mock' }>(cacheKey, SENTIMENT_TTL_MS);
  if (cached) return cached;

  const news = await loadNews({ max: 25 });
  if (news.source === 'live' && news.data.length > 0) {
    const derived = deriveSentimentFromNews(news.data);
    if (derived.length > 0) {
      useAgents.getState().setState('sentiment', 'live');
      const result = { data: derived, source: 'derived' as const };
      writeCache(cacheKey, result);
      return result;
    }
  }
  useAgents.getState().setState('sentiment', 'mock');
  return { data: MOCK_SENTIMENT, source: 'mock' };
}

export function clearServiceCaches() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    }
    localStorage.removeItem('fa.macro.cache.v1');
    snapshotMemo = null;
  } catch { /* ignore */ }
}
