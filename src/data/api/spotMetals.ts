/**
 * Pages Function /api/spot-metals proxy — Stooq primary + Yahoo fallback.
 * Backend D1'de 5dk cache'lendiği için panel auto-refresh kotaya çarpmaz.
 * Backend bundle 12 saatten eski ise stale say (Stooq hafta sonu freeze koruması).
 */

interface SpotMetalQuote {
  value: number;
  changePct: number;
  updatedAt: string;
  source: 'stooq' | 'yahoo' | 'd1-cache';
}

interface SpotMetalsResponse {
  ok: boolean;
  /** Bundle'ın backend'de freshly fetched edildiği zaman (Unix ms) */
  bundleUpdatedAt?: number;
  XAU?: SpotMetalQuote;
  XAG?: SpotMetalQuote;
  XPT?: SpotMetalQuote;
}

let cached: { fetchedAt: number; data: SpotMetalsResponse } | null = null;
const FRONTEND_TTL_MS = 30_000;
/** Backend bundle bu kadar saatten eski ise stale say */
const STALE_HOURS = 12;

export async function fetchSpotMetals(): Promise<SpotMetalsResponse | null> {
  if (cached && Date.now() - cached.fetchedAt < FRONTEND_TTL_MS) {
    return cached.data;
  }
  try {
    const r = await fetch('/api/spot-metals');
    if (!r.ok) return null;
    const json = (await r.json()) as SpotMetalsResponse;
    if (!json.ok) return null;
    // Backend bundle çok eskiyse → null dön (caller fallback'e gitsin)
    if (typeof json.bundleUpdatedAt === 'number' && Number.isFinite(json.bundleUpdatedAt)) {
      const ageHours = (Date.now() - json.bundleUpdatedAt) / (60 * 60 * 1000);
      if (ageHours > STALE_HOURS) return null;
    }
    cached = { fetchedAt: Date.now(), data: json };
    return json;
  } catch {
    return null;
  }
}
