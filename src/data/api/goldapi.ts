import { API_KEYS } from './keys';

interface GoldApiResp {
  timestamp: number;
  metal?: string;
  currency?: string;
  price?: number;
  price_gram_24k?: number;
  price_gram_22k?: number;
  ch?: number;
  chp?: number;
  error?: string;
}

const BASE = 'https://www.goldapi.io/api';

/**
 * GoldAPI free tier'da XAU/TRY paritesi yok ama XAU/USD var.
 * USD bazında gram fiyatını alıp, USD/TRY ile çarparak TRY karşılığını üretiriz.
 */
export async function fetchGramAltinTRY(usdToTry: number | null): Promise<{ value: number; changePct?: number } | null> {
  if (!API_KEYS.goldApi) return null;
  try {
    const res = await fetch(`${BASE}/XAU/USD`, {
      headers: { 'x-access-token': API_KEYS.goldApi, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as GoldApiResp;
    if (json.error || !json.price_gram_24k) return null;
    if (!usdToTry || usdToTry <= 0) return null;
    return { value: json.price_gram_24k * usdToTry, changePct: json.chp };
  } catch {
    return null;
  }
}

/**
 * GoldAPI'den XAU/USD veya XAG/USD spot fiyatı (Ons cinsinden, USD).
 * `chp` = günlük yüzde değişim (Cuma kapanış vs Perşembe kapanış).
 */
async function fetchMetalSpotUSD(pair: 'XAU' | 'XAG' | 'XPT'): Promise<{ value: number; changePct: number } | null> {
  if (!API_KEYS.goldApi) return null;
  try {
    const res = await fetch(`${BASE}/${pair}/USD`, {
      headers: { 'x-access-token': API_KEYS.goldApi, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as GoldApiResp;
    if (json.error || !json.price || json.price <= 0) return null;
    return { value: json.price, changePct: json.chp ?? 0 };
  } catch {
    return null;
  }
}

// 6 saatlik cache — free tier 100/ay kotasını koru
const GOLDAPI_CACHE_TTL = 6 * 60 * 60 * 1000;
interface GoldApiCache {
  fetchedAt: number;
  XAU?: { value: number; changePct: number };
  XAG?: { value: number; changePct: number };
  XPT?: { value: number; changePct: number };
}
const GOLDAPI_CACHE_KEY = 'fa.goldapi.metals.v1';

function readGoldApiCache(): GoldApiCache | null {
  try {
    const raw = localStorage.getItem(GOLDAPI_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GoldApiCache;
    if (Date.now() - parsed.fetchedAt > GOLDAPI_CACHE_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeGoldApiCache(data: GoldApiCache) {
  try {
    localStorage.setItem(GOLDAPI_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/**
 * GoldAPI'den XAU + XAG + XPT spot USD fiyatlarını topluca al.
 * 6 saatlik cache ile free tier kotasını yormaz.
 */
export async function fetchSpotMetalsGoldApi(): Promise<GoldApiCache | null> {
  const cached = readGoldApiCache();
  if (cached) return cached;
  if (!API_KEYS.goldApi) return null;
  const [xau, xag, xpt] = await Promise.all([
    fetchMetalSpotUSD('XAU'),
    fetchMetalSpotUSD('XAG'),
    fetchMetalSpotUSD('XPT'),
  ]);
  if (!xau && !xag && !xpt) return null;
  const result: GoldApiCache = {
    fetchedAt: Date.now(),
    XAU: xau ?? undefined,
    XAG: xag ?? undefined,
    XPT: xpt ?? undefined,
  };
  writeGoldApiCache(result);
  return result;
}
