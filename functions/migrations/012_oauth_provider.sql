-- Migration 012: OAuth provider kolonlarini users tablosuna ekle.
--
-- Email/password kullanicilari icin: provider = NULL, password_hash = SHA256
-- Sosyal giris kullanicilari icin: provider = 'google'|'apple', provider_id = sub
--
-- Apply: wrangler d1 execute hanefinans-db --file=functions/migrations/012_oauth_provider.sql
-- (veya CF dashboard D1 console'dan satir satir calistir)

ALTER TABLE users ADD COLUMN provider TEXT;
ALTER TABLE users ADD COLUMN provider_id TEXT;

-- Same provider altinda ayni hesap iki kez olusmasin
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider
  ON users(provider, provider_id)
  WHERE provider IS NOT NULL;

-- Bilgi notu: D1 (SQLite) ALTER TABLE ... DROP NOT NULL desteklemiyor.
-- password_hash zaten NULL kabul ediyorsa (CREATE TABLE'da NOT NULL yoksa)
-- bir sey yapmaya gerek yok. Aksi durumda manuel migration gerekecek:
--   1. Yeni tablo olustur (password_hash NULL kabul eden)
--   2. INSERT INTO yeni_users SELECT * FROM users
--   3. DROP TABLE users; ALTER TABLE yeni_users RENAME TO users;
-- Eger signup.ts password_hash zorunlu girerse OAuth user'lara bos string '' yaziyoruz.
