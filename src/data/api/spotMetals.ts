/**
 * Pages Function /api/spot-metals proxy — Stooq spot fiyatları (XAU/XAG/XPT).
 * Backend D1'de 5dk cache'lendiği için panel auto-refresh kotaya çarpmaz.
 */

interface SpotMetalQuote {
  value: number;
  changePct: number;
  updatedAt: string;
  source: 'stooq' | 'd1-cache';
}

interface SpotMetalsResponse {
  ok: boolean;
  XAU?: SpotMetalQuote;
  XAG?: SpotMetalQuote;
  XPT?: SpotMetalQuote;
}

let cached: { fetchedAt: number; data: SpotMetalsResponse } | null = null;
const FRONTEND_TTL_MS = 30_000;

export async function fetchSpotMetals(): Promise<SpotMetalsResponse | null> {
  if (cached && Date.now() - cached.fetchedAt < FRONTEND_TTL_MS) {
    return cached.data;
  }
  try {
    const r = await fetch('/api/spot-metals');
    if (!r.ok) return null;
    const json = (await r.json()) as SpotMetalsResponse;
    if (!json.ok) return null;
    cached = { fetchedAt: Date.now(), data: json };
    return json;
  } catch {
    return null;
  }
}
