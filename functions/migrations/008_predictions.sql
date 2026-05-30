-- Migration 008 — Tahmin oyunu.
--
-- Her gün BIST 100 ve BIST 30 için kullanıcılar "yarın nereye gider" tahmin verir.
-- 5 kategori: ↑↑ (strongUp, >+%2), ↑ (up, +%0.5 ile +%2), ≈ (flat, ±%0.5), ↓ (down, -%2 ile -%0.5), ↓↓ (strongDown, <-%2)
--
-- Gün sonunda cron resolver gerçek değişimi alır, isabet edenler puan kazanır:
--   - Tam isabet: 10 puan
--   - Komşu kategori (1 yan): 5 puan
--   - 2+ uzak: -2 puan (yanlış tahmin maliyetli)
--
-- Streak bonus: 7 ardışık gün tahmin verirse +50 puan one-shot
--
-- date: YYYY-MM-DD (Europe/Istanbul, tahminin verildiği gün) — UNIQUE per (user_id, asset, date)
-- prediction: 'strongUp' | 'up' | 'flat' | 'down' | 'strongDown'
-- actual_change_pct: cron resolver tarafından doldurulur (gerçek %)
-- actual_bucket: cron tarafından doldurulur, hesaplanmış kategori
-- points_earned: tahmin doğruluğuna göre verilen puan (NULL = henüz değerlendirilmedi)

CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  asset TEXT NOT NULL CHECK(asset IN ('BIST100','BIST30')),
  date TEXT NOT NULL,
  prediction TEXT NOT NULL CHECK(prediction IN ('strongUp','up','flat','down','strongDown')),
  base_value REAL,
  actual_change_pct REAL,
  actual_bucket TEXT,
  points_earned INTEGER,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, asset, date)
);

CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(date);
CREATE INDEX IF NOT EXISTS idx_predictions_unresolved ON predictions(resolved_at) WHERE resolved_at IS NULL;

-- Kullanıcı toplam puanı + sıralama için view tabanlı sayım kolaylığı:
-- Toplam puan = SUM(points_earned) WHERE resolved_at IS NOT NULL — leaderboard query'sinde direkt hesaplanır.
