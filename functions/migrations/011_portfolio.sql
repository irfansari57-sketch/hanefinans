-- Migration 011 — Server-side portföy pozisyonları + işlem geçmişi.
--
-- Daha önce portföy IndexedDB'deydi (cache temizlenince/cihaz değişince kayboluyordu).
-- Bu tablolar D1'de tutulur, kullanıcı login olduğunda Dexie yerine D1 source of truth olur.
--
-- portfolio_positions: anlik pozisyon (toplam lot + ortalama maliyet)
--   kind: 'stock' = BIST hisse, 'fund' = TEFAS fon
--   symbol: BIST kodu veya fon kodu (THYAO, CPU vs.)
--   lot: pay/lot adedi (fraksiyonel kabul, ondalik)
--   avg_price: ortalama maliyet (TRY/lot veya TRY/pay)
--
-- portfolio_txns: islem gecmisi (her alim/satim ayri kayit)
--   position_id: portfolio_positions.id (CASCADE delete)
--   lot: pozitif = alim, negatif = satim
--   price: islem aninda fiyat
--   executed_at: kullanici tarafindan girilen islem tarihi
--   created_at: kayit yaratilan an

CREATE TABLE IF NOT EXISTS portfolio_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('stock','fund')),
  symbol TEXT NOT NULL,
  lot REAL NOT NULL,
  avg_price REAL NOT NULL,
  note TEXT,
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pp_user ON portfolio_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_pp_user_symbol ON portfolio_positions(user_id, symbol);

CREATE TABLE IF NOT EXISTS portfolio_txns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('stock','fund')),
  symbol TEXT NOT NULL,
  lot REAL NOT NULL,
  price REAL NOT NULL,
  executed_at INTEGER NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (position_id) REFERENCES portfolio_positions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pt_user ON portfolio_txns(user_id);
CREATE INDEX IF NOT EXISTS idx_pt_position ON portfolio_txns(position_id);
CREATE INDEX IF NOT EXISTS idx_pt_executed ON portfolio_txns(executed_at);
