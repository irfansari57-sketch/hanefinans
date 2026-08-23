-- ============================================================================
-- Migration 013: Portfolio Snapshots (aylık kâr/zarar geçmişi)
-- ============================================================================
--
-- Amaç: Kullanıcının portföy değerini periyodik olarak snapshot al → geçmiş
-- grafiği (1 ay önce → bugün) çıkar. Cron worker gün sonu tetikler, gün
-- içinde bir snapshot yazılır. UI /portfoy/gecmis sayfası bunu okur.
--
-- Kolonlar:
--   user_id       — auth.users(id) — kullanıcı sahipliği
--   as_of         — ISO YYYY-MM-DD — snapshot tarihi (aynı gün için tek kayıt)
--   total_value   — toplam market değer (TL)
--   total_cost    — toplam maliyet (TL)
--   total_pnl     — total_value - total_cost (TL)
--   total_pnl_pct — % kâr/zarar
--   position_count — portföydeki toplam pozisyon sayısı
--   positions_json — snapshot anındaki tüm pozisyonların JSON dökümü
--                    (sonradan detaylı analiz için — sembol/lot/fiyat)
--   created_at    — snapshot alınma zamanı (UNIX ms)
--
-- Sorgu örneği (son 1 yıl trend):
--   SELECT as_of, total_value, total_pnl_pct
--   FROM portfolio_snapshots
--   WHERE user_id = ? AND as_of >= date('now', '-1 year')
--   ORDER BY as_of ASC;
--
-- Kısıt: (user_id, as_of) UNIQUE — aynı gün için 2 snapshot yazılmaz;
-- cron yeniden çalışırsa UPDATE ile en son değere refresh.
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  as_of TEXT NOT NULL,                -- YYYY-MM-DD
  total_value REAL NOT NULL,
  total_cost REAL NOT NULL,
  total_pnl REAL NOT NULL,
  total_pnl_pct REAL NOT NULL,
  position_count INTEGER NOT NULL DEFAULT 0,
  positions_json TEXT,                -- Detaylı pozisyon dökümü (JSON)
  created_at INTEGER NOT NULL,        -- UNIX ms
  UNIQUE(user_id, as_of)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date
  ON portfolio_snapshots(user_id, as_of DESC);
