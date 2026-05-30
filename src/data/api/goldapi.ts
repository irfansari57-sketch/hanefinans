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
