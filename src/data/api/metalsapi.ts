import { API_KEYS } from './keys';

/**
 * MetalsAPI.com entegrasyonu — free 50 req/day spot metal fiyatları.
 *
 * Endpoint format: https://metals-api.com/api/latest?access_key=XXX&base=USD&symbols=XAU,XAG,XPT
 * Response: { rates: { XAU: 0.000231..., USDXAU: 4328.50, USDXAG: 67.84, ... } }
 *
 * USDXAU = bir ons altının USD fiyatı (Cuma kapanış değeri).
 *
 * 6 saatlik localStorage cache ile kotayı koru (4 req/gün × 30 = 120/ay ama free 50/gün).
 */

interface MetalsApiResp {
  success?: boolean;
  rates?: Record<string, number>;
  date?: string;
  timestamp?: number;
  error?: { code: number; info: string };
}

const BASE = 'https://metals-api.com/api/latest';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_KEY = 'fa.metalsapi.spot.v1';

export interface MetalsApiSpot {
  fetchedAt: number;
  date?: string;
  XAU?: number;
  XAG?: number;
  XPT?: number;
  XPD?: number;
}

function readCache(): MetalsApiSpot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MetalsApiSpot;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(data: MetalsApiSpot) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

/**
 * MetalsAPI'den XAU + XAG + XPT spot USD fiyatlarını topluca al.
 * Free tier 50 req/gün — 6 saatlik cache yeterli.
 */
export async function fetchSpotMetalsMetalsApi(): Promise<MetalsApiSpot | null> {
  const cached = readCache();
  if (cached) return cached;
  if (!API_KEYS.metalsApi) return null;
  try {
    const url = `${BASE}?access_key=${encodeURIComponent(API_KEYS.metalsApi)}&base=USD&symbols=XAU,XAG,XPT,XPD`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as MetalsApiResp;
    if (!json.success || !json.rates || json.error) return null;
    const xau = json.rates.USDXAU;
    const xag = json.rates.USDXAG;
    const xpt = json.rates.USDXPT;
    const xpd = json.rates.USDXPD;
    if (!Number.isFinite(xau) && !Number.isFinite(xag) && !Number.isFinite(xpt) && !Number.isFinite(xpd)) return null;
    const result: MetalsApiSpot = {
      fetchedAt: Date.now(),
      date: json.date,
      XAU: Number.isFinite(xau) ? xau : undefined,
      XAG: Number.isFinite(xag) ? xag : undefined,
      XPT: Number.isFinite(xpt) ? xpt : undefined,
      XPD: Number.isFinite(xpd) ? xpd : undefined,
    };
    writeCache(result);
    return result;
  } catch {
    return null;
  }
}
