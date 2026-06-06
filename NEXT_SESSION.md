# Hane Finans — Sonraki Seans Yol Haritası

> Son güncelleme: 2026-06-07 (Pazar gece) — son seans 12+ saatlik intensive çalışma
>
> **Bu seansta TAMAMLANDI:**
> - ✅ Premium 3 sütun Piyasa Özeti (turkuaz + 3D depth)
> - ✅ Fon Havuzu tier-paywall (anon=5, free=10, pro=tümü)
> - ✅ Ekonomik takvim Mayıs TÜFE 06-05 + Tem/Ağu/Eyl/Eki/Kas TÜFE entries
> - ✅ BES bilgilendirme 6→12 kez fon değişim + Katılım Emeklilik
> - ✅ BES Calculator default değerler (katkı 10%, yönetim 1%, FİGK 0.5%, BAU 5%, senaryo 1/5/8)
> - ✅ multiTimeframe MA → EMA + spot fiyat çelişkisi bug fix
> - ✅ RouteErrorBoundary mobile cache temizle butonu
> - ✅ TÜRKPATENT marka değerlendirmesi
> - ✅ Kıymetli metal **gerçek Cuma kapanış değeri** (GoldAPI/MetalsAPI chain)
> - ✅ Emtialar sayfası Panel ile veri tutarlılığı
> - ✅ Sol menü Piyasalar sıralaması (Fonlar→Hisseler→Emtialar→Döviz→…)
>
> **AÇIK İŞLER:**
> - ⏳ Paladyum yüzde değişimi yanlış (Yahoo PA=F bug) → ÖNCELİK 0
> - ⏳ Yapısal + Premium UI/UX upgrade serisi (B1-B10)
> - ⏳ Finhane rebrand (TÜRKPATENT vekil görüşü gelince)
> - ⏳ Cowork Plugin 8 skill

---

## 🎯 ÖNCELİK 0 — Paladyum Veri Kaynağı Çözümü (kısa)

**Sorun:** Yahoo `PA=F` futures için `previousClose` Cuma değil daha eski bir günü dönüyor. Bu yüzden yüzde değişimi yanlış (+1.32% gösteriyor, gerçek -5.35%).

**MetalsAPI denendi:** Free tier yok, en ucuz $199/yıl. Uygun değil.

**Sonraki seansta denenecek alternatifler (sıralı):**

1. **Stooq XPDUSD spot** — frontend doğrudan veya backend `/api/spot-metals` endpoint'inde sıralı denenir. Stooq ücretsiz, key gerektirmez. Hafta sonu freeze sorunu olabilir ama Paladyum için yine de en iyi opsiyon.

2. **GoldAPI'ye XPD eklenir** (mevcut key 100/ay sınırı içinde):
   - Cache 24 saat → günde 1 call × 4 metal (XAU/XAG/XPT/XPD) × 30 gün = **120 call/ay** ← limit aşar
   - Cache 36 saat → 80/ay ← limit içinde, ama market saatleri kaçırılır
   - **Çözüm:** Hafta içi 6 saat cache (4/gün), hafta sonu 12 saat cache (2/gün) → 4 metal × (5×4 + 2×2) gün = **96/ay** ✓
   - **TEST:** GoldAPI'nin XPD desteklediği doğrulanmalı (response'da `price` alanı dolu mu)

3. **TwelveData XPD/USD** — `fetchMetalSpotTD('XPD/USD')` tarzı. TD free 800/gün. Genelde XPD destekli, doğrulanmalı.

4. **Stooq backend proxy** — `functions/api/spot-metals.ts`'i yeniden aktif et, Cloudflare Workers'tan Stooq 502 sorunu için **User-Agent + Accept** header'larını tweakle. Eğer çalışırsa diğer 3 alternatife gerek yok.

**Yapım sırası:** Önce (1) Stooq direct dene — bir HTTP isteği, key yok. Çalışırsa bitir. Çalışmazsa (3) TwelveData, en son (2) GoldAPI XPD.

**Toplam tahmini süre:** 30-45 dakika.

---

## 🎯 ÖNCELİK 1 — Premium UI/UX Genelleme (B-serisi devam)

Geçen seansta Piyasa Özeti'nde uygulanan **3D kart depth + turkuaz etiket** stili tüm sayfalara yaygınlaştırılacak. Aşağıdaki sırayla:

### B1 — `<PremiumCard>` standart bileşeni (30 dk)

Mevcut MarketSummaryPremium'daki gradient + uzun gölge + inset highlight + hover translate stillerini bir reusable component'e çıkar:

```tsx
// src/components/ui/PremiumCard.tsx
<PremiumCard accent="cyan" hover="lift">
  {children}
</PremiumCard>
```

Variants:
- `accent`: `'cyan' | 'warning' | 'success' | 'danger' | 'fuchsia' | 'slate'`
- `hover`: `'lift' | 'glow' | 'none'`
- `density`: `'compact' | 'comfortable'`

### B2 — Sayfa-sayfa premium pass (60 dk)

Tüm liste/grid kartlarını `<PremiumCard>`'a çevir:

- **Öneriler sayfası** — Fon Havuzu satırları, Strong Buy kartları, Algoritmik card
- **Hisseler/Fonlar sayfaları** — TopMovers, summary cards, watchlist items
- **Panel** — Takip Listem, AI Agent kartları, top movers detaylar
- **Oyunlarım** — Bugünün Lideri, Quiz, Sembol Bulmaca kartları
- **Watchlist** — Stock row, Fund row
- **Alarmlarım** — Alarm card
- **Portföyüm** — Portfolio row + summary cards

### B3 — Tipografi premium pass (20 dk)

- Headings için **Inter Variable Font** zaten var; opsiyonel `Manrope` veya `Space Grotesk` heading testi
- Sayısal değerlerde `tabular-nums` denetimi (bazı yerler eksik)
- Letter-spacing: -0.02em başlıklar, +0.02em uppercase etiketler
- Mobile font scaling — başlıklarda 16px-22px responsive

### B4 — Mikro-etkileşim (30 dk)

- Sayfa geçişlerinde **fade-in animation** (200ms)
- Liste satırlarında **stagger** (50ms aralık) — ilk render'da
- Buton tıklamada `scale-95` press feedback
- Toast bildirimleri slide-up + auto-dismiss
- Shimmer skeleton tüm sayfalara (mevcut bazı yerlerde eksik)

### B5 — Loading + Empty state cleanup (20 dk)

- **Mock kalıntı taraması** — hiçbir yerde `15.133`, `6.890` gibi sahte rakam kalmasın
- Boş kartlar için **"nasıl doldurulur"** ipucu (Watchlist'te zaten var, Alarmlarım/Portföyüm'e yaygınlaştır)
- Skeleton'lar gerçek layout'u yansıtsın

### B6 — Header + Navigation polish (40 dk)

- Sol sidebar **gradient bg** + brand alanı (logo + "Financial Intelligence" daha premium)
- Üst search bar geniş + auto-complete dropdown polish
- Active route indicator **glow** efekti (mevcut sol mavi çubuk yerine)
- Tema toggle + bildirim + profil avatar daha kompakt

**Toplam B serisi tahmini:** 3-4 saat. Bir seansta hepsi yapılabilir.

---

