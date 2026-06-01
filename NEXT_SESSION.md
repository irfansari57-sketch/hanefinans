# Hane Finans — Sonraki Seans Yol Haritası

> Son güncelleme: 2026-06-01 (sabaha doğru)
> Aktif yön: Farklılaşma + Bağlılık + AI Kişiselleştirme
> Gelir motoru (iyzico/Stripe) ertelendi — önce kullanıcıyı bağlamak, sonra para istemek.

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
