-- Daily AI Brief storage
-- Her gun 07:30 TR'de cron tarafindan generate edilir.
-- MVP: Generic brief (tum kullanicilara ayni) — gunde 1 satir.
-- Sonraki: user_id != 0 ile kisisellestirme (watchlist sync uzerine).

CREATE TABLE IF NOT EXISTS briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 0 = global brief (MVP). >0 = kullanici bazli (gelecek).
  user_id INTEGER NOT NULL DEFAULT 0,
  -- ISO date 'YYYY-MM-DD' (TR timezone)
  brief_date TEXT NOT NULL,
  -- Markdown formatli icerik (4-6 paragraf: BIST + makro + global + haber ozet)
  content_md TEXT NOT NULL,
  -- Model + prompt versiyonu (analytics icin)
  model_version TEXT,
  -- ms timestamp
  generated_at INTEGER NOT NULL,
  -- Push gonderildi mi sayisi (toplam basarili push)
  sent_count INTEGER NOT NULL DEFAULT 0,
  -- Ayni user (veya global) ayni gun icin tek brief
  UNIQUE(user_id, brief_date)
);

-- Latest / history query: WHERE user_id=0 (veya =X) ORDER BY brief_date DESC
CREATE INDEX IF NOT EXISTS idx_briefs_user_date
  ON briefs(user_id, brief_date DESC);

-- Cleanup (90 gunden eski sil)
CREATE INDEX IF NOT EXISTS idx_briefs_generated_at
  ON briefs(generated_at);
