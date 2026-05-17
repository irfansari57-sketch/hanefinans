/**
 * Aracı kurum bültenleri — GitHub Actions tarafından üretilen JSON'dan okunur.
 *
 * GH Actions her sabah 09:30 TR'de Osmanlı Menkul'ün PDF bültenini indirir,
 * metin çıkarıp data/broker-bulletins.json'a yazar. jsdelivr CDN üzerinden
 * frontend bunu fetch eder ([skip ci] commit Pages'i tetiklemez, CDN ise
 * yeni dosyayı 12h içinde yansıtır).
 */

export interface BulletinSection {
  title: string;
  content: string;
}

export interface BrokerBulletin {
  id: string;
  name: string;
  pdfUrl?: string;
  sourceUrl: string;
  title?: string;
  date?: string;
  excerpt?: string;
  /** Yapılandırılmış bölümler (Borsa Yorumu, Günlük Haberler, Ekonomi Haberleri vb.) */
  sections?: BulletinSection[];
  fullLength?: number;
  ok: boolean;
  error?: string;
}

export interface BrokerBulletinFeed {
  fetchedAt: string;
  bulletins: Record<string, BrokerBulletin>;
}

const FEED_URL = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/broker-bulletins.json';
// Cache key v4 — schema değişti (sections eklendi), eski cache geçersiz.
const CACHE_KEY = 'fa.brokerBulletins.feed.v4';
const LEGACY_KEYS = ['fa.brokerBulletins.feed', 'fa.brokerBulletins.feed.v2', 'fa.brokerBulletins.feed.v3'];
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 dk

// Modül yüklendiğinde eski cache key'leri temizle (bir kerelik migration)
try {
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
} catch {
  /* SSR / privacy mode */
}

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
      // Cache busting: jsdelivr CDN 12 saate kadar eski JSON sunabilir
      const bust = `?_=${Date.now()}`;
      const r = await fetch(FEED_URL + bust, { cache: 'no-store' });
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
