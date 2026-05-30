# Sonraki Seans — Hane Finans Yol Haritası

Bu dosya seanslar arası sürekliliği sağlar. Premium-pozisyon ürün stratejisi.
Gelir motoru (ödeme) sonraya — şimdi sistem geliştirme + bağlılık + çekicilik.

---

## Aktif Yön: Bağlılık + AI Farklılaştırma + İçerik Kalitesi

Yön A (gelir motoru — iyzico/Stripe) erteleneydi. Sıra B + C + D.

---

## Seans 1 — Push Altyapısı (SIRADA)

**Hazırlık tamam:**
- ✅ `web-push` npm paketi kuruldu
- ✅ VAPID keys üretildi
- ✅ Cloudflare Pages env'lere eklendi:
  - `VAPID_PUBLIC_KEY` (Production + Preview)
  - `VAPID_PRIVATE_KEY` (Production + Preview, **encrypted**)
  - `VAPID_SUBJECT=mailto:haneassistance@gmail.com`
  - `VITE_VAPID_PUBLIC_KEY` (Vite build için aynı public key)

**Seans başında yapılacaklar:**

1. **D1 migration:** `functions/migrations/005_push_subscriptions.sql`
   ```sql
   CREATE TABLE push_subscriptions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL,
     endpoint TEXT NOT NULL UNIQUE,
     p256dh TEXT NOT NULL,
     auth TEXT NOT NULL,
     user_agent TEXT,
     created_at INTEGER NOT NULL,
     last_used_at INTEGER
   );
   CREATE INDEX idx_push_user ON push_subscriptions(user_id);
   ```
   `npx wrangler d1 execute hanefinans-db --file=functions/migrations/005_push_subscriptions.sql --remote`

2. **Backend endpoints:**
   - `functions/api/push/subscribe.ts` — POST: subscription objesini D1'e kaydet
   - `functions/api/push/unsubscribe.ts` — DELETE: endpoint ile sil
   - `functions/api/push/test.ts` — POST: kullanıcıya test bildirim gönder
   - `functions/_push.ts` — ortak helper: VAPID auth, WebPushError handling

3. **Service Worker güncellemesi** (`public/sw.js`):
   - `push` event handler — payload parse → showNotification
   - `notificationclick` event handler — URL ile open + focus

4. **Frontend:**
   - `src/lib/pushNotifications.ts` — `requestPermission()`, `subscribe()`, `unsubscribe()`
   - `src/features/settings/sections/PushNotificationSection.tsx` — toggle + test button

5. **Migration 004 da deploy** — telemetry events tablosu hâlâ deploy edilmedi, push migration'la birlikte koş.

**Hedef çıktı:** Settings → Bildirimler → "Aç" butonu → tarayıcı izin diyaloğu → "Test bildirim gönder" → push gelir.

---

## Seans 2 — Alarm Sistemi

Push'un üstüne kurulu fiyat + KAP alarmları.

- D1: `price_alerts` (user_id, symbol, condition, threshold, active, triggered_at)
- D1: `news_alerts` (user_id, symbol, last_seen_news_id)
- Hisse detay sayfası: alarm widget'ı ("ASELS 400 TL'yi geçince haber ver")
- Watchlist'te "Alarmlarım" sekmesi (toplu yönetim)
- Cloudflare Cron Trigger (5 dk): snapshot fiyatları vs alarmlar → push
- Cron Trigger (15 dk): KAP haberleri vs news_alerts → push

---

## Seans 3 — Günlük AI Brief

- Cron 07:30 (Europe/Istanbul): watchlist + makro takvim + son 24 saat haber → Claude Haiku özet
- `briefs` D1 tablosu (user_id, date, content_md, sent_at)
- `/brief` sayfası — bugünkü brief + geçmiş 30 gün
- Push bildirimi: "Sabah brief'iniz hazır"

---

## Seans 4 — Hisse Deep-Dive Raporu (Elite hook)

