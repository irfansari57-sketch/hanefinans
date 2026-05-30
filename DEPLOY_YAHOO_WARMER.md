# Yahoo Warmer + D1 Cache Deploy Guide (#106)

Bu doküman, Yahoo Finance 429 throttle sorununa kalıcı çözüm için eklenen
**yahoo-warmer** worker'ını ve **D1 cache** mimarisini deploy etme adımlarını
içerir.

## Mimari Özet

```
                  ┌────────────────────────────┐
   her 10 dk      │   yahoo-warmer (Worker)    │
   (UTC 07-15)    │   cron: */10 7-15 * * 1-5  │ ─── fetch ──→ Yahoo Finance
                  └──────────────┬─────────────┘
                                 │ writes
                                 ▼
                  ┌────────────────────────────┐
                  │  D1: yahoo_cache table     │
                  │  key, payload, updated_at  │
                  └──────────────┬─────────────┘
                                 │ reads
                                 ▼
                  ┌────────────────────────────┐
                  │  Pages /api/yahoo/* proxy  │
                  │  D1-first, stale fallback  │
                  └──────────────┬─────────────┘
                                 │
                                 ▼
                          Tarayıcı (kullanıcı)
```

Kullanıcı istekleri artık Yahoo'ya değil D1'e gidiyor. Yahoo'ya sadece warmer
worker temas ediyor — bu da kontrollü hızda (8 paralel, 150ms aralıklı).

## Deploy adımları

### 1) D1 migration uygula (yahoo_cache tablosunu oluştur)

```bash
cd C:\dev\hanefinans
npx wrangler d1 execute hanefinans-auth --file=./functions/migrations/003_yahoo_cache.sql --remote
```

Beklenen çıktı: `Executed 2 commands in X ms`.

### 2) D1 database ID'sini al ve worker config'e yaz

```bash
npx wrangler d1 list
```

Çıkan listede `hanefinans-auth` satırının `database_id` sütunundaki uuid'yi kopyala.

Şu dosyayı düzenle:

```
cloudflare/yahoo-warmer/wrangler.toml
```

İçindeki şu satır:

```toml
database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
```

Yukarıda aldığın gerçek UUID ile değiştir.

### 3) Worker'ı deploy et

```bash
cd cloudflare\yahoo-warmer
npm install
npx wrangler deploy
```

Deploy başarılıysa wrangler şuna benzer bir URL gösterir:

```
Published hane-finans-yahoo-warmer (1.34 sec)
  https://hane-finans-yahoo-warmer.<your-subdomain>.workers.dev
  Current Version ID: ...
```

Bu URL'i not al — bir sonraki adımda lazım.

### 4) İlk warm-up'ı manuel tetikle (cache'i hemen doldur)

Worker URL'ine `/warm/quotes` ekle ve tarayıcıdan veya curl ile çağır:

```bash
curl https://hane-finans-yahoo-warmer.<your-subdomain>.workers.dev/warm/quotes
```

~30-60 saniye sürer. Çıktı şuna benzer:

```json
{ "success": true, "ok": 410, "fail": 2, "status": { "200": 410, "429": 2 } }
```

`ok` sayısı 400+ ise warmer çalışıyor. `fail` az olmalı (3-5 yi geçmemeli).

### 5) Pages'i (web app'i) yeni proxy ile deploy et

```bash
cd C:\dev\hanefinans
npm run build
npx wrangler pages deploy dist --project-name=hanefinans --branch=main
```

### 6) Doğrulama

Tarayıcıda hanefinans.net'e git, DevTools → Network sekmesini aç.

- `/api/yahoo/v8/finance/chart/AKBNK.IS?range=2d&interval=1d` çağrılarına bak
- Response headers'da `X-Source` header'ı görmeli:
  - `D1` — D1 cache'den dönmüş (en yaygın olmalı, %95+)
  - `EDGE` — Cloudflare edge cache'den dönmüş (anlık tekrar isteklerde)
  - `UPSTREAM` — Yahoo'ya gitmiş (cache miss; rare)
  - `STALE-D1` — Yahoo 429 verdi, eski D1 verisi dönüldü (fallback aktif)

