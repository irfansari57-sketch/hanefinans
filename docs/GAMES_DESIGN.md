# Oyunlarım — Oyun Konseptleri

Mevcut: **🎯 Günlük Tahmin** (BIST 100/30 yön — 5 kategori, cron resolve, leaderboard) → çalışıyor.

Aşağıdaki 5 oyun **konsept tasarımı**. Her biri: mekanik + puanlama + backend + frontend + engagement notları içerir.

---

## 1. 📈 Bugünün Lideri

**Mekanik:**
- Her sabah 10:00'da (BIST açılışı), BIST 30'dan **5 hisse rastgele seçilir** (server-side, deterministic — herkes aynı setle oynar)
- Kullanıcı bu 5'in arasından **günün en çok yükselen** (veya en çok düşen — iki mod) olacağını tahmin eder
- Tek tıkla seçim, geri al butonu (kapanışa 1 saat kalana kadar)
- Kapanışta (18:10) Yahoo'dan kapanış fiyatları çekilir, en çok değişen belirlenir

**Puanlama:**
- Doğru tahmin: **50 puan**
- Streak çarpanı: 3 gün üstüste = ×1.5, 7 gün = ×2, 14 gün = ×3
- Top 1'i bilen ekstra **+25 bonus**

**Backend:**
- D1: `daily_leader_picks` (id, date, symbol1-5, winner_symbol, resolved_at)
- D1: `user_leader_predictions` (user_id, date, pick_symbol, mode, points)
- Cron: 10:00 select 5 hisse, 18:15 resolve
- Endpoint: `GET /api/games/leader/today`, `POST /api/games/leader/submit`

**Frontend:**
- 5 hisse büyük kart grid (logo + sembol + son fiyat + 1g %)
- Mod toggle: "En çok yükselen" / "En çok düşen"
- Submit sonrası: "✓ Tahminin: AKBNK" badge
- Geçmiş sonuçlar tablosu

**Engagement:**
- Push: 9:55 "5 hisse açıklandı, tahmin et!" notification
- Push: 18:15 "Sonuçlar açıklandı" + kazanan
- Streak emoji 🔥 + günde 1 deneme = re-engagement

**Karmaşıklık:** ★★☆☆☆ (1-2 gün)

---

## 2. 🏭 Sektör Şampiyonu

