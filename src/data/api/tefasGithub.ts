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
    '1d'?: number | null;
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
export const getTefasFeedUrl = () => FEED_URL;

export interface TefasFeedFetchResult {
  ok: boolean;
  feed?: TefasFeed;
  /** Hata tanılaması için detay — UI'da debug paneline gösterilir */
  error?: string;
  status?: number;
  url?: string;
  preview?: string;
}

let cache: { fetchedAt: number; data: TefasFeed } | null = null;
let lastError: TefasFeedFetchResult | null = null;
const CACHE_TTL_MS = 5 * 60_000;

export function getLastFeedError(): TefasFeedFetchResult | null {
  return lastError;
}

export async function fetchTefasFeed(): Promise<TefasFeed | null> {
  const r = await fetchTefasFeedDetailed();
  return r.ok ? r.feed ?? null : null;
}

export async function fetchTefasFeedDetailed(): Promise<TefasFeedFetchResult> {
  if (!FEED_URL) {
    return { ok: false, error: 'VITE_TEFAS_GITHUB_URL ayarlanmamış' };
  }
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, feed: cache.data, url: FEED_URL };
  }
  try {
    const r = await fetch(FEED_URL, { cache: 'no-store' });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      const result: TefasFeedFetchResult = {
        ok: false,
        status: r.status,
        url: FEED_URL,
        error: `HTTP ${r.status} ${r.statusText}`,
        preview: text.slice(0, 200),
      };
      lastError = result;
      return result;
    }
    const text = await r.text();
    let data: TefasFeed;
    try {
      data = JSON.parse(text) as TefasFeed;
    } catch (parseErr) {
      const result: TefasFeedFetchResult = {
        ok: false,
        status: r.status,
        url: FEED_URL,
        error: `JSON parse hatası: ${(parseErr as Error).message}`,
        preview: text.slice(0, 200),
      };
      lastError = result;
      return result;
    }
    if (!data.funds || !Array.isArray(data.funds) || data.funds.length === 0) {
      const result: TefasFeedFetchResult = {
        ok: false,
        status: r.status,
        url: FEED_URL,
        error: `Feed çağrısı başarılı ama 'funds' alanı boş/yok (count: ${data.count ?? 0})`,
        preview: text.slice(0, 200),
      };
      lastError = result;
      return result;
    }
    cache = { fetchedAt: Date.now(), data };
    lastError = null;
    return { ok: true, feed: data, url: FEED_URL };
  } catch (err) {
    const result: TefasFeedFetchResult = {
      ok: false,
      url: FEED_URL,
      error: `Ağ hatası: ${(err as Error).message}`,
    };
    lastError = result;
    return result;
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
    day: f.returns['1d'] ?? 0,
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

/** Detaylı sonuç + perf map'i — FundsPage debug panel için. */
export async function loadFundsAsPerformanceDetailed(): Promise<TefasFeedFetchResult & {
  funds?: FundPerformance[];
}> {
  const result = await fetchTefasFeedDetailed();
  if (!result.ok || !result.feed) return result;
  return { ...result, funds: mapTefasToPerformance(result.feed.funds) };
}
