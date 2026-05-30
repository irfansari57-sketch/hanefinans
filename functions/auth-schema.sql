-- Hane Finans Cloud Auth — Cloudflare D1 schema
-- Apply: wrangler d1 execute <db-name> --file=./functions/auth-schema.sql --remote
-- (veya Cloudflare Dashboard → D1 → DB seç → "Query" tab → bu SQL'i yapıştır + Run)
--
-- NOT: Tüm CREATE'ler IF NOT EXISTS — mevcut DB'de tekrar çalıştırmak güvenli.
-- ALTER TABLE'lar idempotent değil; ilk migration ile birlikte hata verir,
-- bu durumda bireysel satırları atlamak güvenli.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro' | 'elite'
  tier_expires_at INTEGER,             -- unix ms; NULL = sınırsız
  email_verified INTEGER NOT NULL DEFAULT 0,  -- 0 | 1
  email_verified_at INTEGER,
  avatar_color TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,  -- 0 | 1; admin yetkisi (#5 migration)
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- === Rate limit storage (D1-backed sliding window) ===
-- functions/_rate-limit.ts buradaki tabloyu okur. Pencere boyutu kod'da
-- tanımlı (auth=60s, ai=3600s, default=60s).
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL  -- unix seconds, pencerenin kapanma zamanı
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);
