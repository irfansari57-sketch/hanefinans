-- 023: bars_meta self-heal sayaçları (22 Eki 2026).
--
-- Neden: Yahoo chart BIST'te zaman zaman son seans barını atlıyor / null döndürüyor
-- (14 Eki örneği: 133 sembolün 33'ünde son bar bir gün eskiydi). bars-warm artık
-- eksik/uyumsuz son barı İş Yatırım kapanışıyla tamamlar (bars_daily.source =
-- 'isyatirim-close'). Bu kolonlar health endpoint'inde "kaç sembol kaç kez
-- onarıldı, en son ne zaman" özetini verir.
--
-- Uygula: npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/023_bars_meta_heal.sql
-- Not: SQLite ADD COLUMN idempotent değil; ikinci çalıştırmada "duplicate column"
-- hatası normaldir. bars-warm bu kolonlar yoksa güncellemeyi sessizce atlar.

ALTER TABLE bars_meta ADD COLUMN healed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bars_meta ADD COLUMN last_heal_at INTEGER;
