-- 018: users.token_version — JWT iptali (şifre değişince/sıfırlanınca +1).
-- Kolon yoksa kod 0 kabul eder (geriye uyumlu); ama iptal çalışmaz → uygula:
--   wrangler d1 execute hanefinans-db --remote --file=functions/migrations/018_token_version.sql
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
