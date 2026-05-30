-- Migration 006 — Server-side fiyat alarmları (push tabanlı).
--
-- Daha önce alarmlar yerel IndexedDB'deydi (tarayıcı kapanınca durur).
-- Bu tablo D1'de tutulur, /api/cron/check-alerts her 5 dk kontrol eder
-- ve tetiklenen alarmlar için kullanıcının push subscription'larına bildirim gönderir.
--
-- direction: above = fiyat eşiği geçince, below = fiyat eşiği altına düşünce
-- asset_type: stock (BIST), fund (TEFAS), crypto (BTC/ETH...), fx (USD/EUR)
-- active: 1 = izleniyor, 0 = devre dışı (tetiklendikten sonra otomatik 0 olur)
-- last_price / last_checked_at: cron debugging + UI'da "son kontrol" göstergesi

CREATE TABLE IF NOT EXISTS price_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('stock','fund','crypto','fx')),
  direction TEXT NOT NULL CHECK(direction IN ('above','below')),
  threshold REAL NOT NULL,
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  triggered_at INTEGER,
  trigger_price REAL,
  last_price REAL,
  last_checked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(active);
CREATE INDEX IF NOT EXISTS idx_alerts_symbol_active ON price_alerts(symbol, active);
