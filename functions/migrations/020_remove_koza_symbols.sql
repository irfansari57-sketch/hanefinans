-- 020 — KOZAA / KOZAL temizliği (15 Eki 2026)
-- Koza Anadolu Metal → TRMET, Koza Altın → TRALT olarak yeniden kotasyon aldı;
-- eski semboller işlem görmüyor ve bars_meta'da 'errored' olarak duruyordu.
-- Idempotent: satır yoksa etkisiz.
DELETE FROM bars_daily WHERE symbol IN ('KOZAA', 'KOZAL');
DELETE FROM bars_meta  WHERE symbol IN ('KOZAA', 'KOZAL');
DELETE FROM bist_snapshot WHERE symbol IN ('KOZAA', 'KOZAL');