- Hisse detayında "AI Derin Analiz" butonu — Elite-only veya Pro 2/ay
- Konteks: hissenin tüm teknik göstergeleri + sektör konumu + son 30 gün haber + makro
- Claude Sonnet ile 4-5 paragraf yapılandırılmış rapor
- D1 cache (24 saat), tier kotalı

---

## Seans 5 — Hane'ye Sor — AI Chat (Elite premium)

- Sticky chat widget (alt sağ)
- Konteks: watchlist + portföy + son sorgu/öneri geçmişi
- Claude Sonnet multi-turn
- Kota: Elite 50 msg/gün, Pro 10/gün, Free 0
- D1: `chat_sessions` + `chat_messages`

---

## Seans 6 — KAP + Sektör Analiz Sayfaları

- KAP RSS feed daha derin (şirket bazlı son 30 gün arşiv)
- `/sektor/bankacilik`, `/sektor/holding`, `/sektor/savunma` vb.
  - Sektör PE/PD ort, top performer, en kötü
  - AI sektör yorumu
- Watchlist'e sektör eklenebilir

---

## Seans 7 — Blog / Öğrenme Alanı (SEO + uzman pozisyonu)

- `/blog/*` MD-bazlı içerik sistemi (frontmatter + lazy import)
- 10-15 başlangıç içeriği:
  - TEFAS nedir, fon kategorileri, getiri yorumlama
  - EMA, MACD, RSI nedir
  - Makro nasıl okunur (TÜFE, faiz, kurda yansıma)
  - KAP nasıl yorumlanır
  - 20 yıllık deneyimden öğrenmeler
- SEO meta + OG + JSON-LD Article schema

---

## Sonraki (paralel / sıra dışı)

- **Backtest motoru** — strateji belirle, geçmiş verilerle simüle (Elite)
- **Admin telemetry dashboard** — D1 events görselleştirme
- **A/B testing infra** — feature flag + variant tracking
- **Tier upgrade flow** — iyzico/Stripe (gelir motoru — gelecek seans setlerine bırakıldı)
- **Native mobile wrap** — Capacitor / PWABuilder ile App Store / Play Store
- **Multi-tenant / Team workspaces** — Elite için
- **Sentry full wire** — error tracking tam aktif değil

---

## Hatırlatmalar / Teknik notlar

- **Migration 004 (telemetry_events) ve 005 (push_subscriptions) deploy bekliyor.**
- **Windows PowerShell 5.x encoding tuzağı:** Türkçe karakterli dosyalarda `Get-Content`/`Set-Content` mojibake yapıyor. Dosya operasyonlarında VS Code save'i veya `.NET` API (`[System.IO.File]::WriteAllLines` + `UTF8Encoding($false)`) kullan.
- **Tier admin:** `haneassistance@gmail.com` D1'de `tier='elite'` — ekrandaki görünüm doğru, UPDATE doğrulandı.
- **Push notification iOS:** Safari 16.4+ desteklemeye başladı. iOS testleri için en az iOS 16.4 cihaz gerek.
- **Cron trigger pattern:** `functions/api/cron/daily-report.ts` referans.

---

## Tamamlananlar Özeti (referans)

**Bu seans (Mayıs 30):**
- Tier-aware screener quota (Free 3 / Pro 30 / Elite 150 günlük)
- ScreenerPage canlı fiyat + günlük changePct (snapshot hydrate)
- Inter VF + tabular nums + stagger animasyon
- PwaInstallBanner + bistAll.ts truncation onarımı
- UTF-8 mojibake düzeltme (Türkçe karakterler restore)

**Önceki seanslar (özet):**
- BIST + TEFAS + kripto + döviz + makro veri akışları, snapshot cache
- Öneriler tabları: Fon Havuzu, Güçlü Al Hisse Havuzu, Algoritmik, Aracı Kurum, Model Portföy, Trend Fonlar
- Akıllı Sorgu (AI screener) + sıralama + performans kartları
- Tier sistemi UI + Elite gating
- Telemetry foundation (events D1 tablosu)
- Optimistic UI + skeleton + virtualization + bundle splitting
- PWA Phase 1: install banner + offline fallback
- Color/typography Wave 3 (premium hissi)
