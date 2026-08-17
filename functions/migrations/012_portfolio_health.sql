-- Migration 012 — Portföy Sağlık Skoru cache.
--
-- Portföy Sağlık Skoru (0-100) hesaplaması pahalı: 6 metrik + Anthropic AI comment.
-- Aynı gün içinde tekrar hesaplamayı engellemek için D1'de cache tutarız.
--
-- Kullanıcı manuel yenilemek isterse eski cache silinip yenisi hesaplanır.
-- Otomatik cron: her gün 08:00 TR'de tüm aktif portföyleri yeniden hesaplar.
--
-- portfolio_health_scores: skor snapshot'ları
--   user_id: kullanıcı FK (soft — user tablosu ile FOREIGN KEY yok)
--   as_of: hangi güne ait skor (YYYY-MM-DD)
--   total_score: 0-100
--   diversity_score / concentration_score / risk_score / return_score / tefas_score / liquidity_score:
--     her metriğin puanı (metrik max puanına göre 0-1 normalize)
--   breakdown_json: hesaplama detayları (sektör dağılımı vs.) - debug + UI için
--   ai_summary: 2-3 cümle özet
--   ai_suggestions_json: 3 öneri listesi (JSON array)
--   position_snapshot_json: hesaplamaya girmiş pozisyonlar (ileride diff karşılaştırması için)
--   created_at: kayıt anı

CREATE TABLE IF NOT EXISTS portfolio_health_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  as_of TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  diversity_score REAL NOT NULL,
  concentration_score REAL NOT NULL,
  risk_score REAL NOT NULL,
  return_score REAL NOT NULL,
  tefas_score REAL NOT NULL,
  liquidity_score REAL NOT NULL,
  breakdown_json TEXT NOT NULL,
  ai_summary TEXT,
  ai_suggestions_json TEXT,
  position_snapshot_json TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, as_of)
);

CREATE INDEX IF NOT EXISTS idx_phs_user ON portfolio_health_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_phs_user_asof ON portfolio_health_scores(user_id, as_of DESC);