**Mekanik:**
- **Haftalık** oyun (Pazartesi 09:00 başlar, Cuma 18:10'da kapanış)
- 10 sektör endeksi: XBANK, XHOLD, XSANI, XGIDA, XTRZM, XELKT, XILTM, XKMYA, XMANA, XHIZM
- Kullanıcı **haftanın en iyi 3 sektörünü sırayla** tahmin eder (1., 2., 3.)
- Cuma kapanışta her sektör için %değişim hesaplanır

**Puanlama:**
- 1. sıra doğru: **75 puan**
- 2. sıra doğru: **50 puan**
- 3. sıra doğru: **30 puan**
- 3'ü de tutarsa **TRİFEKTA +100 bonus** (toplam 255p)
- 3 sektör arasında olup yanlış sırada: 10p her biri

**Backend:**
- D1: `sector_weekly_picks` (user_id, week_start, pick1, pick2, pick3, result_points)
- D1: `sector_weekly_results` (week_start, ranked_sectors json, resolved_at)
- Cron: Pazartesi 09:00 reset, Cuma 18:15 resolve (Yahoo XBANK.IS etc.)

**Frontend:**
- 10 sektör kartı (sektör adı + bir önceki haftalık % + ikon)
- Drag-drop veya numbered click (1, 2, 3 seç)
- Haftanın 5 işgününde "Hafta İçi Durumu" tablosu (canlı sıralama)

**Engagement:**
- Pazartesi 09:00 push: "Yeni hafta başladı — sektör tahminini yap!"
- Çarşamba push: "Cuma'ya 2 gün — son tahminler"
- Hafta sonu push: "Bu hafta en iyi: XBANK +5.2% — tahminin nasıldı?"

**Karmaşıklık:** ★★★☆☆ (2-3 gün)

---

## 3. 🧠 Finansal Quiz

**Mekanik:**
- Her gün **3 yeni soru** (multiple choice, 4 şık)
- Soru bankası kategorileri:
  - **Temel finans** (P/E, EBITDA, BIST nedir vb.)
  - **BIST tarihi & trivia** (ASELS hangi sektör? GARAN ne zaman halka arz?)
  - **Ekonomik göstergeler** (TÜFE nedir? CDS prim?)
  - **Aktüel** (TCMB son faiz?)
- Her soru için 30 saniye süre (opsiyonel)
- Tek deneme

**Puanlama:**
- Her doğru: **10 puan**
- 3'ü de doğru: **+25 bonus** (toplam 55p)
- 7 gün üstüste 3/3: **HAFTANIN BİLGİNİ** rozeti (badge) + 100 puan

**Backend:**
- D1: `quiz_questions` (id, category, question, options json, correct_idx, difficulty, active)
- D1: `quiz_daily` (date, q1_id, q2_id, q3_id) — günlük seçilen sorular
- D1: `user_quiz_submissions` (user_id, date, answers json, score)
- Admin panel: soru ekle/düzenle/aktive et
- AI fallback: soru bankası az olursa Claude Haiku ile üret + manuel onay

**Frontend:**
- 3 soru tek sayfada (scroll) veya step-by-step
- Cevap verince anlık feedback (✓ veya ✗ + doğru cevap)
- Sonuç sayfası: 3 sorunun özeti + puan + "Yarın yeni 3 soru"
- "Soru gönder" butonu — kullanıcılar soru önerebilir (moderation)

**Engagement:**
- Push: 10:00 "Bugünün 3 sorusu hazır"
- Streak: 7 gün üstüste oynama = rozet
- Public leaderboard: en bilgili top 20

**Karmaşıklık:** ★★★☆☆ (2-3 gün — soru bankası + UI)

---

## 4. 🔤 Sembol Bulmaca

**Mekanik:**
- Her gün 1 puzzle: bir şirketin **3 ipucu** verilir, kullanıcı sembolü tahmin eder
- İpuçları aşamalı açılır:
  - **İpucu 1**: Sektör + kuruluş yılı (ücretsiz)
  - **İpucu 2**: İlk harf + market cap dilimi (kullanılırsa 10 puan kaybı)
  - **İpucu 3**: Açıklama paragrafı (kullanılırsa 20 puan kaybı)
- 3 deneme hakkı

**Puanlama:**
- 1. denemede 1. ipucu ile: **50 puan**
- 2. denemede: **35 puan**
- 3. denemede: **20 puan**
- Bilemezsen: **0**

**Backend:**
- D1: `symbol_puzzle_pool` (symbol, sector, founded, market_cap_tier, description, difficulty)
- D1: `daily_symbol_puzzle` (date, puzzle_id)
- D1: `user_puzzle_submissions` (user_id, date, attempts, hints_used, points)
- Pool: ~200 BIST hissesi pre-loaded (BIST_UNIQUE'den otomatik)
- Cron: 00:01'de seç (önceki 30 günde gösterilmemiş)

**Frontend:**
- Kart üstte: "Hangi şirket?"
- 3 ipucu accordion (sırayla aç)
- Input: sembol veya şirket adı (otocomplete BIST_UNIQUE'den)
- Submit → "Doğru ✓" veya "Yanlış, 2 deneme kaldı"
- Sonuç: şirket logosu + sembol + açıklama + puan

**Engagement:**
- Push: 11:00 "Bugünün bulmacası hazır"
- Streak: 5 gün üstüste çözme = ekstra bonus
- Sosyal paylaş: "Bugün ASELS'i 1 ipucuyla buldum 🎯"

**Karmaşıklık:** ★★☆☆☆ (1-2 gün — pool zaten BIST_UNIQUE)

---

## 5. 💰 Sanal Portföy

**Mekanik:**
- **Haftalık turnuva** (Pazartesi 09:30 açılış, Cuma 18:10 kapanış)
- Her oyuncuya **100.000 TL sanal sermaye**
- BIST 100'den **5-10 hisse** seç + dağıtım yap (yüzde olarak)
- Pazartesi tek alım, Cuma'ya kadar değişiklik yok (basit MVP)
- Cuma'da hisse fiyatlarına göre portföy değeri hesaplanır

**Puanlama:**
- Haftalık leaderboard:
  - 1.: **500 puan**
  - 2.: **300 puan**
  - 3.: **200 puan**
  - 4-10.: **50 puan**
  - Top %25: 10 puan
- Bonusler:
  - 5+ farklı sektör: +25 (çeşitlilik)
  - Toplam getiri >%5: +50

**Backend:**
- D1: `portfolio_tournaments` (id, week_start, week_end, status)
- D1: `user_portfolios` (user_id, tournament_id, allocations json, final_value, rank, points)
- Snapshot: cron Pazartesi 09:30 fiyatları sakla, Cuma 18:15 recompute
- Endpoint: `POST /api/games/portfolio/submit`, `GET /api/games/portfolio/leaderboard`

**Frontend:**
- 5-10 hisse seçici (search + add) — slider/input ile yüzde tayin
- Toplam %100 olmalı (validation)
- Submit önce confirmation modal
- Hafta boyunca "Portföyüm" sayfasında canlı durum (kazanan/kaybeden hisseler)
- Leaderboard: top 50

**Engagement:**
- Pazartesi push: "Yeni turnuva — 100K TL sermaye seni bekliyor"
- Hafta içi push: "Portföyün 3. sırada — değiştirme şansın yok ama izle!"
- Cuma 18:15: "Turnuva bitti — sıralaman: 12. (+50 puan)"
- Aylık ALL-STAR: aylık toplam puana göre özel rozet

**Karmaşıklık:** ★★★★☆ (3-5 gün — en kapsamlı)

---

## Önerilen Öncelik Sırası

| # | Oyun | Karmaşıklık | Engagement Etkisi | Öncelik |
|---|------|-------------|-------------------|---------|
| 1 | 🎯 Günlük Tahmin (✅ aktif) | — | Yüksek | — |
| 2 | 📈 Bugünün Lideri | ★★ | Yüksek (günlük) | 🥇 İlk |
| 3 | 🔤 Sembol Bulmaca | ★★ | Orta-Yüksek | 🥈 İkinci |
| 4 | 🧠 Finansal Quiz | ★★★ | Yüksek (eğitici) | 🥉 Üçüncü |
| 5 | 🏭 Sektör Şampiyonu | ★★★ | Orta (haftalık) | 4. |
| 6 | 💰 Sanal Portföy | ★★★★ | Çok Yüksek | 5. (en zor ama en heyecanlı) |

## Ortak Altyapı (Hepsi için tek seferlik)

- **Streak sistemi** — zaten var, oyunlara extend et
- **Leaderboard** — zaten var (tahmin için), generic'e çevir (game_id parametre)
- **Push notification** — zaten var, oyun event'leri için template ekle
- **Points wallet** — yeni: tüm oyunlardan kazanılan puan toplamı, MembershipPage'de göster
- **Badge sistemi** — yeni: streak başarımları, oyun rozetleri (Hafta'nın Bilgini, Trifekta vs.)

## Sonraki Adım

Hangi oyundan başlayalım? Önerim **#2 Bugünün Lideri** — mevcut tahmin altyapısına en yakın, 1-2 günde MVP çıkar, günlük engagement artırır.