Eğer çoğunluk `D1` değilse:
- D1 migration uygulanmamış olabilir (Adım 1'i tekrarla)
- Worker deploy edilmemiş veya cache henüz dolmamış (Adım 4'ü tekrarla)

### 7) Cache stats'ı kontrol et

```bash
curl https://hane-finans-yahoo-warmer.<your-subdomain>.workers.dev/health
```

Çıktı şuna benzer:

```json
{
  "ok": true,
  "stats": {
    "total": 415,
    "last_update": 1748125200000,
    "oldest": 1748124900000,
    "warmer_rows": 415,
    "proxy_rows": 0
  }
}
```

`total ≥ 400` ve `warmer_rows ≥ 400` ise sağlıklı. `last_update` son 10 dk
içinde olmalı (BIST açıkken).

## Cron schedule (UTC)

| Cron | Zaman | Eylem |
|------|-------|-------|
| `*/10 7-15 * * 1-5` | Mon-Fri, 07-15 UTC her 10 dk | Tüm 412 sembol için quote |
| `30 15 * * 1-5` | Mon-Fri, 15:30 UTC | Top 60 sembol için 1Y daily historical |
| `0 22 * * *` | Her gün 22:00 UTC | 7 günden eski cache temizliği |

BIST açılış saatleri: 10:00-18:00 TR = 07:00-15:00 UTC.

## Log izleme

Worker log'ları için:

```bash
cd cloudflare\yahoo-warmer
npx wrangler tail
```

Her cron tetiklendiğinde şuna benzer log görmelisin:

```
[warmer] quotes: 410 ok, 2 fail { "200": 410, "429": 2 }
```

## Sorun giderme

### "Database not found" hatası
`wrangler.toml`'daki `database_id` yanlış. Adım 2'yi tekrarla.

### "Cannot find module '@cloudflare/workers-types'"
```bash
cd cloudflare\yahoo-warmer
npm install
```

### Tüm sembollerde 429 dönüyor
Yahoo IP'ni throttle ediyor. Worker bir kez fail oldukça eski D1 verisi
kullanılır (stale-D1 fallback). Birkaç saat sonra Yahoo throttle'ı düşürür.
İlk yardım: `npx wrangler dev` ile lokal Worker çalıştır, lokal IP'den fetch
yap.

### Proxy hâlâ Yahoo'ya gidiyor (X-Source: UPSTREAM)
Cache miss demek. Şunları kontrol et:
1. `npx wrangler d1 execute hanefinans-auth --command "SELECT COUNT(*) FROM yahoo_cache" --remote`
   → 400+ olmalı
2. Adım 4'teki warm-up'ı çalıştır
3. Proxy'nin `env.DB` binding'i çalışıyor mu — Cloudflare Pages → Settings →
   Functions → D1 namespace bindings → `DB` → `hanefinans-auth` olmalı

## Eski cache satırlarını manuel sil

```bash
curl https://hane-finans-yahoo-warmer.<your-subdomain>.workers.dev/cleanup
```

Veya tüm cache'i sıfırla:

```bash
npx wrangler d1 execute hanefinans-auth --command "DELETE FROM yahoo_cache" --remote
```

Sonra yeni warm-up tetikle.

## Mimari notları

- **Neden KV değil D1?** KV free tier 1000 write/gün. 412 sembol × ~50 cron/gün = 20K write/gün. D1 free tier 100K/gün — bizim için yeterli.
- **Neden sadece BIST?** ABD/kripto/forex sembolleri Yahoo'da daha az throttle alıyor; talep üstüne proxy'den çekilebiliyor. BIST `.IS` ekli semboller en sık 429 alanlar.
- **Neden 10 dakika?** Yahoo'nun real-time fiyat update sıklığı zaten 15-20 dk gecikmeli. 10 dk pencere kullanıcı deneyimini bozmayacak kadar taze, kotayı yormayacak kadar yavaş.
