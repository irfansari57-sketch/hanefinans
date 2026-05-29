# Sonraki Seans — Planlanan İyileştirmeler

Bu dosya bir sonraki çalışma seansı için bekleyen iş planını tutar.
Premium-fokus stratejisiyle uyumlu, etki sırasına göre.

---

## 1. Animasyonları compositor-only özelliklere geçir

**Durum:** Bu turda news ticker düzeltildi (rAF + translate3d).

**Yapılacak:**
- AdVideo modal aç/kapa animasyonu — şu an layout-trigger var, transform/opacity'e geç
- Mobil bottom nav swipe — touch hassasiyeti için transform-based
- Accordion açılış — height yerine transform/clip-path veya `interpolate-size`
- Sayfa geçişleri — view transitions API ile fade/slide (Safari/Chrome destekli)

**Hedef:** `transform`, `opacity`, `filter` dışındaki hiçbir animasyon kalmasın.
Compositor'da çalışan animasyonlar 60fps'te ana thread'i yormaz.

---

## 2. Tablo render optimizasyonu — virtualizasyon

**Sorun:** Hisseler sayfası 600+ `<tr>` render ediyor; Fonlar 1500+. Mobilde scroll yavaşlar.

**Yapılacak:**
- `react-window` veya `@tanstack/react-virtual` kur
- Hisseler tablosunu virtualize et (sadece görünen ~20 satır render edilir)
- Fonlar tablosunu virtualize et
- StrongBuyTab (max 25) ve FundPoolTab (max 30) zaten dar — gerek yok
- Akıllı Sorgu tablosu — eğer 30+ sonuç gelirse virtualize et

**Hedef:** Mobilde scroll FPS = 60. Bellek ayak izi <50MB.

---

## 3. Mobile-first bundle ince ayar

**Durum:** Route-split (lazyWithRetry) zaten var.

**Yapılacak:**
- TradingView widget'ı (en ağır 3rd party JS) — sadece detay sayfasında demand-load
- AI Screener input bileşeni — `/sorgu` sayfasına özel ayrı chunk
- MultiTimeframeCard — kullanıldığı sayfalarda demand-load
- Lucide ikonları — sadece kullanılanları (zaten tree-shake oluyor, doğrula)
- Recharts yerine daha küçük alternatifler değerlendir (zaten varsa)

**Hedef:** Mobile ilk byte → first contentful paint <1.5s.

---

## 4. İçerik-bilinçli skeleton + Suspense

**Sorun:** "Yükleniyor..." spinner pek bir şey söylemiyor. İçeriğin şeklini taklit eden gri kutular algı süresini azaltır.

**Yapılacak:**
- `<Skeleton>` bileşenini her sayfada tutarlı kullan (zaten var ama yer yer eksik)
- Hisseler sayfası iskeleti — 50 satırlık gri grid
- Fonlar sayfası iskeleti — kategorisi farklı
- Watchlist iskeleti — özet kartlar + tablo
- Detay sayfaları (StockDetail, FundDetail) — MultiTimeframeCard, chart skeleton'u

**Hedef:** Hiçbir sayfada boş ekran/spinner görme. İçerikten önce şekli göster.

---

## 5. Optimistic UI — anında tepki hissi

**Sorun:** Watchlist'e ekle / fonu takipten çıkar gibi işlemler "tıkla → bekle → güncellendi" akışı izliyor. Algı yavaş.

**Yapılacak:**
- Watchlist add/remove — UI hemen güncellenmeli, arka planda persist
- Hisse yıldız toggle — anında renk değişsin
- Fon takipten çıkar — satır hemen kaybolsun, undo butonu 3sn göster
- Hata durumunda geri al + toast bildirim
- Zustand mutator'larda optimistic pattern

**Hedef:** Tıkla → 0ms tepki. Sunucu sonradan sync olur.

---

## 6. PWA + push notification altyapısı 🌟 (Premium-fokus için kritik)

**Durum:** Service worker var ama minimal (push handler import ediyor).

