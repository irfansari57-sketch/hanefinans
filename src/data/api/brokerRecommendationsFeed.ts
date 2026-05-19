/**
 * Aracı kurum hisse önerileri — günlük scrape JSON'undan okur (jsdelivr CDN).
 *
 * GH Actions her sabah 09:45 TR + 16:30 TR'de Osmanlı + KT bültenlerini
 * Claude Haiku ile parse edip data/broker-recommendations.json'a yazar.
 * Frontend bunu CDN'den fetch eder, 1 saatlik client cache.
 */

import type { BrokerRecommendationSet } from '@/data/brokerRecommendations';

const FEED_URL = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/broker-recommendations.json';
// v2 — İş Yatırım dinamik scrape sonrası eski v1 cache (statik demo veri)
// invalidate. TTL 30 dk → günlük 2 cron + 12sa CDN ile uyumlu.
const CACHE_KEY = 'fa.brokerRecs.feed.v2';
const LEGACY_KEYS = ['fa.brokerRecs.feed.v1'];
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 dk

// Modül yüklendiğinde eski cache key'lerini temizle
try {
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
} catch {
  /* ignore */
}

export interface BrokerRecFeed {
  fetchedAt: string;
  model?: string;
  brokers: Array<{
    brokerId: string;
    brokerName: string;
    initials: string;
    colorSeed: string;
    sourceUrl: string;
    lastUpdate: string;
    recommendations: Array<{
      symbol: string;
      rating: string;
      targetPrice: number | null;
      stopLoss: number | null;
      thesis: string;
      updatedAt: string;
    }>;
    portfolio?: Array<{
      symbol: string;
      weight: number;
    }>;
    ok?: boolean;
    error?: string;
  }>;
  summary?: {
    total_brokers: number;
    successful: number;
    total_recommendations: number;
  };
  note?: string;
}

function readCache(): BrokerRecFeed | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt: number; data: BrokerRecFeed };
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data: BrokerRecFeed): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data }));
  } catch {
    /* quota ignore */
  }
}

let inflight: Promise<BrokerRecFeed | null> | null = null;

export async function fetchBrokerRecsFeed(): Promise<BrokerRecFeed | null> {
  const cached = readCache();
  if (cached) return cached;

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const bust = `?_=${Date.now()}`;
      const r = await fetch(FEED_URL + bust, { cache: 'no-store' });
      if (!r.ok) {
        console.warn('[brokerRecs] feed fetch failed', r.status);
        return null;
      }
      const data = (await r.json()) as BrokerRecFeed;
      if (!data.brokers) {
        console.warn('[brokerRecs] feed format invalid', data);
        return null;
      }
      const dynamicBrokers = data.brokers.filter((b) => b.recommendations?.length > 0).length;
      console.info(`[brokerRecs] feed loaded: ${data.brokers.length} broker, ${dynamicBrokers} dolu, fetchedAt: ${data.fetchedAt}`);
      writeCache(data);
      return data;
    } catch (e) {
      console.error('[brokerRecs] feed error', e);
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Dynamic önerileri static fallback ile birleştir.
 * - Dynamic'ten gelen broker bulunursa onu kullan (en güncel)
 * - Yoksa static fallback'e düş
 */
export function mergeWithStatic(
  staticData: BrokerRecommendationSet[],
  dynamicFeed: BrokerRecFeed | null,
): BrokerRecommendationSet[] {
  if (!dynamicFeed?.brokers) {
    console.warn('[brokerRecs] no dynamic feed, fallback to static');
    return staticData;
  }
  const dynamicMap = new Map(dynamicFeed.brokers.map((b) => [b.brokerId, b]));
  const result = staticData.map((s) => {
    const dyn = dynamicMap.get(s.brokerId);
    if (!dyn || !dyn.recommendations || dyn.recommendations.length === 0) {
      return { ...s, _dynamic: false };
    }
    console.info(`[brokerRecs] ${s.brokerId} dynamic data applied: ${dyn.recommendations.length} öneri`);
    return {
      ...s,
      lastUpdate: dyn.lastUpdate,
      recommendations: dyn.recommendations as BrokerRecommendationSet['recommendations'],
      note: dyn.error ? `Otomatik scrape hatası: ${dyn.error}` : 'Otomatik (broker resmi sayfasından scrape)',
      _dynamic: true,
    } as BrokerRecommendationSet & { _dynamic: boolean };
  });
  return result;
}
