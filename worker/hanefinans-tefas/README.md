# hanefinans-tefas Worker

Cloudflare Worker — TEFAS API'sinden tüm fonların gün sonu NAV + dönemsel getiri verisini çeker, Cloudflare KV'ya yazar, frontend'e HTTP endpoint olarak servis eder.

## Deploy Adımları (Dashboard üzerinden)

### 1. Worker oluştur
- https://dash.cloudflare.com → Workers & Pages → **Create** → **Start with Hello World!**
- Name: `hanefinans-tefas`
- Deploy

### 2. Kodu yapıştır
- Worker → **Edit code** (veya Quick Edit)
- Tüm default kodu sil
- `index.js` içeriğini yapıştır
- **Save and Deploy**

### 3. KV Namespace bağla
- Worker → **Settings → Bindings → Add**
- Tip: **KV Namespace**
- Variable name: `FUNDS_KV`
- KV namespace: **Create new** → `HANEFINANS_FUNDS`
- Add → Save

### 4. Cron Trigger ekle
- Worker → **Settings → Triggers → Cron Triggers → Add**
- Cron: `0 16 * * 1-5` (UTC 16:00 = TR 19:00, Pazartesi-Cuma)
- Save

### 5. Secret ekle (manuel tetikleyici için)
- Worker → **Settings → Variables and Secrets → Add**
- Type: **Secret** (Encrypted)
- Name: `TRIGGER_SECRET`
- Value: rastgele bir string (örn. `hf-tefas-2026-x9k7m`)
- Save

### 6. Custom Domain bağla (önerilen)
- Worker → **Settings → Triggers → Custom Domains → Add Custom Domain**
- Domain: `funds.hanefinans.net`
- DNS otomatik kurulur (domain Cloudflare DNS'inde olduğu için)

### 7. İlk veriyi çek (manuel)
Custom domain bağlandıktan sonra:
```
https://funds.hanefinans.net/trigger?secret=YOUR_SECRET
```
~30-60 saniye sürer, 1000+ fon bilgisi KV'ya yazılır.

### 8. Frontend'i bağla
Frontend `VITE_TEFAS_WORKER_URL` env var'ını set et:
```
VITE_TEFAS_WORKER_URL=https://funds.hanefinans.net
```
Cloudflare Pages → hanefinans → Settings → Variables → Add → Plaintext.

Sonra Pages Deployments → Retry deployment.

## Test

```bash
# Veri kontrolü
curl https://funds.hanefinans.net | head -c 200

# Manuel tetikleme
curl "https://funds.hanefinans.net/trigger?secret=YOUR_SECRET"
```

## Endpoint'ler

- `GET /` — Cache'lenmiş tüm fon listesi (JSON)
- `GET /trigger?secret=X` — Manuel TEFAS fetch + KV güncellemesi

## Response Format

```json
{
  "updatedAt": "2026-05-16T19:00:00.000Z",
  "latestDate": "16.05.2026",
  "count": 1003,
  "anchors": {
    "latest": { "date": "16.05.2026", "count": 1003 },
    "1w": { "date": "09.05.2026", "count": 1001 },
    ...
  },
  "funds": [
    {
      "code": "AAL",
      "name": "Anadolu Hayat Para Piyasası Fonu",
      "nav": 1.234567,
      "date": "16.05.2026",
      "marketCap": 1234567890,
      "investorCount": 12345,
      "shareCount": 1000000000,
      "returns": { "1w": 0.45, "1m": 2.13, "3m": 8.97, "6m": 18.5, "1y": 42.3, "ytd": 12.1 }
    },
    ...
  ]
}
```
