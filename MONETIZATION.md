# Hane Finans — Monetizasyon Yol Haritası

Bu dökümanda **Hane Finans'tan gelir elde etme** için somut stratejiler ve teknik altyapı önerileri.

---

## 🎯 Strateji Özeti

Hane Finans için **3 paralel gelir kaynağı** öneriyorum:

1. **Üyelik (SaaS)** — aylık tekrarlayan gelir (ARR'a giden ana akış)
2. **Affiliate** — broker/yatırım platformlarından komisyon
3. **İçerik** — YouTube kanalı + Premium içerik

İlk 3 ay: ücretsiz büyütme. 3. aydan itibaren PRO paketi aç. 6. ayda ELITE.

---

## 💼 1. Üyelik Paketleri (mevcut iskelet)

### FREE — ₺0
- Watchlist, panel, sabah raporu (mock)
- 5 fiyat alarmı
- Temel haber feed

### PRO — ₺99/ay
**Hedef kitle:** Bireysel yatırımcı (10K kullanıcıda ~%5 dönüşüm = 500 PRO = **₺49.500/ay**)
- Telegram günlük rapor (otomatik gönderim)
- Sınırsız alarm + RSI/MACD tabanlı
- Gecikmesiz BIST kotasyonu
- Detaylı teknik göstergeler (Bollinger, ADX, Fibonacci)
- Sanal portföy simülatörü + backtest
- Haftalık "Editör Önerisi" listesi

### ELITE — ₺299/ay
**Hedef kitle:** Aktif trader, küçük fon yöneticisi (10K'da %0.5 = 50 ELITE = **₺14.950/ay**)
- AI destekli haber özetleme (Claude API)
- Sembol başına AI analiz raporu (haftalık 50 sembol)
- Özel WhatsApp/Telegram grup
- 1-1 30 dakika aylık seans
- Beta erken erişim

**Toplam potansiyel @ 10K kullanıcı:** ~₺65K/ay = ₺780K/yıl

### Teknik altyapı (üyelik gerçek olması için)
- ✅ Mock auth (kuruldu — UI/UX)
- ⏳ **Supabase Auth** + Postgres (gerçek güvenlik) — ücretsiz başlangıç
- ⏳ **Iyzico** veya **Paddle** ödeme entegrasyonu (kredi kartı + havale)
- ⏳ Aylık fatura otomasyonu

### Geçiş için 3 adım
1. **Supabase Auth migration** — mock'tan gerçek auth'a (1 hafta iş)
2. **Iyzico Sandbox** — test ödeme flow'u (3 gün)
3. **PRO özellik gating** — `<PremiumGate>` kullanılarak özelliklerin %30'u kapatılır (1 hafta)

---

## 🔗 2. Affiliate Gelirler

### Türk brokerleri (genelde ₺200-1000 / kayıt + lifetime % komisyon)
| Broker | Affiliate? | Tahmini komisyon | İletişim |
|---|---|---|---|
| **Midas** | Evet | ₺500-1000/aktif kullanıcı + işlem komisyonu %20 | iletisim |
| **Garanti BBVA Yatırım** | Kurumsal anlaşma | İşlem komisyonu | hesap yönetmeni |
| **Halk Yatırım** | Evet | Kayıt + komisyon | partner programı |
| **TEB Yatırım** | Kurumsal | Komisyon paylaşımı | satış ekibi |
| **GarantiBBVA Mobil Pay** | Evet (genel) | Komisyon | partner programı |

### Global
- **Binance** (kripto): ~%20 işlem komisyon — referans link
- **Bybit, OKX**: benzer
- **TradingView Premium**: ~$30 / referral

### Kripto borsalarına özel sayfa
- Uygulamaya **"Önerilen Broker'lar"** sayfası ekle
- Her broker için karşılaştırma + referans link
- Hesap aç → bizim app'e veri çekme entegrasyonu

### Potansiyel
500 aktif kullanıcı × ₺500/kayıt = **₺250.000 (tek seferlik)** + işlem komisyonları (aylık)

---

## 📹 3. İçerik & YouTube

### Mevcut iskelet (sol alt YouTube widget)
- Eğitim videoları otomatik oynar
- Özel playlist seçilebilir
- Senin kanalın olunca kendi videolarını ekleyebilirsin

### YouTube kanal stratejisi
- **Haftalık 1 video**: "Bu hafta BIST + makro" analiz (uygulamadan ekran kaydı + voice)
- **Günlük shorts**: 60sn'lik momentum hisseleri (otomatik üretilebilir, sabah raporundan)
- **Premium**: Üyelere özel detaylı analiz videoları

### Gelir kanalları
- **AdSense**: 1K izlenme = ~$1-3 (TR), Türk audience için düşük
- **Sponsorluk**: yatırım uygulamaları, broker reklam (₺5K-50K/video)
- **Affiliate (üst tabloyla aynı)**: video açıklamasında broker referans linkleri
- **YouTube Premium kullanıcıları**: dakika bazlı gelir

### Hedef
- 6 ayda 10K abone
- 1 yılda 50K abone
- Aylık ortalama ₺30-100K (kanal + sponsor + affiliate)

---

## 💡 4. Ek Gelir Fikirleri

### a) **Eğitim kursları** (Udemy / kendi platformun)
- "BIST momentum trading 101" — ₺499
- "Teknik analiz uzmanı" — ₺999
- Üyelere %50 indirim

### b) **Bireysel danışmanlık**
- Saatlik ₺500-1500 1-1 portföy danışmanı
- Aylık planda 30 dk dahil (ELITE)

### c) **API satışı**
- Bizim altyapımızı **Hane Finans API** olarak başkalarına sat
- Aylık ₺199 (10K istek), ₺999 (sınırsız)

### d) **B2B**: küçük yatırım danışmanlığı şirketleri için white-label
- Şirket kendi marka + Hane Finans altyapı
- ₺3-10K/ay

### e) **Premium Telegram kanalı**
- Günlük 3 hisse önerisi + 1 makro analiz
- ₺49/ay
- Otomasyon Telegram bot ile

---

## 📊 İlk 6 Ay Planı

| Ay | Hedef | İş |
|---|---|---|
| 1 | 200 ücretsiz kullanıcı | Sosyal medya + organik SEO |
| 2 | 500 kullanıcı | İlk YouTube videoları, broker affiliate |
| 3 | 1000 kullanıcı + Supabase Auth migration | PRO aboneliği açılır (₺99/ay) |
| 4 | 30 PRO üye = ₺2970/ay | Iyzico entegrasyonu canlı |
| 5 | 75 PRO + ilk affiliate kazançlar (₺5K) | ELITE açılır |
| 6 | 150 PRO + 10 ELITE = ₺17.840/ay + içerik geliri | Sürdürülebilir gelir akışı |

---

## 🛠️ Teknik Yol Haritası (Monetizasyon İçin)

### Faz 1: Gerçek auth (1 hafta)
- [ ] Supabase projesi aç
- [ ] Mock auth → Supabase Auth migration
- [ ] Email verification + password reset
- [ ] OAuth (Google, Apple) opsiyonel

### Faz 2: Ödeme (3 gün)
- [ ] Iyzico merchant hesabı (Türk lirası kredi kartı + havale)
- [ ] Subscription model
- [ ] Webhook → tier upgrade otomatik
- [ ] Fatura otomasyonu

### Faz 3: Premium özellikler (2 hafta)
- [ ] `<PremiumGate>` kullanılarak %30 özellik kapatılır
- [ ] PRO için: Telegram daily auto-send (zaten var, sadece gate)
- [ ] Sınırsız alarm
- [ ] AI haber özeti (Claude API çağrısı + sunucu maliyet hesabı)

### Faz 4: Affiliate (1 hafta)
- [ ] "Önerilen Broker'lar" sayfası
- [ ] Referans linkleri + UTM tracking
- [ ] Komisyon dashboard (basit Excel veya admin paneli)

### Faz 5: B2B & API (1 ay)
- [ ] API gateway (rate limit + tier)
- [ ] Müşteri portalı
- [ ] White-label tema sistemi

---

## 💸 İlk gerçek gelir için minimum eylem

**Bu hafta:** Supabase Auth + Iyzico Sandbox kurulumu (~2 gün benim yardımımla)
**Bu ay:** PRO planı açılışı, ilk 5 sponsor → ₺495 + içerik geliri başlangıcı

İlk **₺5.000/ay** geliri 60-90 günde elde edilebilir, doğru pazarlama + kullanıcı edinme ile.