## 🎯 ÖNCELİK 2 — Yapısal İyileştirme (A-serisi)

### A1 — Performans (45 dk)
- Image `loading="lazy"` denetimi
- Critical CSS inlining (FCP < 1s)
- SW cache stratejisi — stale-while-revalidate doğrulama
- Code-split: BESCalculator lazy chunk
- Lighthouse mobile skoru 90+ hedef

### A2 — SEO + Meta (30 dk)
- Tüm sayfalarda `<SeoHead>` tutarlılık
- `og:image` özelleştirme (panel/öneriler/hisseler/fonlar/BES)
- `schema.org/FinancialService` JSON-LD
- Sitemap.xml + robots.txt + canonical doğrulama

### A3 — a11y (30 dk)
- `aria-label` denetimi
- Klavye nav (tab order, focus ring)
- Renk kontrastı WCAG AA (özellikle `text-slate-500`)
- Heading hiyerarşisi semantik

### A4 — Mobile-first review (60 dk)
- 360 / 414 / 768px breakpoint testleri
- Dokunma hedefi min 44×44px
- Bottom sheet pattern
- iOS safe-area-inset

---

## 🎯 ÖNCELİK 3 — Cowork Plugin (Anthropic Marketplace)

Mevcut `hanefinans-plugin/` klasörü hazır, manifest var. Eksik:

- 8 skill'in markdown frontmatter + procedure (bist-snapshot bir tane var)
- Slash commands (`/finhane:brief` vb.)
- `marketplace.json` + README + LICENSE
- Test deployment

**Skill listesi (planlanmış):**
1. `bist-snapshot` (✅ var)
2. `hisse-deep-dive` — hisse derin analiz
3. `fon-onerisi` — kategori bazlı fon önerisi
4. `bes-hesapla` — emeklilik birikim projeksiyonu
5. `gunluk-brief` — sabah özeti
6. `ai-screener` — natural language ile hisse tarama
7. `alarm-kur` — şartlı alarm oluşturma
8. `portfoy-analiz` — portföy risk + getiri

**Toplam tahmini:** 2 saat.

---

## ⏸️ ASKIDA — Finhane Rebrand

> TÜRKPATENT marka vekili görüşü gelene kadar bekletildi.
> Karar:
> - "Hane Finans" tescil ret riski **%30-40** (jenerik+tanımlayıcı)
> - Logoyla figüratif tescil **%50-60** kabul
> - Vekil görüşü almadan başvurma — başvuru ücreti boşa gider

Vekil "yüksek risk" derse → Finhane'e geç (mevcut rebrand planı NEXT_SESSION'da korunuyor).

---

## 🎯 ÖNCELİK 4 — Mini İyileştirmeler (sıraya konulacak)

- **Piyasa Özeti sparkline** — her satıra son 30 gün mini grafik
- **24 saat hacim** — kripto + hisse kartlarına hover'da tooltip
- **Hisse Smart Spotlight** — günün öne çıkan hissesi widget
- **Geçmişte Bugün** — TR borsa tarihi from-DB
- **AI Tahmin Doğruluk Skoru** — geçmiş tahminlerin yüzdesi
- **Push notifications** — alarm + brief (mevcut backend var, frontend eksik)

---

## 🎯 ÖNCELİK 5 — Hazır olunca yapılacaklar

- **Finhane Asistan sticky chat** (Elite premium) — sayfanın sağ alt köşesinde sticky AI sohbet
- **Domain alımları** (Hane Finans için TR/COM/COMTR savunma)

---

## 📋 ÖNERİLEN BAŞLANGIÇ SIRASI (sonraki seans)

```
1. Paladyum veri (30-45 dk) ← ÖNCE BİTİR
2. B1 PremiumCard component (30 dk)
3. B2 sayfa-sayfa premium pass (60 dk)
4. B4 mikro-etkileşim (30 dk)
5. B5 loading/empty cleanup (20 dk)
6. A2 SEO (30 dk)
7. A1 Performans Lighthouse (45 dk)
8. (Bonus eğer vakit kalırsa) B6 Header polish
```

**Toplam:** ~4 saat çekirdek iş, kullanıcıya **kesin görünür** premium upgrade'le biter.

---

## 🚨 ÖNCELİK 0 — Kıymetli Metal Hafta Sonu Veri Sorunu (KESİN ÇÖZÜM — ÇÖZÜLDÜ ✅)

**Mevcut sorun:** Panel'de Ons Altın `$4,365.3 +0.65%` ve Ons Gümüş `$69.1 +0.23%` Cuma sabahki değerlerde donmuş — gerçek Cuma kapanış `$4,317.93 -3.29%` ve `$68.29 -7.51%`.

