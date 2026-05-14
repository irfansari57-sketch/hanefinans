import { MOCK_STOCKS, MOCK_NEWS, MOCK_MACRO_FALLBACK, MOCK_SENTIMENT } from './mock';
import type { Stock, NewsItem, MacroIndicator, SentimentMention } from './types';
import { fetchQuotesTD } from './api/twelvedata';
import { fetchQuotesYahoo, fetchIndexYahoo, YAHOO_SYMBOLS, ouncePriceToGramTRY } from './api/yahoo';
import { fetchNewsGNews } from './api/gnews';
import { fetchGramAltinTRY } from './api/goldapi';
import { loadTcmbMacro } from './api/tcmb';
import { API_KEYS } from './api/keys';
import { loadMacro as loadMacroFx } from './macro';
import { useAgents } from '@/store/agents';
import { deriveSentimentFromNews } from './sentiment';

// Cache prefix versiyon ekli — versiyon değişince eski cache otomatik invalid olur
const CACHE_VERSION = 'v3';
const CACHE_PREFIX = `fa.service.${CACHE_VERSION}.`;
const STOCK_TTL_MS = 60_000;
const NEWS_TTL_MS = 5 * 60_000;
const MACRO_TTL_MS = 60_000;
const SENTIMENT_TTL_MS = 5 * 60_000;

// Build/refresh durumunda eski versiyonları ve eski mock fallback değerlerini temizle
(function purgeStaleCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('fa.service.') && !k.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(k);
      }
    }
    // Eski macro cache'i de tümüyle temizle (değer skali güncellendi)
    localStorage.removeItem('fa.macro.cache.v1');
  } catch { /* ignore */ }
})();

interface CacheEntry<T> {
  fetchedAt: number;
  payload: T;
}

function readCache<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - parsed.fetchedAt > ttl) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, payload: T) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ fetchedAt: Date.now(), payload }));
  } catch {
    /* ignore */
  }
}

function enrichStocks(live: Stock[]): Stock[] {
  return live.map((s) => {
    const m = MOCK_STOCKS.find((x) => x.symbol === s.symbol);
    return { ...s, name: m?.name ?? s.name, sector: m?.sector };
  });
}

// ---------- Stocks ----------
export async function loadStocks(symbols?: string[]): Promise<{ data: Stock[]; source: 'live' | 'mock' | 'mixed' }> {
  const want = symbols ?? MOCK_STOCKS.map((s) => s.symbol);
  const cacheKey = `stocks-${want.sort().join(',')}`;
  const cached = readCache<{ data: Stock[]; source: 'live' | 'mock' | 'mixed' }>(cacheKey, STOCK_TTL_MS);
  if (cached) return cached;

  const liveMap = new Map<string, Stock>();
  if (API_KEYS.twelveData) {
    const tdLive = await fetchQuotesTD(want);
    if (tdLive) tdLive.forEach((s) => liveMap.set(s.symbol, s));
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

// ---------- News ----------
export async function loadNews(opts: { query?: string; symbols?: string[]; max?: number } = {}): Promise<{
  data: NewsItem[];
  source: 'live' | 'mock';
}> {
  const cacheKey = `news-${opts.query ?? 'default'}-${opts.max ?? 25}`;
  const cached = readCache<{ data: NewsItem[]; source: 'live' | 'mock' }>(cacheKey, NEWS_TTL_MS);
  if (cached) return cached;

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
  return { data: MOCK_NEWS, source: 'mock' };
}

// ---------- Macro ----------
export async function loadMacroAll(): Promise<{ data: MacroIndicator[]; source: 'live' | 'mock' | 'mixed' }> {
  const cacheKey = 'macro-all';
  const cached = readCache<{ data: MacroIndicator[]; source: 'live' | 'mock' | 'mixed' }>(cacheKey, MACRO_TTL_MS);
  if (cached) return cached;

  const base = await loadMacroFx();
  const usdTry = base.find((m) => m.key === 'USD/TRY')?.value ?? null;
  const nowIso = new Date().toISOString();

  // BIST 100, BIST 30, Brent, VIX, ons emtia — Yahoo Finance dev proxy
  const [bist, bist30, brent, vix, silver, platinum, goldOz] = await Promise.all([
    fetchIndexYahoo(YAHOO_SYMBOLS.bist100),
    fetchIndexYahoo(YAHOO_SYMBOLS.bist30),
    fetchIndexYahoo(YAHOO_SYMBOLS.brent),
    fetchIndexYahoo(YAHOO_SYMBOLS.vix),
    fetchIndexYahoo(YAHOO_SYMBOLS.silver),
    fetchIndexYahoo(YAHOO_SYMBOLS.platinum),
    fetchIndexYahoo(YAHOO_SYMBOLS.gold),
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

  // Gram Gümüş (Yahoo SI=F ons → gram TL)
  if (silver && usdTry) {
    const i = base.findIndex((m) => m.key === 'Gram Gümüş');
    if (i >= 0) {
      base[i] = {
        ...base[i],
        value: ouncePriceToGramTRY(silver.value, usdTry),
        changePct: silver.changePct,
        source: 'live',
        updatedAt: nowIso,
      };
    }
    // Ons gümüş (USD)
    const oi = base.findIndex((m) => m.key === 'Ons Gümüş');
    if (oi >= 0) {
      base[oi] = { ...base[oi], value: silver.value, changePct: silver.changePct, source: 'live', updatedAt: nowIso };
    }
  }

  // Gram Platin (Yahoo PL=F ons → gram TL)
  if (platinum && usdTry) {
    const i = base.findIndex((m) => m.key === 'Gram Platin');
    if (i >= 0) {
      base[i] = {
        ...base[i],
        value: ouncePriceToGramTRY(platinum.value, usdTry),
        changePct: platinum.changePct,
        source: 'live',
        updatedAt: nowIso,
      };
    }
    // Ons platin (USD)
    const oi = base.findIndex((m) => m.key === 'Ons Platin');
    if (oi >= 0) {
      base[oi] = { ...base[oi], value: platinum.value, changePct: platinum.changePct, source: 'live', updatedAt: nowIso };
    }
  }

  // Gram Altın — birincil: GoldAPI (varsa), yedek: Yahoo GC=F
  let goldFilled = false;
  if (API_KEYS.goldApi) {
    const gold = await fetchGramAltinTRY(usdTry);
    if (gold) {
      const i = base.findIndex((m) => m.key === 'Gram Altın');
      if (i >= 0) {
        base[i] = { ...base[i], value: gold.value, changePct: gold.changePct, source: 'live', updatedAt: nowIso };
        goldFilled = true;
      }
    }
  }
  if (!goldFilled && goldOz && usdTry) {
    const i = base.findIndex((m) => m.key === 'Gram Altın');
    if (i >= 0) {
      base[i] = {
        ...base[i],
        value: ouncePriceToGramTRY(goldOz.value, usdTry),
        changePct: goldOz.changePct,
        source: 'live',
        updatedAt: nowIso,
      };
    }
  }
  // Ons altın (USD)
  if (goldOz) {
    const oi = base.findIndex((m) => m.key === 'Ons Altın');
    if (oi >= 0) {
      base[oi] = { ...base[oi], value: goldOz.value, changePct: goldOz.changePct, source: 'live', updatedAt: nowIso };
    }
  }

  // Politika Faizi — kullanıcı manuel override edebilir (LocalStorage)
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

  // TCMB (Politika faizi, TÜFE) — Vite proxy
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

// ---------- Sentiment ----------
// Reddit yerine: var olan haber akışından türetilir
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
  } catch {
    /* ignore */
  }
}
