# Hane Finans — Yahoo Finance Warmer

Cloudflare Workers cron job that periodically pre-fetches Yahoo Finance chart data for ~412 BIST symbols + 5 BIST indices and writes them to D1 (`yahoo_cache` table). The Pages site (`functions/api/yahoo/[[path]].ts`) reads from this cache instead of hammering Yahoo directly. Solves the 429 / IP-throttle issue.

## One-time setup

### 1) D1 binding — Pages projesiyle aynı veritabanını kullan

Bu worker, Pages projesinin kullandığı `hanefinans-auth` D1 veritabanına yazar.

```bash
# Mevcut D1 listesini gör
npx wrangler d1 list

# Veya Cloudflare Dashboard → Workers & Pages → D1 → "hanefinans-auth" → Settings → "Database ID"
```

`wrangler.toml` içindeki `REPLACE_WITH_YOUR_D1_DATABASE_ID` satırını gerçek ID ile değiştir.

### 2) Migration uygula (yahoo_cache tablosunu oluştur)

```bash
cd /path/to/hanefinans
npx wrangler d1 execute hanefinans-auth --file=./functions/migrations/003_yahoo_cache.sql --remote
```

### 3) Worker'ı deploy et

```bash
cd cloudflare/yahoo-warmer
npm install
npx wrangler deploy
```

Deploy sonrası Cloudflare otomatik olarak `wrangler.toml`'daki cron schedule'ları kaydeder.

## Endpoints

Worker URL: `https://hane-finans-yahoo-warmer.<your-subdomain>.workers.dev`

- `GET /health` — cache istatistikleri (toplam satır, en son güncelleme, warmer/proxy oranı)
- `GET /warm/quotes` — manuel quote ısıtma (412 symbol × 1 fetch)
- `GET /warm/historical` — manuel 1Y daily historical ısıtma (top 60)
- `GET /cleanup` — 7 günden eski cache satırlarını sil

## Cron schedule (UTC)

| Cron | Anlamı | Eylem |
|------|--------|-------|
| `*/10 7-15 * * 1-5` | Mon-Fri, 07-15 UTC her 10 dk | Tüm 412 sembol için quote (range=2d, interval=1d) |
| `30 15 * * 1-5` | Mon-Fri, 15:30 UTC | Top 60 sembol için 1Y daily historical |
| `0 22 * * *` | Her gün 22:00 UTC | 7 günden eski cache temizliği |

BIST açılış saatleri: 10:00-18:00 TR = 07:00-15:00 UTC.

## Log'ları izleme

```bash
npx wrangler tail
```

## D1 yazma kotası

- Free tier: 100K writes/day
- Quotes cron: 412 symbols × 51 cycles/day (her 10 dk × 8.5 saat) ≈ 21K writes/day
- Historical cron: 60 symbols × 1/day = 60 writes/day
- Toplam ~21K writes/day — limit altında.
