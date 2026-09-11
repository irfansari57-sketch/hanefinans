-- BIST snapshot cache — Is Yatirim cron warmer'in her 5dk'da yazdigi taze quote'lar.
--
-- /api/yahoo/snapshot endpoint'i once BIST symbol'lerini bu tabloya sorar (fresh),
-- yoksa Yahoo yahoo_cache'e duser (stale/hatali olabilir).
--
-- Kullanim:
--   npx wrangler d1 execute investliq --file functions/migrations/016_bist_snapshot.sql
--
-- Ilk cron calistigi anda ~500 satir populates olur (BIST tam evreni).

CREATE TABLE IF NOT EXISTS bist_snapshot (
  symbol      TEXT PRIMARY KEY,      -- 'THYAO' (no .IS suffix)
  price       REAL NOT NULL,
  prev        REAL NOT NULL,
  change_pct  REAL NOT NULL,
  as_of       TEXT NOT NULL,          -- 'YYYY-MM-DD' (son islem gunu)
  updated_at  INTEGER NOT NULL        -- ms epoch (bu satirin en son yazildigi an)
);

CREATE INDEX IF NOT EXISTS idx_bist_snapshot_updated ON bist_snapshot(updated_at);
