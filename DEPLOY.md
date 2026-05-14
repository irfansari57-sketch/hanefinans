# 🚀 Hane Finans — Canlıya Alım Rehberi

**Hedef:** `hanefinans.net` adresinde sitenin yayında olması
**Süre:** ~30 dakika (ilk kurulum), sonraki güncellemeler 2 dk

**Yol:** Cloudflare Pages (ücretsiz, otomatik HTTPS, edge-CDN, Türkiye'ye yakın sunucular)

---

## 📋 Önkoşullar (zaten elindekiler)

- ✅ `hanefinans.net` (Squarespace'te kayıtlı)
- ✅ Cloudflare hesabı (önceden açtın)
- ✅ Çalışan kod (`C:\Users\sirfa\OneDrive\Desktop\HaneFinans`)

## 📋 Yeni edinmen gerekenler

- 🆕 GitHub hesabı (varsa atla)

---

## 1️⃣ ADIM — GitHub'a kod yükle (~10 dk)

Cloudflare Pages, GitHub'dan otomatik deploy yapar. Kodu repoya yüklemek gerek.

### 1.1 GitHub hesabı
- Yoksa: https://github.com/signup → email + şifre + kullanıcı adı

### 1.2 Yeni repo aç
1. https://github.com/new
2. **Repository name:** `hanefinans` (önerilen)
3. **Private** seç (kodun gizli kalsın — API anahtarları .env.local'da değil bile olsa kodun gizli olsun istersin)
4. **README, .gitignore, lisans EKLEME** — boş başlasın
5. **Create repository** tıkla

GitHub sana komutları gösterecek, bunları kullanma — aşağıdakileri kullan:

### 1.3 Yerel kodu git'le bağla

PowerShell aç:

```powershell
cd C:\Users\sirfa\OneDrive\Desktop\HaneFinans

# Git başlat (zaten varsa yine de zarar vermez)
git init
git branch -M main

# .gitignore zaten doğru — .env.local commit edilmez
git add .
git commit -m "İlk yayın"

# Senin GitHub URL'in (KULLANICI_ADI'nı değiştir)
git remote add origin https://github.com/KULLANICI_ADIN/hanefinans.git
git push -u origin main
```

> Kullanıcı adı/şifre sorarsa: GitHub artık şifre yerine **Personal Access Token** kullanıyor.
> https://github.com/settings/tokens → "Generate new token (classic)" → repo izinleri seç → 90 gün → kopyala.
> Şifre yerine bu token'ı yapıştır.

Repon `https://github.com/<KULLANICI_ADIN>/hanefinans` adresinde görünür olmalı.

---

## 2️⃣ ADIM — Cloudflare Pages projesi oluştur (~5 dk)

### 2.1 Cloudflare Dashboard
1. https://dash.cloudflare.com → giriş yap
2. Sol menü: **Workers & Pages**
3. **Create application** → **Pages** sekmesi → **Connect to Git**

### 2.2 GitHub bağlantısı
1. **GitHub'ı yetkilendir** — pop-up'ta onayla
2. Repository listesinde `hanefinans` seç → **Begin setup**

### 2.3 Build yapılandırması
- **Project name:** `hane-finans` (URL'i bu olacak: hane-finans.pages.dev)
- **Production branch:** `main`
- **Framework preset:** **Vite** (otomatik bulur)
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root directory:** boş bırak

### 2.4 Environment variables (build için)
Aşağıyı genişletip ekle. **Plaintext** olarak:

| Variable | Value |
|---|---|
| `VITE_TWELVEDATA_KEY` | `ebb26064c1154fe094f7370ec552a10b` |
| `VITE_GNEWS_KEY` | `5c4ddc08bffa3d26cd009ea7beb94e37` |
| `VITE_GOLDAPI_KEY` | `goldapi-12e53f90815ec100c2ad94e10236e8ef-io` |
| `VITE_TELEGRAM_CHAT_ID` | `1016691630` |

### 2.5 Deploy
- **Save and Deploy** tıkla
- ~2-3 dakika bekle, build loglarını izle
- Yeşil ✓ olunca site `https://hane-finans.pages.dev` adresinde canlı

### 2.6 Server-side secrets (function'lar için)
**Settings → Environment variables → Production:**

| Variable | Value | Type |
|---|---|---|
| `TCMB_API_KEY` | `lT4irjYOXr` | **Encrypted** |
| `TELEGRAM_BOT_TOKEN` | `8624595740:AAE7bFW4QvAfW5jyr5cjZcb29H0tYOEdGNU` | **Encrypted** |

Bunlar **Encrypted** (şifreli) olmalı — frontend görmez, sadece Pages Functions kullanır.

Sonra: **Deployments → ⋯ menu → Retry deployment** (env güncellemesi için tekrar deploy).

---

## 3️⃣ ADIM — Test et (5 dk)

1. `https://hane-finans.pages.dev` aç
2. Tüm sayfaları gez:
   - Panel — BIST 100, döviz, emtia canlı mı?
   - Günlük Analiz — endeks TA çalışıyor mu?
   - Watchlist — hisse fiyatları geliyor mu?
3. Ayarlar → **Telegram Test** → buton tıkla → mesaj geldi mi?
4. Hata varsa **Cloudflare → Pages → hane-finans → Functions** sekmesinden logları gör

> **Yahoo Finance gelmiyorsa:** Functions logunda hata var demektir. Sıkça olan: Pages Functions Yahoo'yu zaman zaman blocklayabilir (data center IP). Bu durumda /api/yahoo logunu paylaş, sana özel fix verirsem.

---

## 4️⃣ ADIM — `hanefinans.net` bağlantısı (15 dk)

### 4.1 Cloudflare Pages > Custom Domain
1. **hane-finans** projesinde **Custom domains** sekmesi
2. **Set up a custom domain** tıkla
3. `hanefinans.net` yaz → Continue
4. Cloudflare sana **CNAME** veya **A** kayıtları gösterir — bu değerleri NOT AL:
   - Genelde: CNAME hedefi `hane-finans.pages.dev`
   - Apex (kök) domain için: A kaydı (Cloudflare IP'leri) veya ANAME/ALIAS
5. **www.hanefinans.net** için aynı işlem (CNAME → hane-finans.pages.dev)

### 4.2 Squarespace'te DNS güncelle
1. https://account.squarespace.com → Domains → `hanefinans.net`
2. **DNS Settings** veya **Manage Domain → DNS**
3. **Mevcut Squarespace kayıtlarını sil** (A, CNAME — Squarespace website'i göstermesin)
4. Cloudflare'in verdiği kayıtları ekle:

**A kayıtları (apex domain için):**
```
Type: A    Host: @    Value: <Cloudflare IP 1>
Type: A    Host: @    Value: <Cloudflare IP 2>
```

**CNAME kaydı (www için):**
```
Type: CNAME    Host: www    Value: hane-finans.pages.dev
```

5. **Kaydet**

### 4.3 Bekle
- DNS propagation: **5 dakika ile 24 saat** arası (genelde 15 dk)
- Cloudflare Pages dashboard'da domain karşısında yeşil ✓ olunca tamam
- HTTPS otomatik kurulur (ekstra iş yok)

### 4.4 Test
- `https://hanefinans.net` aç → sitenle açılmalı
- `https://www.hanefinans.net` da çalışmalı

---

## 5️⃣ ADIM — Güncellemeler (sonraki günler)

Kodda değişiklik yapınca:

```powershell
cd C:\Users\sirfa\OneDrive\Desktop\HaneFinans
git add .
git commit -m "Yeni özellik X"
git push
```

Cloudflare otomatik algılar, ~2 dakikada canlıya alır.

---

## 🚨 Sorun giderme

| Sorun | Çözüm |
|---|---|
| Build hata: "tsc -b failed" | Yerel olarak `npx tsc -b` çalıştır, hatayı düzelt, tekrar push |
| Site açılıyor ama API'ler 503 | Settings → Env variables → TCMB_API_KEY, TELEGRAM_BOT_TOKEN eklenmiş mi? |
| DNS 24 saat geçti hala bağlanmadı | https://dnschecker.org → hanefinans.net → propagation durumunu kontrol et |
| Cloudflare → "domain already in use" | Başka bir Cloudflare hesabında bağlı. Squarespace'te kaydı sil + tekrar dene |
| Squarespace DNS değiştirmiyor | Domain Squarespace'te kayıtlı mı, Squarespace Website'i mi? Sadece domain ise DNS değiştirilebilir |
| Telegram test çalışmıyor canlıda | TELEGRAM_BOT_TOKEN Encrypted olarak eklendi mi? Production deployment retry yaptın mı? |

---

## 💰 Maliyet

- **Cloudflare Pages:** Tamamen ücretsiz (sınırsız sayfa görüntüleme + 500 build/ay)
- **Cloudflare Pages Functions:** Tamamen ücretsiz (100K istek/gün)
- **Domain (hanefinans.net):** Squarespace'te zaten ödenmiş (~₺300/yıl)
- **SSL sertifikası:** Cloudflare ücretsiz

**Toplam ek maliyet: ₺0**

---

## 🎯 Üretim sonrası ilk işler

1. ✅ Site canlı: `https://hanefinans.net`
2. 📱 PWA olarak telefona kur: Chrome → ⋮ → **Ana ekrana ekle**
3. 📊 Cloudflare Analytics aç (ücretsiz) → kullanıcı sayısını izle
4. 🔐 İlerleyen aşamada Supabase Auth migration (gerçek üye sistemi için)
5. 💳 Iyzico entegrasyonu (PRO ödemelerini almak için)
6. 📣 İlk kullanıcıları getir: Twitter, LinkedIn, YouTube'da paylaş

---

**Bu rehberde takıldığın adımı söyle, yardım edeyim.** Özellikle:
- Adım 1.3 (git push'ta token sorusu)
- Adım 2.3 (build yapılandırması)
- Adım 4.2 (Squarespace DNS değiştirme)
en sık sorun çıkan yerler.
