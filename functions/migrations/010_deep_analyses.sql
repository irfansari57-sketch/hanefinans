-- Deep-Dive AI Analiz storage + quota tracking
-- Elite kullanicilar limitsiz, Pro 2/ay, Free paywall.
-- Cache: 24 saat icinde ayni sembol icin tekrar isteme AI cagrilmaz, cache'den doner.

CREATE TABLE IF NOT EXISTS deep_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 0 = anon (Free icin paywall), >0 = kayitli kullanici
  user_id INTEGER NOT NULL,
  -- BIST sembol: 'THYAO', 'AKBNK' vs (suffix yok)
  symbol TEXT NOT NULL,
  -- Markdown analiz icerigi (premium kapsam: teknik+makro+haber+finansallar+analist+senaryo+risk)
  content_md TEXT NOT NULL,
  -- Model + prompt versiyon (analytics)
  model_version TEXT,
  -- Token kullanim (cost tracking)
  tokens_input INTEGER,
  tokens_output INTEGER,
  -- ms timestamp
  generated_at INTEGER NOT NULL
);

-- 24 saat cache lookup: WHERE symbol=? AND generated_at > NOW - 86400000 ORDER BY generated_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_deep_symbol_time
  ON deep_analyses(symbol, generated_at DESC);

-- Aylik quota: WHERE user_id=? AND generated_at >= start_of_month
CREATE INDEX IF NOT EXISTS idx_deep_user_time
  ON deep_analyses(user_id, generated_at DESC);

-- Cleanup (90 gunden eski analizi sil)
CREATE INDEX IF NOT EXISTS idx_deep_generated_at
  ON deep_analyses(generated_at);
