# Hane Finans — TEFAS Cloudflare Worker

TEFAS gerçek verisini Browser Rendering API ile çekip JSON döndüren worker.

## Ne yapar?

- `GET /fund/TLY` → TLY fonunun NAV, performans, varlık dağılımı
- `GET /funds/top?limit=50` → en aktif fonlar listesi
- KV cache (15-30 dk) ile çok fazla istek atmaz
- Akamai bot challenge'ı **gerçek Chrome instance** ile aşar

## Kurulum (5 dk)

### 1. Cloudflare hesabı

https://dash.cloudflare.com → kayıt ol (ücretsiz). Kredi kartı **istemez**.

### 2. Workers ücretsiz plana abone ol

Hesabına gir → **Workers & Pages** → **Get Started**.

### 3. Browser Rendering aboneliği

- **Workers & Pages → Browser Rendering** sekmesine git
- "Subscribe to Free Plan" tıkla
- Ücretsiz kota: **10 dakika tarayıcı zamanı/gün** + **100 istek/gün** (bizim için fazlasıyla yeter)

### 4. Wrangler CLI kur ve login

```powershell
npm install -g wrangler
wrangler login
```

Tarayıcıda Cloudflare login ekranı açılır → onayla.

### 5. Worker'ı deploy et

```powershell
cd C:\Users\sirfa\OneDrive\Desktop\HaneFinans\cloudflare\tefas-worker
npm install
wrangler deploy
```

Çıktıda URL göreceksin:
```
✨ Successfully published your script to
   https://hane-finans-tefas.<senin-hesap>.workers.dev
```

### 6. (Opsiyonel) KV cache namespace oluştur

```powershell
wrangler kv:namespace create CACHE
```

Sana bir `id` verir. `wrangler.toml`'da `kv_namespaces` bloğunu uncomment et ve id'yi yapıştır, sonra `wrangler deploy` tekrar.

### 7. Hane Finans uygulamasına bağla

`.env.local`'a ekle:

```
VITE_TEFAS_WORKER_URL=https://hane-finans-tefas.<senin-hesap>.workers.dev
```

Dev sunucuyu yeniden başlat. Artık fon detay sayfaları gerçek TEFAS NAV'ını gösterecek.

## Test

```powershell
curl https://hane-finans-tefas.<senin-hesap>.workers.dev/fund/TLY
```

Beklenen yanıt:
```json
{
  "code": "TLY",
  "fundName": "Türkiye Garanti Yatırım Hisse Senedi (TL) Fonu",
  "nav": 16.45,
  "perf": { "1 Ay": 14.87, "3 Ay": 22.31, ... },
  "allocation": [
    { "label": "Hisse Senedi", "pct": 82.5 },
    { "label": "Ters Repo", "pct": 12.3 }
  ],
  "fetchedAt": "2026-05-12T11:42:00Z"
}
```

## Sorun giderme

- **`Error: BROWSER binding not configured`** → Cloudflare Dashboard'da Worker'ın **Settings → Variables & Bindings**'ine git, "Browser Rendering" bağla
- **`Quota exceeded`** → günlük 10dk Chrome limiti — cache TTL'i artır (`wrangler.toml`'da)
- **Sayfa içeriği boş** → TEFAS selector'larını değişmiş olabilir; `worker.js` içindeki querySelector'ları güncelle
- **CORS hata** → Worker zaten `Access-Control-Allow-Origin: *` döner; tarayıcı cache'ini temizle

## Maliyet

- **Workers**: 100K istek/gün ücretsiz
- **Browser Rendering**: 10 dk/gün + 100 istek/gün ücretsiz
- Bizim app dakikada 1'den az istek atar → kota fazlasıyla yeter
- Kota aşılırsa $5/ay'a yükseltebilirsin

## Mimari

```
Hane Finans (browser)
   ↓ HTTPS
Cloudflare Worker (https://...workers.dev)
   ↓ Browser Rendering API
Headless Chrome (Cloudflare datacenter)
   ↓ JS + Akamai challenge çözümü
TEFAS sayfası
   ↑ HTML
Worker JSON üretir → cache'ler → döndürür
```
