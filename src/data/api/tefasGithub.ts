// TEFAS verisi — GitHub Actions tarafından üretilen JSON'dan okunur.
// URL .env.local'a VITE_TEFAS_GITHUB_URL olarak yazılır.
// Örnek: https://cdn.jsdelivr.net/gh/kullanici/repo@main/data/funds.json

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
