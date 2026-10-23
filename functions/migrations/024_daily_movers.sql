-- 024 — Günün Enleri son iyi kopyası (23 Eki 2026)
-- Seans öncesi / tatil / kaynak boş döndüğünde "Bugün" listesi küçük bir yedek
-- kümeye düşüp yanlış sıralama gösteriyordu. Her kategori için son DOLU liste
-- burada saklanır ve kaynak boşken bu kopya "önceki kapanış" etiketiyle sunulur.
-- Idempotent. Uygulama:
--   npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/024_daily_movers.sql
CREATE TABLE IF NOT EXISTS daily_movers (
  cat        TEXT PRIMARY KEY,          -- stocks | funds | bes | crypto
  as_of      TEXT,                      -- kaynak zaman etiketi (ör. "17:59:41" veya "2026-10-22")
  session_date TEXT,                    -- TR iş günü (YYYY-MM-DD)
  payload    TEXT NOT NULL,             -- {gainers:[...], losers:[...]}
  updated_at INTEGER NOT NULL
);
