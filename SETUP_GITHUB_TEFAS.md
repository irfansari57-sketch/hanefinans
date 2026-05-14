# 📊 TEFAS Gerçek Verisi — GitHub Actions Kurulum Rehberi

**Süre:** ~10 dakika • **Maliyet:** Tamamen ücretsiz • **Gereken:** Yalnızca GitHub hesabı

GitHub Actions her saat TEFAS'ı tarayıp JSON üretir, uygulamamız bunu okur. Cloudflare gerekmez.

---

## 🎯 Adım Adım Kurulum

### 1️⃣ GitHub hesabı

Yoksa: https://github.com/signup → e-posta, kullanıcı adı, şifre. (Ücretsiz, 1 dakika.)

Varsa: giriş yap.

---

### 2️⃣ Yeni repo oluştur

1. **https://github.com/new** adresine git
2. **Repository name:** `hanefinans-data` (veya istediğin başka bir isim)
3. **Public** seç (jsDelivr CDN public repolarda çalışır)
4. **✅ Add a README file** kutusunu işaretle
5. **Create repository** tıkla

Repo URL'in şuna benzeyecek:
`https://github.com/<KULLANICI-ADIN>/hanefinans-data`

---

### 3️⃣ Dosyaları yükle

Repon hazır. Şimdi **3 dosya** yüklemelisin. İki yol var:

#### Kolay yol — Web UI'dan tek tek

Repoda **"Add file" → "Upload files"** veya **"Create new file"** ile aşağıdaki dosyaları oluştur:

##### Dosya 1: `.github/workflows/tefas-scrape.yml`

"Create new file" → ad alanına **tam yol** olarak yapıştır:
```
.github/workflows/tefas-scrape.yml
```
İçerik için: `github-data-repo/.github/workflows/tefas-scrape.yml` dosyasının içeriğini kopyala-yapıştır.

##### Dosya 2: `scripts/requirements.txt`

"Create new file" → ad:
```
scripts/requirements.txt
```
İçerik:
```
tefas-crawler>=0.4.0
pandas>=2.0.0
requests>=2.31.0
```

##### Dosya 3: `scripts/scrape-tefas.py`

"Create new file" → ad:
```
scripts/scrape-tefas.py
```
İçerik için: `github-data-repo/scripts/scrape-tefas.py` dosyasının içeriğini kopyala-yapıştır.

Her dosya için **"Commit changes"** tıkla.

#### Hızlı yol — Git ile (ileri seviye)

```powershell
cd C:\Users\sirfa\OneDrive\Desktop\HaneFinans\github-data-repo
git init
git add .
git commit -m "initial setup"
git remote add origin https://github.com/<KULLANICI-ADIN>/hanefinans-data.git
git branch -M main
git push -u origin main
```

---

### 4️⃣ İlk taramayı manuel başlat

GitHub Actions ilk push'tan sonra ya da bekleyene kadar çalışmayabilir. **Manuel tetikleyelim:**

1. Repoda **Actions** sekmesine git (üst menüde)
2. Sol panelde **"TEFAS Scrape"** workflow'u
3. Sağda **"Run workflow"** mavi düğme → açılan kutudan **"Run workflow"** onayla
4. Workflow başlar (sarı dönen daire), ~2-3 dakika sonra yeşil ✓ olur
5. Çalışırken **logları izleyebilirsin** — `Fetching TLY...` gibi satırlar görmelisin

> **"Workflows aren't being run on this forked repository"** uyarısı görürsen: Actions sekmesinde sarı kutuyu okuyup **"I understand my workflows, go ahead and enable them"** tıkla.

---

### 5️⃣ Çıktıyı kontrol et

Workflow tamamlandıktan sonra:

1. Repoda **Code** sekmesi → **`data/`** klasörü oluşmuş olmalı
2. İçinde **`funds.json`** dosyası
3. Dosyayı aç → şu yapıda olmalı:

```json
{
  "updatedAt": "2026-05-12T14:05:00.000Z",
  "count": 30,
  "funds": [
    {
      "code": "TLY",
      "name": "Türkiye Garanti Yatırım Hisse Senedi (TL) Fonu",
      "nav": 16.4523,
      "date": "2026-05-11",
      "returns": { "1m": 14.87, "3m": 22.31, "ytd": 38.20, "1y": 78.45 }
    }
  ]
}
```

> `count: 0` görürsen tefas-crawler scraping başarısız demektir. Logları aç ve bana yapıştır, fix ederim.

---

### 6️⃣ CDN URL'ini al

GitHub raw URL yerine **jsDelivr CDN** kullanacağız (daha hızlı, no rate-limit):

```
https://cdn.jsdelivr.net/gh/<KULLANICI-ADIN>/hanefinans-data@main/data/funds.json
```

**Test et:** Bu URL'yi tarayıcıda aç → JSON görmelisin.

> jsDelivr GitHub değişikliklerini ~10 dakikada yansıtır. İlk push'tan sonra `?v=12345` ekleyerek (her seferinde değiştir) cache atlatabilirsin.

---

### 7️⃣ Hane Finans'a bağla

`C:\Users\sirfa\OneDrive\Desktop\HaneFinans\.env.local` dosyasını aç, en alta ekle:

```
VITE_TEFAS_GITHUB_URL=https://cdn.jsdelivr.net/gh/<KULLANICI-ADIN>/hanefinans-data@main/data/funds.json
```

Dev sunucuyu yeniden başlat (`Ctrl+C` → `npx vite --host`).

---

### 8️⃣ Doğrula

Tarayıcıyı **Ctrl+Shift+R** ile yenile:

- **Fonlar sayfası**: üstte yeşil rozet **"Canlı TEFAS verisi aktif (30 fon)"** + güncelleme zamanı
- **Bir fonun detayına tıkla** → büyük NAV kartı + 6 performans rozeti + fon büyüklüğü + yatırımcı sayısı (hepsi gerçek)
- **Ayarlar sayfasında** `TEFAS GitHub Feed` yanında yeşil ✓ "bağlı"

---

## 🔁 Sonrası

Workflow her saat otomatik çalışır. Sen hiçbir şey yapmana gerek yok.

- Repodaki **Actions** sekmesinden geçmiş tarama loglarını görebilirsin
- Cron'u değiştirmek için `.github/workflows/tefas-scrape.yml` dosyasındaki `cron: '5 * * * *'` satırını düzenle (örn. `'5 6,12,18 * * *'` günde 3 kez)

---

## ❓ Sorun giderme

| Sorun | Çözüm |
|---|---|
| Actions sekmesi yok | Repo Settings → Actions → General → "Allow all actions" |
| Workflow çalışıyor ama 0 fon geliyor | tefas-crawler kütüphanesinin son versiyonu için bana logu yapıştır |
| `Permission denied` push hatası | Settings → Actions → General → Workflow permissions → "Read and write permissions" |
| jsDelivr URL'i 404 | `?v=YENI` parametre ekleyip dene; veya github raw URL'i kullan: `https://raw.githubusercontent.com/.../main/data/funds.json` |
| Uygulamada hala mock görünüyor | LocalStorage cache 5 dk. Ayarlar → "Önbellek + watchlist sıfırla" |

---

## 🧪 Şu an dene

Kurulumu yapmadan önce bile, bu projeyi **public** bir repo olarak fork eden var mı diye github.com'da `hanefinans-data` araması yapabilirsin. Topluluk feed'i varsa direkt onun URL'ini kullanabilirsin.

Adım 1-5'i tamamladıktan sonra **CDN URL'i bana yapıştır**, .env.local'a ekleyip restart edeyim. Veya hata mesajını paylaş, debug ederim.