**Geçen seansta denenen ama yetmeyen şeyler:**
- Backend Stooq + Yahoo proxy fallback eklendi → 502 attı (Cloudflare Workers'tan outbound engellendi)
- Frontend per-metal stale check eklendi → işe yaradı ama fallback chain kırıktı
- Yahoo XAUUSD=X spot → Yahoo Finance bu sembolü **desteklemiyor** (404)
- TwelveData → 429 rate-limit (free tier tükenmiş)

**SONRAKİ SEANS — sistemli yaklaşım:**

### Faz 1 — Tanı (15 dk)

1. **Cloudflare Pages Functions Logs** — `dash.cloudflare.com` → hanefinans → Functions → Real-time logs → spot-metals endpoint çağrısı yapıp **gerçek runtime exception**'ı gör. 502 ataşıyor sebep net olmalı.
2. **Frontend Network tab** — Hangi URL'ler hangi status dönüyor:
   - `/api/yahoo/snapshot?...` (BIST için çalışıyor, metal için de çalışıyor mu?)
   - `/api/yahoo/v8/finance/chart/GC=F` (Comex altın futures — 200 mü 404 mü?)
   - `/api/yahoo/v8/finance/chart/SI=F` (Comex gümüş futures)
3. **Manuel curl** — Cloudflare Worker'dan değil, normal browser'dan: `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=5d&interval=1d` → 200 mi 403 mü?

### Faz 2 — Çok Kaynaklı Backend (45 dk)

Cloudflare Workers'tan tek kaynağa (Stooq) bağımlı kalmak başarısız oldu. Sıralı 5 kaynak deneme:

```typescript
// functions/api/spot-metals.ts — yeni mimari
async function fetchAllMetals() {
  // 1. GoldAPI.io — free 50 req/month, very reliable spot
  //    https://www.goldapi.io/dashboard (free key al)
  const goldapi = await tryGoldApi();
  if (goldapi.complete) return goldapi;

  // 2. Metals-API.com — free 50 req/day
  //    https://metals-api.com/
  const metalsapi = await tryMetalsApi();
  if (metalsapi.complete) return metalsapi;

  // 3. Stooq XAUUSD/XAGUSD/XPTUSD — eski yöntem
  const stooq = await tryStooq();
  if (stooq.complete) return stooq;

  // 4. Yahoo futures GC=F/SI=F/PL=F — Yahoo'da kesin var, futures
  const futures = await tryYahooFutures();
  if (futures.complete) return futures;

  // 5. D1'de saklanan SON KESİN BİLİNEN Cuma kapanış değeri
  //    Cron job Cuma 23:00 NY'de günceller (aşağıda)
  const d1Backup = await loadD1Backup();
  return d1Backup;
}
```

**Aksiyon:**
- [ ] GoldAPI.io ücretsiz hesap aç, API key al → `wrangler secret put GOLDAPI_KEY`
- [ ] Metals-API.com ücretsiz hesap aç, API key al → `wrangler secret put METALSAPI_KEY`
- [ ] Backend'i 5 kaynaklı yaz, hangi kaynak çalışırsa `X-Source` header'ında belirt

### Faz 3 — D1 "Son Kesin Kapanış" Cron Warmer (30 dk)

**Konsept:** Cuma 23:30 ET (TR: Cumartesi 06:30) GitHub Actions cron çalışır → Yahoo'dan/GoldAPI'dan Cuma kapanış değerini çekip D1'e yazar. Pazartesi sabaha kadar bu cache'ten servis eder.

```yaml
# .github/workflows/metal-eod-warmer.yml
name: Metal EOD Warmer
on:
  schedule:
    - cron: '30 3 * * 6'  # Her Cumartesi 03:30 UTC (06:30 TR)
jobs:
  fetch-eod:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST https://hanefinans.net/api/admin/warm-metals \
            -H "Authorization: Bearer $WARMER_TOKEN"
```

Backend `/api/admin/warm-metals` GoldAPI/Yahoo'dan Cuma close değerlerini çekip D1'e yazar. `bundleUpdatedAt` = Friday close timestamp olarak set edilir.

### Faz 4 — UI Defensive Mod (15 dk)

Frontend `MarketSummaryPremium.tsx`'te:

```tsx
const isMarketClosed = isWeekend() && metal.key.includes('Ons');
const closeBadge = isMarketClosed ? (
  <span className="text-[9px] text-slate-500 italic">
    📅 Cuma kapanış
  </span>
) : null;
```

Hafta sonu metallerde "Cuma kapanış" rozeti gösterilir → kullanıcı `+0.65%` görünce yanıltıcı sanmasın, kapanış değeri olduğu net anlaşılır.

### Faz 5 — Test Etme (15 dk)

- Cloudflare Functions Logs real-time'da endpoint'i hit et, X-Source kontrol
- Browser cache temizle + Panel kontrol
- Hafta sonu test için: zaman manipülasyonu (DevTools'tan Cumartesi seç) → "Cuma kapanış" rozeti görünmeli

### Toplam tahmini süre: **2 saat** (tanı + 5 kaynak + cron + UI + test)

### Bu seans yapılması gereken hazırlıklar (kullanıcı):
1. GoldAPI.io ücretsiz hesap aç → API key kaydet
2. Metals-API.com ücretsiz hesap aç → API key kaydet
3. Cloudflare Pages Functions Logs'a girip nasıl bakılacağını gör

---

## 🎯 ÖNCELİK 1 — Yapısal İyileştirme + Premium Görünüm

### A — Yapısal İyileştirmeler

**A1. Performans & Yükleme:**
- Image lazy-load + `loading="lazy"` tüm `<img>` etiketlerinde
- Critical CSS inlining (FCP < 1s hedefi)
- SW cache stratejisi gözden geçirme — stale-while-revalidate
- Code-split: BESCalculator sadece literacy'de yüklensin (lazy chunk)
- Lighthouse mobile skoru ölçüm + 90+ hedefi

**A2. SEO + Meta:**
- Tüm sayfalarda `<SeoHead>` tutarlılık denetimi
- `og:image` özelleştirmesi her ana sayfa için (panel/öneriler/hisseler/fonlar/BES)
- `schema.org/FinancialService` JSON-LD ekle (kuruluş + ürün şeması)
- Sitemap.xml otomatik üretimi (route'lardan)
- robots.txt + canonical doğrulama

**A3. Erişilebilirlik (a11y):**
- Tüm interaktif elemanlara `aria-label` denetimi
- Klavye navigasyonu (tab order, focus ring görünür mü)
- Renk kontrastı WCAG AA (özellikle slate-500 metin üzerine)
- Screen reader: semantik heading hiyerarşisi (`<h2>`, `<h3>`)
- Form field'ları `<label>` ile bağlı mı

**A4. Mobile-first review:**
- Her sayfa 360 / 414 / 768px breakpoint'lerinde elden geç
- Dokunma hedefi min 44×44px (Apple HIG)
- Bottom sheet pattern (filter modal vb.)
- iOS safe-area-inset (notch desteği)

**A5. Veri güvenilirliği:**
- TEFAS scraper monitoring — son güncelleme tarihi UI'da göster
- BIST snapshot hata fallback (Yahoo proxy down → demo değil "veri yok" rozeti)
- Sentry telemetri düzenli incele
- Watchlist senkronizasyonu D1'e (şu an localStorage, login'de kayboluyor)

**A6. Backend stabilizasyon:**
- Workers günlük rate-limit metrikleri
- D1 yavaş sorgu tespit (EXPLAIN)
- KV cache hit-ratio izleme
- Cron job retry stratejisi (TEFAS workflow gibi)

### B — Premium Görünüm (UI/UX)

**B1. Kart depth standardı:**
- Piyasa Özeti'ndeki 3D efekti (`<PremiumCard>` standardı) tüm kartlara yaygınlaştır
- Öneriler, Hisseler, Fonlar, Watchlist, Tahmin, Oyunlar — hepsi
- Hover'da `-translate-y-0.5` mikro-yükseliş tutarlı

**B2. Tipografi premium:**
- Headings için display font denemesi (Manrope veya Space Grotesk)
- Tüm sayısal değerlerde `tabular-nums`
- Tracking: -0.02em headings, +0.02em uppercase etiketler

**B3. Renk paleti zenginleştirme:**
- İkincil aksan (fuchsia) sistemli yaygınlaştır
- Badge tonu doygunlaştır (`/15` → `/20`)
- Border `slate-700/30` → `/40` (daha belirgin)
- Glassmorphism: sidebar + nav `backdrop-blur-xl`

**B4. Mikro-etkileşim:**
- Sayfa geçişlerinde fade-in (200ms)
- Liste satır stagger (50ms)
- Buton tıklama `scale-95` press feedback
- Toast slide-up + auto-dismiss
- Shimmer skeleton tüm sayfalara

**B5. Loading + Empty state:**
- Mock kalıntı tarama (15.133, 6.890 vb. kalmasın)
- Boş kartlar için "nasıl doldurulur" ipucu
- Skeleton gerçek layout'u yansıtsın

**B6. Header + Navigation refresh:**
- Sol sidebar gradient + brand alanı (logo + motto) premium
- Üst search bar geniş + auto-complete polish
- Active route: glow indicator
- Tema toggle + bildirim + profil kompakt

**B7. Marka kimliği polish:**
- "Hane Finans" logo daha modern (minimalist bina+grafik)
- "Financial Intelligence" alt yazı tipografi
- Favicon yeni logoya göre
- Apple touch icon + maskable + 512x512 PWA icon

**B8. Hisse/Fon detay premium:**
- Multi-timeframe kartı üst kısma
- Yorum bölümü sticky scroll
- Action buton grup (Alarm/Watchlist/Paylaş) sağ alt sticky pill
- AI summary üst banner (preview, ücretsiz)

**B9. Form premium:**
- Input: focus ring + border highlight kombinasyonu
- Select dropdown custom (default yerine)
- Slider track+thumb tutarlı (BES'teki gibi)
- Toggle switch iOS tarzı

**B10. Onboarding:**
- 3 ekranlı onboarding (Watchlist → Alarm → Brief)
- Sample data dolu görünüm
- Welcome modal dismissable, az müdahaleci

### C — Önerilen yapım sırası

1. **B1 (Kart depth standardı)** → hızlı premium hissi yayımı
2. **B5 (Loading + Empty)** → mock kalıntı temizliği güven artırır
3. **A2 (SEO)** → trafik temeli
4. **B4 (Mikro-etkileşim)** → his değişimi büyük
5. **A1 (Performans)** → Lighthouse skoru
6. **B6 (Header+Nav)** → sürekli görünen alan, en çok ROI
7. Diğerleri zamanla

---

## ⏸️ ASKIDA — Finhane Rebrand

> TÜRKPATENT marka vekili görüşü gelene kadar bekletildi.
> Vekil "Hane Finans yüksek risk" derse → Finhane'e geç
> Orta/düşük risk derse → mevcut isimle devam, sadece logo polish

Önceki rebrand planı aşağıda korunuyor (referans).

---

## (referans — eski rebrand planı)

---

## 🚨 SONRAKİ SEANS — Finhane Rebrand (Acil + Kapsamlı)

> Marka: **Finhane**
> Motto: **"Finans Yuvanız"**
> Domain: `finhane.net` (alternatif: finhane.com, finhane.com.tr)
> Email: `info@finhane.net` veya `destek@finhane.net`

### Faz 1 — Marka Kimliği (Hazırlık, kod öncesi)

**1.1 Domain alımı (önce yapılacak):**
- `finhane.net` müsait mi kontrol et — istenen 1. tercih
- `finhane.com` ve `finhane.com.tr` da al (savunma + Türkiye TLD)
- Nameserver Cloudflare'e bağla

**1.2 Tescil:**
- TÜRKPATENT'e Finhane marka tescil başvurusu (sınıf 36 — finansal hizmetler)
- ~1.500-3.000 TL başvuru ücreti
- ~6-12 ay süre (paralel olarak ürün geliştirilebilir)

**1.3 Logo + Görsel:**
- Mevcut Hane Finans logo'su (`Logo.tsx`) **kelime mark** içeriyor — yeniden tasarlanacak
- "FİNHANE" wordmark + sembolik element (ev + grafik birleşimi → "yuva" çağrışımı)
- Renk paleti: Mevcut accent rengi korunabilir (cyan/teal)
- Favicon + PWA icon (192x192, 512x512) yeniden üret

**1.4 Tagline / iletişim dili:**
- Ana motto: **"Finans Yuvanız"** (tüm sayfa altbilgilerine + meta description'lara)
- Alt mottolar:
  - "BIST, fon, kripto — hepsi tek yuvada"
  - "Türkiye'nin AI destekli finans asistanı"
- Tone: sıcak + güvenilir + akıllı (yuva = ev = aile + sıcaklık)

### Faz 2 — Kod Refactor (Tüm sayfa metinleri)

**2.1 Find & Replace seansı:**
- `"Hane Finans"` → `"Finhane"` (case-sensitive)
- `"HANE FİNANS"` → `"FİNHANE"`
- `"hane finans"` → `"finhane"`
- `"hanefinans"` → `"finhane"` (URL slug, identifier)
- `"@hanefinans"` → `"@finhane"`

**2.2 Etkilenecek dosyalar (kritik):**
- `src/app/Layout.tsx` — header/footer
- `src/components/brand/Logo.tsx` — wordmark + svg
- `src/components/brand/BrandingBlock.tsx` — sidebar branding
- `src/components/seo/SeoHead.tsx` — default meta title/description
- `index.html` — `<title>`, og:title, og:description
- `public/manifest.json` veya `manifest.webmanifest` — PWA name, short_name
- `public/_headers` — CSP report-uri (yeni domain)
- `src/data/services.ts` — cache prefix `fa.service.v7.` → `fh.service.v8.` (schema bump)
- `src/lib/usePersistedState.ts` — schema version bump
- `src/lib/usePinnedSection.ts` — pin key namespace
- Tüm `localStorage.setItem('fa.*')` → `fh.*` (200+ key)
- Tüm `localStorage.getItem('fa.*')` → eski + yeni dual-read (3 deploy boyunca)

**2.3 Backend / Cloudflare:**
- `cloudflare/yahoo-warmer/wrangler.toml` — worker adı `hane-finans-yahoo-warmer` → `finhane-yahoo-warmer`
- `functions/_push.ts` — VAPID subject `mailto:haneassistance@gmail.com` → `mailto:destek@finhane.net`
- `functions/api/cron/daily-report.ts` — telegram bot mesajları "Hane Finans" → "Finhane"
- `functions/api/cron/daily-brief.ts` (kaldırılmıştı) — uygulanmaz
- `functions/api/ai/deep-analyze.ts` — prompt'taki marka adı (varsa)

**2.4 GitHub Actions workflows:**
- Repo rename: `hanefinans` → `finhane`
- `.github/workflows/*.yml` — repo URL'leri otomatik güncellenir
- Cron URL'leri — `https://hanefinans.net/api/cron/*` → `https://finhane.net/api/cron/*`
- secrets güncellemesi (CRON_SECRET değişmesin)

**2.5 Email migrasyonu:**
- `haneassistance@gmail.com` aktif kalsın (forward kurulur)
- Yeni: `info@finhane.net`, `destek@finhane.net`, `noreply@finhane.net`
- Cloudflare Email Routing veya Google Workspace (~36 USD/yıl)
- Tüm form mailto link'leri güncellenir

### Faz 3 — Asset + SEO

**3.1 Asset yenileme:**
- `public/favicon-96x96.png?v=2` → yeni Finhane favicon `?v=3`
- `public/web-app-manifest-192x192.png` + `512x512`
- `public/icon.svg`
- `public/bg-finance.svg` (sahne) — Finhane kelimesi varsa
- `public/ad-poster-pro.png` (PRO banner) — Finhane brand
- Open Graph image (1200x630) — "Finhane • Finans Yuvanız"

**3.2 SEO 301 redirect:**
- Cloudflare Pages → Custom domain `hanefinans.net` korunsun (eski kullanıcılar)
- Page Rule: `hanefinans.net/*` → `https://finhane.net/$1` (301 redirect, query preserve)
- Bu sayede eski linkler kaybolmaz, SEO juice transfer olur
- 12-18 ay sonra eski domain bırakılabilir

**3.3 JSON-LD + meta:**
- `Organization` schema: `"name": "Finhane"`
- `WebSite` schema: `url: "https://finhane.net"`
- `sameAs` ile sosyal medya (X, LinkedIn, Instagram) yeni handle'lar
- TR + EN için ayrı meta description
- `<meta name="author" content="Finhane">`

**3.4 Robots + sitemap:**
- `public/robots.txt` → yeni sitemap URL
- `public/sitemap.xml` — eğer dinamik değilse manuel güncelle

### Faz 4 — Domain + DNS + Deploy

**4.1 Cloudflare Pages:**
- Yeni Pages projesi `finhane` adıyla aç (mevcut `hanefinans` korunabilir bir süre)
- Yeni repo `finhane`'i bağla (rename sonrası)
- Custom domain `finhane.net` + `www.finhane.net`
- SSL otomatik (Cloudflare)

**4.2 D1 + Worker:**
- D1 binding aynı kalır (`hanefinans-db` adı şu an, opsiyonel rename)
- Yahoo warmer worker yeni isimle yeniden deploy
- KV namespace (`HANEFINANS_FUNDS`) opsiyonel rename
- Cron eski URL'lere de yanıt versin (geçiş süresinde)

**4.3 DNS geçiş takvimi:**
- Gün 0: `finhane.net` live, `hanefinans.net` 301 redirect
- Gün 0-90: Her iki domain çalışır, organik trafiği takip et
- Gün 90+: Search Console'da eski domain'in ranking'i azaldığında yenisinin yükseldiğini doğrula
- Gün 180-365: Eski domain kira süresi bitince bırakılır (veya forward kalsın)

### Faz 5 — Veri + Service Worker Migrasyonu

**5.1 localStorage migration:**
```typescript
// src/lib/brandMigration.ts (yeni)
const FA_PREFIX = 'fa.';
const FH_PREFIX = 'fh.';
function migrateLocalStorage() {
  if (localStorage.getItem('fh.migrated.v1') === '1') return;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(FA_PREFIX)) {
      const v = localStorage.getItem(k);
      if (v) localStorage.setItem(FH_PREFIX + k.slice(3), v);
    }
  }
  localStorage.setItem('fh.migrated.v1', '1');
}
```
- App boot'unda 1 kez çalışsın
- 30-60 gün sonra eski `fa.*` key'leri sil

**5.2 Service Worker:**
- Mevcut SW `hanefinans` cache adlarını kullanıyor olabilir
- `vite.config.ts`'te workbox `cacheName` prefixleri kontrol et
- Yeni deploy yeni SW (`fh-sw-v1`) üretir, eski SW otomatik unregister olur (registerType: autoUpdate)
- Önce kullanıcı `clear-cache.html` ile temizler — bu URL korunur

**5.3 Push notification:**
- VAPID public key aynı kalsın (kullanıcı subscription'larını koru)
- Subject (mailto) güncellenir, ama push servisi bunu sadece bilgi olarak kullanır
- Bot mesaj imzası "Finhane" olur

### Faz 6 — Dokümantasyon + İletişim

**6.1 Sayfa içi duyuru:**
- `/uyelik` sayfasında veya banner — "Yenilendik! Hane Finans artık Finhane. Aynı ekip, yeni isim."
- 30 gün gösterilir, sonra kaldırılır

**6.2 Mevcut kullanıcılara email:**
- Push subscription'ı olan kullanıcılara tek seferlik notification
- Email yoksa kullanıcı bilgilendirme yok

**6.3 İçerik tarama:**
- KVKK aydınlatma metni — şirket adı geçiyorsa güncelle
- Üyelik sözleşmesi
- Mesafeli satış sözleşmesi (gelecek)
- Çerez politikası
- İade politikası

**6.4 Sosyal medya:**
- X (@finhane), Instagram (@finhane), LinkedIn (linkedin.com/company/finhane)
- Bio: "Finans Yuvanız • BIST, fon, kripto + AI"

**6.5 Hane Finans Cowork Plugin (#147 PAUSED):**
- Plugin adı `hanefinans` → `finhane`
- Skill prefixleri `/hanefinans:brief` → `/finhane:brief`
- Repo: `finhane-cowork-plugin`
- Rebrand sonrası tekrar başlanır

---

## 🎯 Tahmini Zaman Çizelgesi (sonraki seans)

| Faz | Süre | Açıklama |
|---|---|---|
| 1. Marka Kimliği | 2-3 hafta | Domain alımı + logo + tescil başvurusu |
| 2. Kod Refactor | 1 gün (1 seans) | sed-based bulk replace + manuel kontrol |
| 3. Asset + SEO | 2-3 gün | Logo SVG + favicon + meta + JSON-LD |
| 4. Domain + Deploy | 1 gün | Pages + DNS + 301 redirect |
| 5. Migrasyon | 1 hafta | localStorage migration + SW cache temizliği test |
| 6. Dokümantasyon | 2-3 gün | KVKK + sözleşmeler + duyuru |

**Toplam:** 3-4 hafta (paralel çalışılırsa 2 hafta).

---

## ✅ Rebrand sonrası DEVAM EDEN İŞLER (öncelik sırasıyla)

Rebrand bittikten sonra şu seans setleri devam eder:

### Sıradaki: Hane Asistan / Finhane Asistan — Sticky Chat (eski Seans 5)
- Sticky chat widget (alt sağ)
- Konteks: watchlist + portföy + son sorgu
- Claude Sonnet multi-turn
- Kota: Elite 50/gün, Pro 10/gün, Free 0
- D1: `chat_sessions` + `chat_messages`

### Sonra: Cowork Plugin (Finhane adıyla)
- `.claude-plugin/plugin.json` manifest
- 8 skill (bist-snapshot, hisse-analiz, fon-onerisi, vs.)
- Slash command'lar (/finhane:brief, vs.)
- GitHub repo + Anthropic marketplace PR

### Smart Spotlight + Geçmişte Bugün + AI Tahmin Doğruluk
- Daha önceki plan korunuyor, sadece marka adı değişiyor.

---

## 🎯 Bu Seans Tamamlananlar (Haziran 1)

- ✅ CSP Report-Only → enforce (güvenlik tam aktif)
- ✅ Sabah AI Brief sistemi: D1 + 07:30 cron + push notification + `/brief` sayfası
- ✅ Deep-Dive Elite raporu: Claude Sonnet 5 bölümlü premium analiz, Pro 2/ay, Elite limitsiz
- ✅ Panel + Morning SWR 24 saat cache (mock yok, son ziyaret instant render)
- ✅ Morning sayfası üst butonları kaldırıldı (Yenile/.md/Telegram)
- ✅ Gün % weekend fix (Pazartesi otomatik dolacak)
- ✅ Hisseler period kolonları (582 sembol 1Y D1 cache)

---

## 🚀 Sonraki Seans — KÜÇÜK İYİLEŞTİRMELER (ilk 1-2 saat)

### Operasyonel temizlik
1. **Avrupa/Asya endeks veri sorunu** — `/global` sayfasında "veri alınamadı". Yahoo sembolleri (^GDAXI, ^FTSE, ^FCHI, ^N225, ^HSI, ^SSEC) warmer'a eklensin.
2. **Global sayfa Yenile butonu kaldır** — kompakt layout için
3. **ENTRA +100% anomalisi mask** — `Math.abs(changePct) > 50` ise UI'da "—" veya uyarı badge
4. **Wrangler 4'e güncelle** — kosmetik uyarı, breaking change kontrolü
5. **`/api/briefs/[date].ts` veya by-date** — geçmiş brief detayları için (history.ts'te contentMd zaten var ama route eksik)

### UX polish
6. **Tüm sayfalarda SWR cache 24h** uygula: Funds, Stocks (zaten var), Recommendations, Watchlist
7. **Mock veri kullanan diğer sayfaları temizle**: Detail sayfalar, US Markets, Heat Map
8. **Skeleton + shimmer** standardı: tüm async sayfalarda aynı şablon

---

## 🌟 FARKLILAŞMA STRATEJİSİ — Rakiplerden ayrışma

> Mynet/BloombergHT/Investing static; Fintables grafik odaklı; KAP düz tablo.
> Hane Finans'ın boş alanı: **AI'la güçlendirilmiş, gamified, kişiselleştirilmiş, mobile-first**.

### 1. Hane Asistan — Sticky Chat (Seans 5)
Sağ alt köşede her zaman erişilebilir AI chat:
- Kullanıcı sorar: "AKBNK al-sat mı?", "Watchlist'imde en riskli hisse?", "TEFAS'ta en iyi 5 BIST fonu?"
- Konteks: watchlist + portföy + son sorgu geçmişi
- Claude Sonnet multi-turn, 50 msg/gün Elite, 10/gün Pro, 0 Free (preview gösterir)
- D1: `chat_sessions` + `chat_messages` (rate limit + analitik)
- **Etki:** sabah brief'inden farklı olarak ANLIK destek — habit-forming

### 2. Smart Spotlight — Günün Hissesi (yeni)
Her sabah AI bir hisseye "spot ışığı" tutuyor:
- BIST 30'dan + watchlist'ten algoritmik seçim
- "Neden bu hisse?" 3 paragraf gerekçe + grafik
- Free: sembol adı + 1 cümle teaser; Pro/Elite: tam içerik
- Panel'de üst widget, brief'te bölüm

### 3. Geçmişte Bugün
"1 yıl önce bugün BIST 100 8.420 idi (+%63), USD/TRY 19.50 idi"
Watchlist'teki hisseler için: "AKBNK 1 yıl önce 24.50, şimdi 44.30 (+80%)"
**Etki:** nostalji + bağlam — kullanıcı uzun vadeli düşünür

### 4. AI Tahmin Geçmişi & Doğruluk Skoru
Site genelinde tahminler (Sabah Brief AI Spotlight, Sektör Şampiyonu agent, vs.) bir D1 tablosuna yazılır:
- Her tahminin "gerçekleşti mi" sonrası takip edilir
- Kullanıcıya: "Hane Finans son 30 günde %72 doğruluk" şeffaflık metriği
- Sektör Şampiyonu / Bugünün Lideri sonuçları da burada birikir
- **Etki:** güven inşası + bağlılık

### 5. Yatırımcı Profili Quiz
Onboarding'de 5 soru: risk toleransı, yatırım ufku, sektor tercihleri, deneyim, hedef
Çıkış: profil etiketi (Muhafazakar, Dengeli, Agresif, Spekülatif) + öneri filtresi
Profile göre Öneriler sayfası filtrelenir, Brief kişisellestirilir
**Etki:** "bana özel" hissi + segmentasyon

### 6. Goal Tracking
"100K → 200K hedefim Aralık 2026'ya"
Watchlist getirisi + portföy performansı + hedef ilerleme bar
Push: "Hedefe %3 yaklaştın", "Bu ay %5 geride"
**Etki:** motivasyon + dönüş sebebi

### 7. Weekly Recap (Cuma akşamı otomatik)
Sabah Brief'in haftalık versiyonu:
- Bu hafta watchlist getirisi
- En çok yükselen/düşen
- Önemli haber 5
- Sektör performansı özeti
- Önümüzdeki hafta TCMB/FED/CHP butlan vb. takvim
- Push: "Cuma raporun hazır"

### 8. Hane Çağrısı — AI Watcher
Kullanıcı tabii dilde komut verir:
- "AKBNK 50 TL'yi geçince haber ver" → alarm
- "ASELS'te 10%+ hareket olursa bildir"
- "Fonlar haftalık değişimi 5%'ten fazla olursa uyar"
AI cümleyi parse eder → alarm/news_alert oluşturur
**Etki:** doğal dil + power user

### 9. Hisse Karşılaştırma (BoxSet)
2-4 hisse seç → yan yana metrik karşılaştırma + AI yorum
"AKBNK vs GARAN vs YKBNK" → "AKBNK temettüde önde, GARAN momentumda, YKBNK değer tuzağı riski"
**Etki:** karar alma destekleyici, deep analiz aboneliğine geçiş tetikleyici

### 10. Sosyal Kanıt — Hane Topluluğu (gelecek)
- Toplulukta paylaşılan tahminler (anonim)
- "Bu hafta en başarılı 10 tahminci"
- Kendi tahminlerini paylaşabilir / yorum yapabilir
- Modere edilmiş, kalite filtreli (spam yok)
**Etki:** ağ etkisi + retention

---

## 🔄 BAĞLILIK MEKANİĞİ — Geri Dönüş Tetikleyicileri

### Habit loop tasarımı
**Trigger → Action → Reward → Investment**

| Trigger | Action | Reward |
|---|---|---|
| Push 07:30 "Sabah brief'iniz hazır" | /brief'i aç | Bilgi + güncel piyasa |
| Daily streak badge ("9 gün") | Panel'i ziyaret et | Streak +1, milestone push |
| Alarm tetikledi | Hisseye git | Doğrulama, alım/satım fırsatı |
| Game daily reset (00:01) | Bugünün Lideri tahmin | Puan + leaderboard |
| Akşam Weekly Recap (Cuma 19:00) | /brief'e git | Hafta özeti |
| Watchlist'te %5+ hareket | Notification | Önemli bilgi |
| AI Spotlight ($X hisse) | Detaya git | Premium analiz teaser |

### Streak system (zaten var) genişlet
- Mevcut: günlük giriş streak
- Yeni: "Watchlist check streak", "Quiz streak", "Brief okuma streak"
- 7/30/90 gün milestone rozet
- 30 günde 1 ay PRO denemesi ödülü (conversion!)

### Achievements (rozetler)
Kazanma kriterleri:
- İlk watchlist (10 hisse)
- 7 gün streak
- 1 oyun kazandı
- 1 brief okudu
- 1 deep analiz aldı
- Sektör şampiyonu trifekta
- 30 gün streak (haftalık premium hak)
- 100 gün streak (kalıcı %10 indirim)

### Notification stratejisi (smart timing)
**Az ama doğru:**
- 07:30 brief (zorunlu)
- 18:00 piyasa kapanış flash (önemli hareket varsa)
- Hafta sonu yok (BIST kapalı)
- Alarm tetiklemeleri (hızlı, mobile vibration)
- Cuma 19:00 weekly recap
- Akşam push'lar 21:00'dan sonra yok (uyku zamanı)
- Kullanıcı 3 gün dönmediyse 1 nazik hatırlatma, sonra sus

### Curiosity hooks (sayfa açtırma)
Panel'de "yeni" badge'leri:
- "AKBNK'da büyük yatırımcı sinyali" (15 dk önce)
- "3 alarm tetiklendi" (watchlist)
- "Bugünün spotlight'ı yayında"
- "Sektör Şampiyonu Cuma kapanış sonuçları geldi"

---

## 📱 MOBILE-FIRST POLISH

### Şu an iyi olanlar
- Bottom nav var
- Panel'de mobile compact yapıldı
- Per-section ErrorBoundary mobile fail-safe

### Eklenecekler
1. **Pull-to-refresh** (sadece touch'lı cihazlarda)
2. **Bottom sheet** modaller (full-screen yerine)
3. **Swipe navigation** sayfa arası
4. **Haptic feedback** alarm tetiğinde
5. **Native share** integration (brief paylaşma)
6. **Add to Home Screen** prompt push (PWA install'a yönlendirme)
7. **Offline indicator** banner — bağlantı kopunca

### Akıllı veri kullanımı (Türkiye 4G dostu)
- Görsel optimizasyonu: WebP, lazy load, srcset
- Cache TTL artır (24h zaten var)
- Compressing API responses
- Background sync (offline'da yapılan watchlist değişiklikleri online'da senkron)

---

## 🧠 İÇERİK STRATEJİSİ — Uzman pozisyonu + SEO

### Blog/Eğitim (Seans 7)
20 hazır içerik kümesi:
- "TEFAS fon kategorileri rehberi"
- "EMA/MACD/RSI nasıl okunur"
- "BIST hisselerinde temettü taraması"
- "TCMB faiz kararı neden önemli"
- "KAP haberlerinin yorumu"
- "Risk skoru ne anlatır"
- "Sektör endeksleri nasıl çalışır"
- "Volatilite (VIX) nedir"
- "Big Player aktivitesi nasıl tespit edilir"
- "Hisse seçiminde kullanılan 5 kriter"
- "Stop-loss neden gerekli"
- "Long/Short pozisyonlar"
- "Para Politikası Kurulu (PPK)"
- "Pareto kuralı portföyde"
- "Dividend yield vs price appreciation"
- "USD/TRY ve BIST ilişkisi"
- "Brent petrol → THYAO etkisi"
- "Bankacılık sektörü makro hassasiyeti"
- "Holding hisselerinde discount fenomeni"
- "Reel getiri = nominal - enflasyon"

SEO + JSON-LD Article schema + share buttons + "okuma süresi" badge.
**Etki:** organik trafik + uzman algısı + güven

### Sözlük/Glossary
Kısa tanım sayfası: PE, PB, EBITDA, F/K, vs. — hızlı arama
Her terim için "Bu sitede nerede kullanılır" linki

---

## 📊 ÖLÇÜM (Analytics)

Bu özellikleri ekledikçe **bağlılık metrikleri** ölç:
- DAU/MAU oranı (yüksek = günlük habit)
- Session sayısı/kullanıcı/hafta
- Sayfa başına süre (Panel, Brief, Deep Analiz)
- Streak retention (% kullanıcı 7/30 gün streak'i koruyor)
- Push CTR (open rate + click rate)
- Game completion rate (oyun başlayıp bitirme)
- Brief read rate (open rate)
- Deep analiz conversion (Free → trial)

Telemetry foundation var (#42). Dashboard yapımı: admin sayfası için günlük metrik kartları.

---

## 💰 İLERLEYEN VADEDE — Gelir Motoru (henüz değil)

Önce kullanıcı tabanı + bağlılık. Sonra ödeme:
- iyzico veya Stripe entegrasyonu
- Pro 99₺/ay, 999₺/yıl
- Elite 299₺/ay, 2.999₺/yıl
- Streak/achievement → ücretsiz upgrade hak
- 7 gün Pro deneme (kayıt sonrası)

**Hedef:** Pro%'sini %3-5'e çıkarmak, Elite %0.5-1.

---

## 🧪 Önerilen Seans Sıralaması

**Seans A (1-2 saat) — Hızlı kazançlar:**
1. Operasyonel temizlik (Avrupa endeks, Global Yenile, ENTRA mask, by-date route)
2. Diğer sayfalara SWR cache (Funds, Watchlist)

**Seans B (3-4 saat) — Hane Asistan (Chat):**
3. Seans 5 implementasyonu — sticky chat widget + chat_sessions D1 + tier kotaları
4. Konteks injection: watchlist + portföy + son sorgu

**Seans C (2-3 saat) — Smart Spotlight + Geçmişte Bugün:**
5. Günün Hissesi cron + UI widget
6. Geçmişte Bugün widget Panel'de

**Seans D (3 saat) — AI Tahmin Geçmişi + Yatırımcı Profili Quiz:**
7. predictions_tracker D1 + scoring + showcase widget
8. Investor profile onboarding 5 soru → tag → segmentasyon

**Seans E (4 saat) — Weekly Recap + Hane Çağrısı:**
9. Cuma 19:00 cron → weekly recap brief
10. Doğal dil alarm parser AI endpoint

**Seans F (uzun) — Blog/SEO:**
11. /blog routing + MD content sistemi
12. 20 başlangıç içerik

**Seans G (uzun) — Achievement + Streak v2:**
13. badges tablosu + earning rules
14. Streak v2 (multi-streak) + premium reward

---

## 🔧 Operasyonel Notlar

### D1 cache nasıl güncellenir?
- Otomatik: `30 15 * * 1-5` cron, hafta içi 18:30 TR
- Manuel: `…/warm/historical?start=X&count=Y` (X = 0/100/200/300/400)

### Cache temizleme (kullanıcı)
- URL: `https://hanefinans.net/clear-cache.html`

### Health check
- D1: `https://hane-finans-yahoo-warmer.irfansari57.workers.dev/health`
- Snapshot: `https://hanefinans.net/api/yahoo/snapshot`
- Returns: `https://hanefinans.net/api/yahoo/returns-snapshot`
- Brief: `https://hanefinans.net/api/briefs/latest`

### Git push pattern (cron commit recovery)
```powershell
cd C:\dev\hanefinans
Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue
git add <files>
git commit -m "..."
$myCommit = (git log -1 --format=%H)
git fetch origin
git reset --hard origin/main
git cherry-pick $myCommit
git push
```

### Migration koşma
```powershell
npx wrangler d1 execute hanefinans-db --file=functions/migrations/XYZ.sql --remote
```

### Wrangler login
```powershell
npx wrangler logout
npx wrangler login
npx wrangler whoami
```

---

## 📐 Mimari prensipleri (referans)

1. **SWR everywhere** — usePersistedState 24h cache, hiç boş kart yok
2. **Server-side cache 24h** — D1'de hesaplanmış sonuçlar
3. **Anthropic Haiku ucuz işler, Sonnet premium** — maliyet bilinçli
4. **Tier gates D1'de değil endpoint'te** — frontend kontrol fail-safe
5. **Push timing ≤ 2/gün** — spam yok
6. **Markdown-first content** — render frontend'de, AI çıktı zaten markdown
7. **PinnableAccordion her yerde** — kullanıcı uzun sayfaları yönetir
8. **Mobile-first compact** — desktop ek detay sonra
9. **Free preview + paywall** — Free'lere değer göster, üyeliğe yönlendir

---

## ✏️ Tamamlanmış MVP'ler (referans)

- BIST + TEFAS + Kripto + Döviz + Makro veri akışları + D1 cache
- Öneriler (Fon Havuzu, Strong Buy, Algoritmik, Aracı Kurum, Model Portföy)
- Akıllı Sorgu (AI screener) + tier kotaları
- Tier sistemi UI + Elite gating + paywall preview'ları
- PWA Phase 1 (install banner, offline fallback, NetworkFirst SW)
- Optimistic UI + skeleton + virtualization + bundle splitting
- Color/typography premium (Inter VF, stagger)
- Push notifications (VAPID + D1 + endpoints)
- Alarm sistemi (D1 + cron + frontend)
- Streak + Prediction Game v1
- 6 oyun MVP (accordion içinde)
- Watchlist Fon Havuzu format
- Ekonomik Takvim (TR-focused + hatırlatma)
- Heat Map (BIST + sektör)
- CSP enforce
- Sabah AI Brief + push delivery
- Hisse Deep-Dive Elite (Pro 2/ay)
- Panel + Morning SWR 24h cache

---

## 🔌 STRATEJİK FIRSAT — Hane Finans Cowork Plugin

> **Keşif:** Anthropic'in resmi açık kaynak `knowledge-work-plugins` marketplace'i incelendi (`plugins-ref/`). 11 plugin, 186 skill, finance/sales/marketing/legal/productivity/data kategorileri.

### 1. Hane Finans Skill Pack (yeni dağıtım kanalı)

Hane Finans'ı web uygulaması olarak çalışırken paralel olarak **Cowork plugin** olarak da çıkar. Bu Anthropic Claude pazarında ek görünürlük + organik kullanıcı kazanımı sağlar.

Plugin yapısı (`.claude-plugin/plugin.json` + `skills/` + `commands/`):

**Skills (markdown frontmatter ile):**
- `bist-snapshot` — anlık BIST endeks + top 5 hisse durumu
- `hisse-analiz` — bir BIST sembolü için teknik + temel özet (Deep-Dive'a denk)
- `fon-onerisi` — kategori bazlı en iyi 5 TEFAS fonu (1A/3A/1Y getiri)
- `makro-durum` — TÜFE/faiz/kur özeti + risk skoru
- `sektor-sampiyonu` — son hafta en çok yükselen 3 sektör
- `gunluk-brief` — kullanıcıya sabah brief'i komut tetiklemeli
- `kap-haber-ozet` — son 24 saat KAP'tan önemli haberler
- `watchlist-saglik` — kullanıcının watchlist performansı + risk skoru

**Slash commands** (`/hanefinans:` prefixli):
- `/hanefinans:brief` — sabah brief üret
- `/hanefinans:hisse THYAO` — hisse detay
- `/hanefinans:fon TEB100` — fon detay
- `/hanefinans:tahmin` — bugünün lideri oyunu başlat
- `/hanefinans:alarm AKBNK 50` — alarm kur

**Connectors:** Kendi API'lerimiz (hanefinans.net/api/*) — public endpoint'lere okuma erişimi.

**Marketplace:** GitHub'da `hanefinans/hanefinans-plugin` repo'su açılır, Anthropic marketplace'e PR olarak gönderilir.

### 2. Pattern Library — Bizim backend'imize uygulanacak öğretiler

Anthropic'in skill yapısından çıkarılan **bizim de uygulamamız gereken** mimari prensipler:

#### a) Step-by-step procedure structure
Her AI agent'ımız (Sabah Brief, Deep-Dive, Hane Asistan) bu yapıyı izlemeli:
```
## Step 1 — Veri çek
1. ...
2. ...

## Step 2 — Analiz et
...

## Step 3 — Çıktı formatı
Format the output as:
```
{output template}
```

## Connector failures
- {endpoint A yok}: skip + note
- {endpoint B yok}: ...
- {hiçbiri yok}: stop + tell user
```

Bu yapı `friday-brief`, `variance-analysis` skill'lerinden alınmış — **graceful degradation** ile.

#### b) Approval gates (destructive aksiyonlar için)
Şu an alarm silme, watchlist sıfırlama, settings reset doğrudan yapılıyor. Anthropic pattern'i:
```
## Approval gates
Before deleting all alerts, ask user:
"Bu 12 alarmı silmek üzeresin. Onaylıyor musun? (evet/hayır)"
```
Frontend'de mevcut `ConfirmDialog` zaten var ama AI tetikli aksiyonlarda eksik. Hane Çağrısı (Seans 5) için kritik.

#### c) Connector failure → graceful degradation
"PayPal yoksa note ekle, devam et" pattern'i Hane Finans için:
- Yahoo down → Stooq fallback (zaten var)
- TEFAS down → cache'ten son veri + "veri X saat eskidi" badge
- D1 down → frontend localStorage fallback + offline badge
- Anthropic down → AI özelliği "bakım modunda" + skip

Şu an pattern var ama tutarsız. Tek bir `gracefulDegradation()` helper yazalım.

#### d) `argument-hint` frontmatter — slash command UI
Skill metadata'sında `argument-hint: "<symbol> <period> vs <comparison>"` var. Bizim Akıllı Sorgu sayfasında benzer hint gösterebiliriz: kullanıcı `/screen` yazınca placeholder `bankacılık 1A %5+` hint'i.

### 3. Orchestrator pattern — Hane Asistan için template

`small-business/skills/smb-router/` muhtemelen master orchestrator — kullanıcının ne sorduğunu anlayıp doğru skill'e yönlendiriyor. Hane Asistan (Seans 5) için aynı pattern:

```
User: "AKBNK için derin analiz yap"
Hane Asistan router:
  → intent classification: "deep_analyze"
  → entity extraction: symbol="AKBNK"
  → tier check
  → call /api/ai/deep-analyze
  → return formatted markdown
```

```
User: "watchlist'imdeki en riskli hisse hangisi"
Router → intent: "watchlist_risk_analysis"
  → fetch watchlist symbols
  → run risk scoring (volatility, sector concentration, news sentiment)
  → return ranked list
```

Router AI prompt'unu Anthropic pattern'ine göre yaz:
```
You are Hane Asistan, a routing agent. Available skills: [bist-snapshot, hisse-analiz, fon-onerisi, watchlist-risk, ...].
Given user query, return JSON {"skill": "...", "args": {...}, "confidence": 0.X}.
If unclear, return {"skill": "general_chat", ...}.
```

### Seans Sıralaması güncellendi

**Seans H — Hane Finans Cowork Plugin (yeni eklendi):**
1. `.claude-plugin/plugin.json` manifest
2. 8 skill (markdown) yaz
3. Slash commands tanımla
4. GitHub repo oluştur, README + LICENSE
5. Anthropic marketplace PR submit

**Seans I — Backend pattern refactor:**
1. Step-by-step procedure structure tüm AI endpoint'lerine
2. Tek `gracefulDegradation()` helper
3. Approval gate pattern Hane Çağrısı'nda
4. `argument-hint` benzeri UX ipuçları frontend'de

Bu çalışmalar Hane Finans'ı **standart finans sitesi**nden **AI-native, dağıtım kanalı çoklu, mühendislik açısından premium** bir ürüne çevirir.

---

## 🎯 NORTH STAR — Tek cümle

> "Türkiye'deki BIST/TEFAS/Kripto yatırımcısının her sabah ilk açtığı, AI'la güçlendirilmiş, kişiselleştirilmiş, gamified, premium hisli finans uygulaması."

Rakipler statik dashboard. Hane Finans **canlı asistan + kişisel rehber**.
