-- Migration 003: Yahoo Finance response cache (#106)
--
-- Apply (üretim D1'inde tek sefer):
--   wrangler d1 execute hanefinans-auth --file=./functions/migrations/003_yahoo_cache.sql --remote
--
-- Veya Cloudflare Dashboard → D1 → Query tab → satırları tek tek çalıştır.
--
-- Amaç: Yahoo'nun Cloudflare IP'lerini throttle etmesini önlemek için cache layer.
-- yahoo-warmer worker (cloudflare/yahoo-warmer/) bu tabloyu periyodik doldurur,
-- Pages proxy (functions/api/yahoo/[[path]].ts) buradan okur. Cache miss veya
-- stale data'da upstream'e düşülür ve sonuç yine bu tabloya yazılır.

CREATE TABLE IF NOT EXISTS yahoo_cache (
  -- Key formatı: "<symbol>:<range>:<interval>" örn "AKBNK.IS:2d:1d"
  -- Her unique URL pattern ayrı satır olur.
  key TEXT PRIMARY KEY,
  -- Yahoo'nun ham JSON response body'si (gzip'siz)
  payload TEXT NOT NULL,
  -- Cache yazılma zamanı (unix ms) — proxy stale check için kullanır
  updated_at INTEGER NOT NULL,
  -- Upstream HTTP status (genelde 200; 200 dışında olursa stale-only kullanılır)
  status INTEGER NOT NULL DEFAULT 200,
  -- Hangi taraf yazdı: 'warmer' (cron) veya 'proxy' (talep üstüne) — debug için
  source TEXT NOT NULL DEFAULT 'proxy'
);

-- updated_at üzerinde index — eski cache temizliği için
CREATE INDEX IF NOT EXISTS idx_yahoo_cache_updated_at ON yahoo_cache(updated_at);
