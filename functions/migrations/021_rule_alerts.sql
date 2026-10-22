-- Migration 021 — Kural tabanlı alarmlar (Sinyal Motoru Hafta 4b, 22 Eki 2026).
--
-- price_alerts fiyat EŞİĞİ izler; bu tablo GÖSTERGE koşulu izler (RSI eşiği,
-- SMA kesişimi, sinyal motoru kuralı, 52h zirveye yakınlık, tarayıcı filtresi).
-- Değerlendirme günde bir kez, bars_daily gece yazıldıktan sonra
-- (/api/cron/rule-alerts ← .github/workflows/rule-alerts.yml).
--
-- rule_kind: 'rsi_below' | 'rsi_above' | 'cross_sma50' | 'cross_sma200'
--            | 'signal' | 'near_52w_high' | 'screen'
-- rule_json (kind'a göre):
--   rsi_*          {"threshold": 30}
--   cross_sma*     {"direction": "up" | "down" | "any"}
--   signal         {"kind": SignalKind}           (src/lib/signals.ts)
--   near_52w_high  {"maxPct": 3}
--   screen         ScreenFilter                   (src/lib/metrics.ts)
-- active: 1 izleniyor, 0 duraklatıldı. Kural tetiklenince PASİFE ALINMAZ —
--   aynı bar günü için ikinci kez tetiklenmez (last_eval_date = bar tarihi).
-- last_eval_date: değerlendirilen son bar tarihi (YYYY-MM-DD).
-- last_triggered_at / trigger_count: UI "son tetiklenme" + sayaç.
--
-- Uygulama:
--   npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/021_rule_alerts.sql

CREATE TABLE IF NOT EXISTS rule_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  rule_kind TEXT NOT NULL CHECK(rule_kind IN ('rsi_below','rsi_above','cross_sma50','cross_sma200','signal','near_52w_high','screen')),
  rule_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  last_eval_date TEXT,
  last_triggered_at INTEGER,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rule_alerts_user ON rule_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_rule_alerts_active_symbol ON rule_alerts(active, symbol);
