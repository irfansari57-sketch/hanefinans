// TEFAS verisi — GitHub Actions tarafından üretilen JSON'dan okunur.
// URL .env.local'a VITE_TEFAS_GITHUB_URL olarak yazılır.
// Örnek: https://cdn.jsdelivr.net/gh/kullanici/repo@main/data/funds.json

import type { FundPerformance, FundCategory } from '../types';

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const FEED_URL = (env.VITE_TEFAS_GITHUB_URL ?? '').trim();

export interface TefasFundData {
  code: string;
  name: string;
  category: string;
  nav: number;
  date: string;
  marketCap?: number;
  investorCount?: number;
  shareCount?: number;
  returns: {
    '1w': number | null;
    '1m': number | null;
    '3m': number | null;
    '6m': number | null;
    ytd: number | null;
    '1y': number | null;
  };
  history: Array<{ date: string; price: number }>;
}

export interface TefasFeed {
  updatedAt: string;
  count: number;
  funds: TefasFundData[];
  failed?: string[];
}

export const isTefasGithubConfigured = () => !!FEED_URL;

let cache: { fetchedAt: number; data: TefasFeed } | null = null;
const CACHE_TTL_MS = 5 * 60_000;

export async function fetchTefasFeed(): Promise<TefasFeed | null> {
  if (!FEED_URL) return null;
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  try {
    const r = await fetch(FEED_URL, { cache: 'no-store' });
    if (!r.ok) return null;
    const data = (await r.json()) as TefasFeed;
    cache = { fetchedAt: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

export async function fetchTefasFundByCode(code: string): Promise<TefasFundData | null> {
  const feed = await fetchTefasFeed();
  if (!feed) return null;
  return feed.funds.find((f) => f.code === code.toUpperCase()) ?? null;
}

/** Feed verisini FundPerformance şemasına maple (FundsPage / Panel / Recs ortak kullanır). */
export function mapTefasToPerformance(funds: TefasFundData[]): FundPerformance[] {
  return funds.map((f) => ({
    code: f.code,
    name: f.name,
    category: (f.category || 'Serbest') as FundCategory,
    tefas: true,
    day: 0, // gün değişimi feed'de yok; history'den hesaplanabilir
    week: f.returns['1w'] ?? 0,
    month: f.returns['1m'] ?? 0,
    threeMonth: f.returns['3m'] ?? 0,
    sixMonth: f.returns['6m'] ?? 0,
    ytd: f.returns.ytd ?? 0,
    year: f.returns['1y'] ?? 0,
  }));
}

/** Tüm fonları FundPerformance dizisi olarak döner. Feed yapılandırılmadıysa null. */
export async function loadFundsAsPerformance(): Promise<{
  funds: FundPerformance[];
  updatedAt: string;
} | null> {
  const feed = await fetchTefasFeed();
  if (!feed) return null;
  return { funds: mapTefasToPerformance(feed.funds), updatedAt: feed.updatedAt };
}
