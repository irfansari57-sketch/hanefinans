-- Migration 022 — Kanıt Defteri (Sinyal Motoru Hafta 5, 22 Eki 2026).
--
-- Sinyal motorunun (src/lib/signals.ts) ürettiği her sinyali kaydeder ve
-- sonradan 5/20/60 işlem günü ileri kapanışı + getiriyi doldurur. Amaç: kuralların
-- "sonradan ne yaptığını" ÖLÇMEK (performans ölçümü; tavsiye değil).
--
-- Yazar: /api/cron/signal-ledger (POST, CRON_SECRET) ← .github/workflows/signal-ledger.yml
-- Okur:  /api/signals/ledger (GET, public) → /signals/defter sayfası
--
-- Kolonlar:
--   signal_date        sinyal günü (bars_daily'deki son bar tarihi, YYYY-MM-DD)
--   entry_close        sinyal günü düzeltilmiş kapanış (bars_daily.close)
--   index_entry_close  aynı gün XU100 kapanışı (endeks farkı için)
--   close_Nd / ret_Nd  N işlem günü sonraki kapanış ve yüzde getiri (kapanıştan kapanışa,
--                      temettü düzeltmesi bars_daily kadar, maliyet/kayma yok)
--   index_ret_Nd       aynı pencerede XU100 yüzde getirisi
--   filled_at          son doldurma zamanı (ms epoch); ret_60d dolunca kayıt tamamlanır
-- UNIQUE(symbol, kind, signal_date): aynı sinyal aynı gün bir kez (INSERT OR IGNORE).
--
-- Uygulama:
--   npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/022_signal_ledger.sql

CREATE TABLE IF NOT EXISTS signal_ledger (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol            TEXT    NOT NULL,
  kind              TEXT    NOT NULL,
  direction         TEXT    NOT NULL,
  strength          INTEGER NOT NULL,
  regime_fit        TEXT,
  signal_date       TEXT    NOT NULL,
  entry_close       REAL    NOT NULL,
  index_entry_close REAL,
  close_5d          REAL,
  close_20d         REAL,
  close_60d         REAL,
  ret_5d            REAL,
  ret_20d           REAL,
  ret_60d           REAL,
  index_ret_5d      REAL,
  index_ret_20d     REAL,
  index_ret_60d     REAL,
  filled_at         INTEGER,
  created_at        INTEGER NOT NULL,
  UNIQUE(symbol, kind, signal_date)
);

CREATE INDEX IF NOT EXISTS idx_signal_ledger_date      ON signal_ledger(signal_date);
CREATE INDEX IF NOT EXISTS idx_signal_ledger_kind_date ON signal_ledger(kind, signal_date);
-- Doldurma kuyruğu: 60g getirisi henüz yazılmamış kayıtlar
CREATE INDEX IF NOT EXISTS idx_signal_ledger_pending   ON signal_ledger(symbol) WHERE ret_60d IS NULL;
