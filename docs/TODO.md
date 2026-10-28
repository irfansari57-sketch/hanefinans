# investliQ — Yapılacaklar (güncelleme: 28 Eki 2026, seans sonu)

Öncelik: veri doğruluğu > ürün > büyüme. Her madde için "DOĞRULANDI" etiketi ancak canlı kontrol sonrası.

## A · Kullanıcı tarafı — bekleyen tetikleme/kontroller
- [ ] **KAP workflow tam tarama**: Actions → "KAP Fon Portfoy Dagilim Fetch" → Run (tümü, auto). 515/≈2000 fon işlendi; artımlı + 4 işçi hazır. `[kap] BİTTİ:` satırını paylaş.
- [ ] **Sabah 08:30–10:15 ekran kontrolü**: Panel "Bugün/Günün Enleri" boş gelmemeli (son iyi kopya + etiket). `api/panel/top-movers?force=1` → `diag.d1 == "ok"` (migration 024 uygulandı mı?).
- [ ] TEFAS Fund Fetch log'undan `[bes] / [allocation] / [risk]` satırları (BES GÜN/1H/NAV boş sorunu).
- [ ] `public/` altındaki eski HaneFinans videoları (`0528.mp4`, `HaneFinans_FinancialIntelligence.mp4`) yayından kaldır ("gerçek zamanlı" ifadesi, eski marka).

## B · Veri doğruluğu (P0)
- [ ] Haber: aynı olayın 3 kaynaktan 3 kritik satır olmaması — başlık benzerliğiyle tekilleştirme ("3 kaynak").
- [ ] Ekonomik takvim: elle girilen tarihler için aylık kaynak doğrulama rutini (Fed/TCMB/TÜİK/BLS resmî takvimleri); geçmiş olaylar "açıklandı" etiketiyle (yarın görünme hatası tekrarlamasın).
- [ ] Kripto: CoinGecko'yu GitHub Actions'tan çekip `data/crypto.json` (4 coin → 100 coin); top-movers kripto kaynağı.
- [ ] KAP PDF ayrıştırma: mevduat/katılım hesabı satırları (kodsuz) — para piyasası fonlarında kapsama <%90.
- [ ] XU100 şerit kaynağı: Yahoo+İş Yatırım melez düzeltmesi 1 hafta izlenecek; tutarsızlık logları.

## C · Ürün (P1)
- [ ] Fon karşılaştırma: iki fonun **ortak hisseleri / farkları** (KAP holdings ile; tür kümeleri yan yana).
- [ ] Yabancı hisse adları sözlüğü (TSM → Taiwan Semiconductor…) balon ve panelde.
- [ ] Nitelikli/Genel rozeti: Günün Enleri (fonlar) ve Takip Listesi fon satırlarına.
- [ ] Portföy Ağı: önceki ay farkları ilk tekrar raporla (Kasım başı) gelecek — "YENİ pozisyon" ve fark renkleri canlıda kontrol.
- [ ] "Bu hisseyi tutan fonlar" kartı: ABD hisseleri için Temel sekmesi gizli → kartı Genel sekmesine de ekle.
- [ ] Mobil Portföy Ağı (E şerit) gerçek cihaz kontrolü; gerekirse font/yarıçap ayarı.

## D · Pazarlama / video
- [ ] Seslendirme (ElevenLabs/Azure veya kendi ses) + müzik dosyaları → `marketing/video/raw/`; final miks (-14 LUFS), altyazı zamanlaması `vo.srt`.
- [ ] Ekonoskop bumper yayına (giriş jeneriği sonrası 5 sn).
- [ ] Inter font dosyası gelirse videoları yeniden render (Lato → Inter).

## E · Teknik borç / altyapı
- [ ] `/api/yahoo/snapshot` `symbols` parametresini yok sayıyor (tüm kotasyonlar dönüyor) — filtre uygula, yanıt küçülsün.
- [ ] jsDelivr @main 12 saat cache: holdings/* için purge yalnız index/by-stock — fon dosyaları için commit SHA'lı URL değerlendirmesi.
- [ ] Workflow süre bütçesi/raporlama: her veri işinin sonunda tek satır özet (yazılan/atlanan/hata) → Telegram (bist-warm'daki gibi).
- [ ] KAP proxy (`/api/kap/proxy`) yalnız gerekirse anahtarla aktif; kullanılmıyorsa 1 ay sonra kaldır.

## Tamamlananlar (bu seans, 24–28 Eki)
SPK yetki kaydı entegrasyonu · KAP aylık rapor → hisse bazlı dağılım (scraper, workflow, API, UI) · Portföy Ağı D (küme) + E (mobil şerit) · "Bu hisseyi tutan fonlar" · sabah boş liste (D1 + cache + istemci son-iyi-kopya + diag) · kripto kümesine BIST sızması · XU100 gün içi güncelleme · kritik haber: Faiz Kararı + Kredi Notu · takvim FOMC tarihleri · nitelikli/genel yatırımcı rozeti + filtre (SPK 50 mn TL) · tanıtım videosu 68 sn + Shorts 28 sn + bumper 5 sn · regime etiketi kaldırma · donut kaldırma.
