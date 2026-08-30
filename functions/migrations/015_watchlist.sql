-- ============================================================================
-- Migration 015: User Watchlist (izleme listesi)
-- ============================================================================
--
-- Amac: Kullanicinin takip ettigi sembolleri (BIST hisse/TEFAS fon) sunucuda
-- tut. Onceki: localStorage `fa.watchlist.v1` — cihaz degisince/cache
-- temizlenince kaybediliyordu. Portfoy pattern'i ile ayni: login sonrasi
-- D1 authoritative, anonim cache localStorage'da kalir.
--
-- Kolonlar:
--   user_id     — auth.users(id) — kullanici sahipligi
--   symbol      — sembol kodu (THYAO, ASELS, CPU, ...) UPPER case
--   kind        — 'stock' | 'fund' | 'crypto' — opsiyonel, default 'stock'
--   note        — kullanici notu (opsiyonel)
--   added_at    — UNIX ms — listeye eklenme zamani
--   position    — siralama icin manuel sira (drag/drop reorder icin);
--                 default added_at ile senkron, reorder update eder
--
-- Unique: (user_id, symbol) — ayni sembol iki kez eklenmez
-- Index: user_id — GET listesi hizli
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_watchlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  symbol     TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'stock' CHECK(kind IN ('stock','fund','crypto')),
  note       TEXT,
  added_at   INTEGER NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_uw_user     ON user_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_uw_user_pos ON user_watchlist(user_id, position);
