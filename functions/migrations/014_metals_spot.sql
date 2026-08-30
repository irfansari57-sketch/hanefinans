-- ============================================================================
-- Migration 014: Metals Spot Cache
-- ============================================================================
--
-- Amac: XAU (altin), XAG (gumus), XPT (platin), XPD (paladyum) spot USD/ons
-- fiyatlarini backend'de tek noktada tut. Client'lar D1'den okur — GoldAPI
-- free tier 100/ay quota'yi tuketmez, hafta sonu Yahoo prev close bug'lari
-- burada tespit edilip son valid degerle overwrite edilir.
--
-- Yazan: /api/cron/metals-refresh (GitHub Actions her 30dk/hafta ici, 2h/hafta sonu)
-- Okuyan: /api/spot-metals (frontend fetchSpotMetals)
--
-- Kolonlar:
--   metal          — 'XAU' | 'XAG' | 'XPT' | 'XPD' (primary key)
--   price_usd      — spot USD/ons fiyat (Cuma kapanis, hafta sonu son valid)
--   change_pct     — gunluk yuzde degisim (prev close vs price)
--   prev_close     — bir onceki seans kapanisi (hesap dogrulama icin)
--   source         — 'yahoo' | 'metalsapi' — hangi feed'den geldi
--   asof           — YYYY-MM-DD — Yahoo'nun claim ettigi verinin tarihi
--   updated_at     — UNIX ms — cron'un DB'ye yazdigi zaman
--
-- Sorgu: SELECT * FROM metals_spot; (tek row per metal)
-- Update pattern: INSERT OR REPLACE (idempotent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS metals_spot (
  metal      TEXT PRIMARY KEY,
  price_usd  REAL NOT NULL,
  change_pct REAL NOT NULL DEFAULT 0,
  prev_close REAL,
  source     TEXT NOT NULL DEFAULT 'yahoo',
  asof       TEXT,
  updated_at INTEGER NOT NULL
);

-- Baslangic seed — cron ilk kez calisana kadar makul defaults.
-- Cron dolduracak, buradan sonra INSERT OR REPLACE ile guncellenecek.
INSERT OR IGNORE INTO metals_spot (metal, price_usd, change_pct, source, updated_at)
VALUES
  ('XAU', 0, 0, 'seed', 0),
  ('XAG', 0, 0, 'seed', 0),
  ('XPT', 0, 0, 'seed', 0),
  ('XPD', 0, 0, 'seed', 0);
