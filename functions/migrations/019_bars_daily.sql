-- 019: bars_daily — Sinyal motoru (Faz 2, Hafta 1) için düzeltilmiş günlük OHLCV deposu.
--
-- Kaynak: Yahoo chart v8 (adjclose) → O/H/L aynı faktörle ölçeklenir (bedelsiz/bölünme).
-- Yazan: functions/api/cron/bars-warm.ts (gece, hafta içi). Okuyan: /api/bars/:symbol.
--
-- Uygula: npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/019_bars_daily.sql

CREATE TABLE IF NOT EXISTS bars_daily (
  symbol     TEXT    NOT NULL,          -- 'THYAO' (no .IS)
  date       TEXT    NOT NULL,          -- 'YYYY-MM-DD' (TR seans günü)
  open       REAL    NOT NULL,          -- düzeltilmiş
  high       REAL    NOT NULL,
  low        REAL    NOT NULL,
  close      REAL    NOT NULL,          -- düzeltilmiş (adjclose)
  raw_close  REAL,                      -- ham kapanış (düzeltme faktörü = close/raw_close)
  volume     INTEGER NOT NULL DEFAULT 0,
  source     TEXT    NOT NULL DEFAULT 'yahoo',
  updated_at INTEGER NOT NULL,          -- ms epoch
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_bars_daily_symbol_date ON bars_daily (symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_bars_daily_updated ON bars_daily (updated_at);

-- Sembol başına son yükleme özeti (health + artımlı yükleme için)
CREATE TABLE IF NOT EXISTS bars_meta (
  symbol      TEXT PRIMARY KEY,
  first_date  TEXT,
  last_date   TEXT,
  bar_count   INTEGER NOT NULL DEFAULT 0,
  last_run_at INTEGER NOT NULL,
  last_error  TEXT
);
