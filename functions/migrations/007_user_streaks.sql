-- Migration 007 — Streak (günlük ziyaret serisi).
--
-- Her kullanıcı için site ziyaret serisi tutar.
-- /api/streak/ping sayfa açılışta çağrılır (Layout'tan), her gün ilk ziyaret
-- streak'i +1, eski güne hiç gelmemişse 1'e sıfırlar.
--
-- last_visit_date: YYYY-MM-DD formatı (Europe/Istanbul) — gün karşılaştırması için
-- current_streak: aktif seri
-- longest_streak: tüm zamanların en uzun serisi (rozet için)
-- total_visits: rozet için toplam ziyaret sayısı

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id INTEGER PRIMARY KEY,
  current_streak INTEGER NOT NULL DEFAULT 1,
  longest_streak INTEGER NOT NULL DEFAULT 1,
  last_visit_date TEXT NOT NULL,
  total_visits INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