**Yapılacak:**
- Manifest'i tamamla (zaten var, gözden geçir)
- Add-to-home prompt'u stratejik göster (kullanıcı 2 sayfa gezdikten sonra)
- Service worker offline fallback — son cache'lenmiş Watchlist/Panel görünür
- Push notification akışı:
  - `/api/push/subscribe` — kullanıcı endpoint kaydet
  - `/api/push/send` — Cloudflare Workers Cron ile her sabah 08:00
  - Watchlist sinyali değişince anlık push
  - Fresh EMA 5/8 cross olunca push
- Frontend: ayarlar > bildirim tercihleri (saat, semboller)

**Hedef:**
- %30 DAU artışı (sabah push ile geri çağırma)
- Premium tier'ı "watchlist alert" üzerinden konumlandır

**Maliyet:** Cloudflare ücretsiz Workers + Web Push API ücretsiz. Sadece kod.

---

## 7. Renk + tipografi pas üzerinden geçiş

**Yapılacak:**
- **Font:** Geçerli sans-serif → Inter / Manrope / Geist (premium hissi)
- **Renkler:** Mevcut paletten daha derin/zengin gri tonlama (Tailwind slate-950 zemin?)
- **Mikro-animasyon:**
  - Buton hover'da hafif `translateY(-1px)` + gölge
  - Kart hover'da `border-accent/30 → border-accent/60` ease
  - Sayfa geçişlerinde 200ms fade
- **Spacing:** Daha düzenli 8px grid sistem (Tailwind zaten ondalık, gözden geç)

**Hedef:** "20 yıllık uzmanın geliştirdiği premium araç" hissi. Veriden çok izlenim.

---

## 8. Telemetri + A/B test altyapısı

**Sorun:** Hangi sayfaya tıklandığı bilinmiyor. Premium dönüşüm oranı ölçülemez.

**Yapılacak:**
- Cloudflare Web Analytics (zaten ücretsiz) — sayfa görüntüleme
- Custom event tracking (lib/telemetry.ts modülü):
  - `watchlist.add(symbol)`, `watchlist.remove(symbol)`
  - `screener.query(text)`, `screener.results(count)`
  - `pricing.view`, `pricing.upgrade.click`
  - `notification.subscribe`
- Event'ları Cloudflare Pages Function üzerinden D1'e yaz
- Admin dashboard'da haftalık özet (en popüler sorgular, en eklenen hisseler)
- Sonra: A/B test framework (CTA metni, fiyat sayfası vs.)

**Hedef:**
- Premium dönüşüm oranını ölç ve haftalık iyileştir
- Hangi sorgular sık? → onları örnek listesine ekle
- Hangi sayfa terk ediliyor? → o sayfanın UX'ini düzelt

---

## Yan iyileştirmeler — eklemek istenebilecek diğerleri

- **Sembol detayında haber sekmesi** — o sembole özel haberleri filtrele
- **Fon karşılaştırma sayfası** — 2-4 fonu yan yana koy, performans grafiği üst üste
- **Portföyüm sayfası gerçek hesap entegrasyonu** — manuel giriş yerine Yapı Kredi/Garanti API'leri
- **Geçmiş simülasyon** — "Bu fonu 2 yıl önce alsaydım ne olurdu?"
- **Eğitim içeriği** — finansal okuryazarlık sayfası mevcut, derinleştirilebilir
- **Telegram bot kanal entegrasyonu** — `/hisse THYAO` komutuyla anlık özet

---

## Önceliklendirme önerisi

Premium-fokus için en yüksek ROI sırası:

1. **#6 PWA + push notification** — kullanıcı kazanma + tutma + Premium gerekçesi
2. **#5 Optimistic UI** — hızlı kazanım, küçük emek
3. **#4 Skeleton tutarlılığı** — hızlı kazanım
4. **#8 Telemetri** — neye yatırım yapacağını bilmek için temel
5. **#2 Virtualizasyon** — mobil performans için
6. **#7 Renk + tipografi** — marka algısı
7. **#3 Bundle optimization** — biraz daha sonra
8. **#1 Compositor animasyonları kalanı** — fine-tuning

Sıralamayı sen belirle, başlangıçta hangisi seni mutlu eder.
