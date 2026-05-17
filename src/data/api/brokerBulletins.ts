/**
 * Aracı kurum bültenleri — GitHub Actions tarafından üretilen JSON'dan okunur.
 *
 * GH Actions her sabah 09:30 TR'de Osmanlı Menkul'ün PDF bültenini indirir,
 * metin çıkarıp data/broker-bulletins.json'a yazar. jsdelivr CDN üzerinden
 * frontend bunu fetch eder ([skip ci] commit Pages'i tetiklemez, CDN ise
 * yeni dosyayı 12h içinde yansıtır).
 */

export interface BrokerBulletin {
  id: string;
  name: string;
  pdfUrl?: string;
  sourceUrl: string;
  title?: string;
  date?: string;
  excerpt?: string;
  fullLength?: number;
  ok: boolean;
  error?: string;
}

export interface BrokerBulletinFeed {
  fetchedAt: string;
  bulletins: Record<string, BrokerBulletin>;
}

const FEED_URL = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/broker-bulletins.json';
const CACHE_KEY = 'fa.brokerBulletins.feed';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat client cache

interface CachedFeed {
  fetchedAt: number;
  data: BrokerBulletinFeed;
}

function readCache(): BrokerBulletinFeed | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFeed;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data: BrokerBulletinFeed): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data }));
  } catch {
    /* quota ignore */
  }
}

let inflight: Promise<BrokerBulletinFeed | null> | null = null;

export async function fetchBrokerBulletins(): Promise<BrokerBulletinFeed | null> {
  const cached = readCache();
  if (cached) return cached;

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const r = await fetch(FEED_URL, { cache: 'no-store' });
      if (!r.ok) return null;
      const data = (await r.json()) as BrokerBulletinFeed;
      if (!data.bulletins) return null;
      writeCache(data);
      return data;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
