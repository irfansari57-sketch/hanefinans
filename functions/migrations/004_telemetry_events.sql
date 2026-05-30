-- Telemetri event'leri için tablo.
-- Anonim — kullanıcı id yok. Sadece session id (12-char random) + meta.

CREATE TABLE IF NOT EXISTS telemetry_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,             -- event name: "watchlist.add", "screener.query"
  props TEXT,                     -- JSON: { symbol: "GARAN", count: 3 }
  ts INTEGER NOT NULL,            -- client-side timestamp (ms)
  sid TEXT NOT NULL,              -- session id (anonim, 12-char)
  path TEXT,                      -- sayfa pathname
  ua TEXT,                        -- user agent (cihaz/tarayıcı tipi için)
  country TEXT,                   -- CF-IPCountry (lokasyon tipi için)
  received_at INTEGER NOT NULL    -- server-side receive time (ms)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_name_ts ON telemetry_events(name, ts);
CREATE INDEX IF NOT EXISTS idx_telemetry_sid    ON telemetry_events(sid);
CREATE INDEX IF NOT EXISTS idx_telemetry_path   ON telemetry_events(path);
