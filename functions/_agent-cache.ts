/**
 * Agent response cache — D1 backed, TTL based.
 *
 * Agent çıktıları (sentiment, news, macro, indicator) tüm kullanıcılara
 * AYNI servis edilir. Her kullanıcı için ayrı Claude çağrısı yapmak
 * gereksiz maliyet + rate limit sıkışıklığı yaratıyor.
 *
 * Bu helper:
 *   - Anahtarla cache lookup (D1 yahoo_cache tablosu paylaşılıyor — uygun)
 *   - TTL geçmemişse cached JSON döner
 *   - Geçtiyse sağlanan generator fn çalışır, sonuç cache'e yazılır
 *
 * Schema: yahoo_cache (key, payload, updated_at) — generic key-value cache.
 * Agent key prefix: "agent:<name>:v<version>"
 */

interface CacheRow {
  payload: string;
  updated_at: number;
}

interface CacheOptions {
  /** Cache TTL (saniye). News=900 (15dk), Macro=1800 (30dk), Indicator=600 (10dk). */
  ttlSec: number;
  /** Force refresh — query param ?refresh=1 vb. */
  bypass?: boolean;
}

/**
 * Cache lookup + miss durumunda generator çalıştır.
 *
 * @param db D1 binding
 * @param key Cache anahtarı (örn. "agent:news:v1")
 * @param options TTL + bypass
 * @param generator Cache miss durumunda çalıştırılacak async fn (response JSON döner)
 */
export async function withAgentCache<T>(
  db: D1Database,
  key: string,
  options: CacheOptions,
  generator: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const now = Math.floor(Date.now() / 1000);

  if (!options.bypass) {
    try {
      const row = await db
        .prepare('SELECT payload, updated_at FROM yahoo_cache WHERE key = ? LIMIT 1')
        .bind(key)
        .first<CacheRow>();
      if (row && now - row.updated_at < options.ttlSec) {
        try {
          const parsed = JSON.parse(row.payload) as T;
          return { value: parsed, cached: true };
        } catch {
          // Bozuk cache → atla, generator çalışsın
        }
      }
    } catch {
      // DB hatası → cache atla, generator çalışsın
    }
  }

  // Cache miss veya bypass → generator çalıştır
  const fresh = await generator();

  // Cache'e yaz (best-effort) — yahoo_cache tablosu paylaşılıyor
  try {
    await db
      .prepare(
        `INSERT INTO yahoo_cache (key, payload, updated_at, status, source)
         VALUES (?, ?, ?, 200, 'agent')
         ON CONFLICT(key) DO UPDATE SET
           payload = excluded.payload,
           updated_at = excluded.updated_at,
           source = 'agent'`,
      )
      .bind(key, JSON.stringify(fresh), now)
      .run();
  } catch {
    // Cache yazılamadıysa sessizce geç — response zaten elimizde
  }

  return { value: fresh, cached: false };
}

/** Yahoo_cache key prefix tutarlılığı için yardımcı. */
export function agentCacheKey(agentName: string, version = 1): string {
  return `agent:${agentName}:v${version}`;
}
