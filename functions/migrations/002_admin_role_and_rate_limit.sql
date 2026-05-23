-- Migration 002: Admin role kolonu + rate_limits tablosu
--
-- Apply (üretim D1'inde tek sefer):
--   wrangler d1 execute hanefinans-auth --file=./functions/migrations/002_admin_role_and_rate_limit.sql --remote
--
-- Veya Cloudflare Dashboard → D1 → Query tab → satırları tek tek çalıştır.
--
-- NOT: ALTER TABLE idempotent DEĞİL — eğer is_admin kolonu zaten varsa
-- "duplicate column name" hatası verir, bu satırı atla.

-- 1) is_admin kolonu ekle
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

-- 2) Mevcut hardcoded admin email'lerini DB'de işaretle
UPDATE users SET is_admin = 1
WHERE LOWER(TRIM(email)) IN ('irfansari57@gmail.com', 'haneassistance@gmail.com');

-- 3) is_admin için index — admin listeleme query'leri hızlı kalsın
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- 4) Rate limit tablosu — middleware kullanır
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);
