-- Migration 005 — Web Push subscription tablosu.
--
-- Bir kullanıcı birden fazla cihaz/tarayıcıdan push aboneliği yapabilir,
-- her birinin kendi endpoint'i, p256dh public key'i ve auth secret'ı var.
-- Subscription'lar kullanıcıya bağlı; user_id 0 ise admin/system kullanır.
--
-- Endpoint UNIQUE → aynı tarayıcı 2 kere subscribe olursa upsert davranır.
-- last_used_at: başarılı push gönderiminde güncellenir; eski/ölü endpoint'leri
-- arada bir purge etmek için kullanılır.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  last_error TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_last_used ON push_subscriptions(last_used_at);
