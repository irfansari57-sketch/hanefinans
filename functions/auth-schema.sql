-- Hane Finans Cloud Auth — Cloudflare D1 schema
-- Apply: wrangler d1 execute <db-name> --file=./functions/auth-schema.sql --remote
-- (veya Cloudflare Dashboard → D1 → DB seç → "Query" tab → bu SQL'i yapıştır + Run)

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
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
