# NEXT SESSION — Hane Finans

> Son guncelleme: 19 Haziran 2026 (Cowork plugin tamamlandi)
> Bu dosya, bir sonraki Cowork seansinda nereden devam edilecegini gosterir.

---

## BU SEANSDA NE BITTI? (19 Haziran)

### Cowork Plugin (yayinda - test bekliyor)
- **Repo:** https://github.com/irfansari57-sketch/hanefinans-cowork-plugin
- 9 skill: bist-snapshot, stock-deep-dive, tefas-fon-arama, bist-strong-buy, doviz-emtia-bulteni, fon-onerisi, portfoy-analiz, gunluk-brief, piyasa-haberleri
- 7 slash command: /piyasa, /hisse, /fon, /strongbuy, /doviz, /fononeri, /brief, /haberler
- marketplace.json + README + LICENSE (MIT)
- Veri kaynaklari: /api/yahoo/snapshot, /data/tefas.json, /api/agents/briefing, /api/news, /data/broker-recommendations.json
- Ana repo'da .gitignore'a `hanefinans-plugin/` eklendi — plugin sadece kendi repo'sunda yasiyor

**INSTALL DURUMU:**
- Cowork desktop Plugin Directory sadece Anthropic & Partners gosteriyor (custom marketplace yok henuz)
- Claude Code CLI yolu: Claude Pro/Max abonelik gerektiriyor (ELITE tier yetmedi)
- Yolar:
  - A) Cowork custom marketplace destegi gelene kadar bekle (en mantikli)
  - B) Anthropic Console API key + Claude Code CLI ($5 free credit)
  - C) Claude Pro al ($20/ay) -> Claude Code dahil

**SONRAKI SEANS:** Cowork custom marketplace destegi gelmis mi kontrol et; gelmediyse plugin'i Anthropic partner programina basvur (https://www.anthropic.com/partners)

### Txn auto-recalc cloud sync (push edildi - canli)
- `functions/api/portfolio/txns/[id].ts` cloud PUT/DELETE endpoint
- `portfolioSync.ts`: cloudUpdateTxn, cloudDeleteTxn, recalcPositionFromTxns
- `TxnHistoryModal.tsx`: delete/edit sonrasi cloud + Dexie sync + pozisyon recalc
- Commit `2a435d1` push edildi (Cloudflare deploy aktif)

---

## BU SEANSDA NE BITTI? (18 Haziran)

### Fonlar sayfasi: TEFAS sutunu + "TEFAS Kapali" tab
- `FundsPage.tsx`: TEFAS sutunu (yesil Check / kirmizi X) — Semsiye/Kategori ile Gun % arasinda
- "Serbest" tab adi -> **"TEFAS Kapali"** (kullanici "Serbest" ifadesini anlamiyordu)
- TEFAS Kapali tab: kirmizi danger tema
- Banner 3 madde: Serbest fonlar (SPK 10M TL), Banka ozel/sepet hesap, BES/girisim/gayrimenkul

### Frontend cache JSON kesin garanti (TLY/EKL fix)
- `tefasGithub.ts` `ensureOpenCodes()` async loader: `tefas-open-codes.json` cache fetch
- `mapTefasToPerformance` cache-wins logic — backend cron icin gec calismasi sorun olmaz
- 1012 fonun kesin listesi frontend'de oturuyor
- Heuristic minimuma indirildi: sadece EMEKLILIK, GIRISIM SERMAYESI, GAYRIMENKUL

### Portfoy donut chart (Pasta grafik dagilim)
- `PortfolioDonut.tsx` (yeni component): SVG-based, recharts'siz, ~3KB
- 12 renkli palet, "Diger" grupland (8+ fon)
- Hover: 4px disa shift + merkez detay
- Legend: yuzde + deger
- Hem **FundsPanel**'a hem **PortfolioPage**'e entegre

### Portfoy Cloud Sync (D1)
- `functions/migrations/011_portfolio.sql`: `portfolio_positions` + `portfolio_txns` tablolari (CASCADE delete)
- `functions/api/portfolio/index.ts`: GET (positions + txns) + POST (server-side agirlikli ortalama)
- `functions/api/portfolio/[id].ts`: PUT (update) + DELETE
- `src/data/portfolioSync.ts`: `cloudFetch`, `cloudAddPosition`, `cloudUpdatePosition`, `cloudDeletePosition`, `migrateDexieToCloud`, `cloudToDexiePosition`, `cloudToDexieTxn`, `shouldUseCloud`
- `Layout.tsx`: kullanici login olunca otomatik cloud sync (Dexie'yi ezer, Dexie'de veri varsa one-time migration)
- **PortfolioPage** + **FundsPanel**: AddForm/EditForm/Delete -> auth'lu kullanicida cloud, anonimde Dexie

### KRITIK: 011 migration calistirilmali
```powershell
cd C:\dev\hanefinans
npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/011_portfolio.sql
```
Bu komut **bir kez** calistirilmadan cloud sync uretimde calismaz (POST 500 doner, Dexie fallback'a duser).

---

## DUN GECE NE BITTI? (17 Haziran)

### TEFAS Acik/Kapali — KOKTEN COZUM (3 katmanli)
- `scripts/tefas_fetch.py` `fetch_tefas_open_codes()`:
  1. **`requests.get(Takasbank URL)`** dene
  2. Fail olursa **`curl_cffi` chrome131 impersonation**
  3. O da fail olursa **`data/tefas-open-codes.json` cache** (1012 fon, repo'ya gomulu)
- Takasbank otoriter kaynak — TEFAS'i isleten kurumun resmi listesi
- Heuristic (PAYLASIMLI HESAP, SEPET HESAP vs.) son fallback olarak kalir
- EKL ve benzeri tum kapali fonlar artik KESIN dogru isaretlenir

### Risk Profili (Asama 2)
- 6 soruluk anket (yas, vade, tolerans, amac, deneyim, **principle**)
- Skor 0-100, 5 profil (Cok Konservatif -> Agresif)
- **Katilim Endeksi** (faizsiz) ilkesi: weights remap + portfoy filter
- Min 5 fon garantisi (filler mantigi)
- ZA2 leak fix (strict `tefasOpen === true`)
- localStorage persist

### Portfoyum (yeni ozellik paketi)
- **Hisse + Fon tab'lari** (`fa.portfolio.tab` persist)
- **FundsPanel** yeni component: TEFAS arama, NAV gosterimi, Adet/Mevcut NAV/Deger/Kar-Zarar sutunlari
- **Agirlikli ortalama maliyet** (ayni sembole yeni alim -> eski+yeni weighted avg)
- **Pozisyon duzenleme** (Pencil ikonu + Modal: lot/avg/not)
- **Islem gecmisi** (yeni `portfolioTxns` Dexie tablosu v6):
  - Her alimda transaction kaydet (positionId + tarih + fiyat)
  - History ikonu + TxnHistoryModal: tarih/adet/fiyat/toplam tutar/not
  - **Inline edit**: satirda Pencil -> input'lar -> Check/X kaydet
  - Geriye donuk tarih girilebilir (max bugun)
- **NAV otomatik doldurma** (fon secince NAV form'a gelir)
- **Hisse autocomplete**'a fiyat + gunluk % goster

### FundDetailPage
- "TEFAS'ta Kapali" badge geri eklendi (kategori chip yaninda kirmizi)
- Tooltip: SPK nitelikli yatirimci 10M TL+ aciklamasi
- `computeTefasOpenClient` export edildi

### Push edilen commit'ler (son 12 saat)
- `0ea3034` ZA2 + SEPET HESAP/BES/Garantili fonlar TEFAS Kapali
- `9f2bd06` ZA2 leak fix + Katilim Endeksi ilkesi
- `e02871f` Risk Profili + Otomatik Portfoy Onerisi (Asama 2)
- `500915d` PAYLASIMLI HESAP kapsama + NAV seciminde + duzenleme
- `04bcfa3` Toptan TEFAS Acik/Kapali - resmi liste + portfoy iyilestirmeleri
- `cea5329` tefasfon DataFrame TEFAS durumu field okuma
- `a5ecf06` curl-cffi chrome131 TEFAS bot protection bypass
- `4a53154` Takasbank TEFAS listesi + agirlikli ortalama + Deger sutunu
- `d43a70b` Takasbank fetch icin curl_cffi chrome131 fallback
- `adc6fb5` data/tefas-open-codes.json cache - garanti calisir
- `a6a3d97` Islem gecmisi inline edit (tarih+adet+fiyat+not)

---

## YARIN ILK YAPILACAK (mutlaka)

### 0. D1 portfolio migration calistir (5 dk) — KRITIK
```powershell
cd C:\dev\hanefinans
npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/011_portfolio.sql
```
Beklenen cikti: "Executed N queries... in M ms"
Bunsuz cloud sync API'leri 500 doner (frontend Dexie fallback'a duser ama bulut yok).

### 0.5. Build + push (bu seansin save sync paketi)
```powershell
cd C:\dev\hanefinans
npm run build
git add src/features/portfolio/PortfolioPage.tsx src/features/portfolio/FundsPanel.tsx
git commit -m "portfoy: save/update/delete D1 sync (hisse + fon)"
git push
```
Sandbox truncation oldugu icin commit Cowork seansinda yapilamadi, **bu paket henuz push'lanmamis** olabilir. `git status` ile kontrol et.

### 1. TEFAS Cache cozumu DOGRULA (5 dk)
1. https://github.com/irfansari57-sketch/hanefinans/actions/workflows/tefas-fetch.yml
2. **Run workflow** → main → calistir
3. Bittikten sonra `git pull` + EKL kontrol:
   ```powershell
   $json = Get-Content data/tefas.json -Raw
   foreach ($c in 'EKL','KHP','ZA2','KFZ','CPU','YHK','AAL') {
       $pattern = '"code"\s*:\s*"' + $c + '"[^}]*?"tefasOpen"\s*:\s*(true|false)'
       if ($json -match $pattern) { "$c tefasOpen: $($matches[1])" }
   }
   ```
4. **EKL=false** olmali, fonlar sayfasinda EKL Serbest tab'inda olmali

### 2. CI #194 TypeScript hatalari temizle (30-45 dk)
9 error + 12 warning var:
- `src/lib/multiTimeframe.test.ts:95` EMA 5/8 kesisim cumlesi yorumun EN BASINDA gelir — testimiz fail
- `src/components/domain/AdVideo.tsx` 7 hata:
  - L23-25: `useState` conditional hooks
  - L29: `useEffect` conditional hooks
  - L78: `useEffect` conditional hooks
  - L101, L163: `<audio>` / `<video>` `<track>` for captions eksik
- `functions/api/cron/daily-report.ts:165` Forbidden non-null assertion
- `functions/api/auth/delete-account.ts:11` Unused `UserRow`
- `functions/api/ai/screener.ts:197, L275` Unnecessary escape character, unused caught error

Bu hatalar Cloudflare Pages deploy'unu etkilemiyor (data cron'larda CI bypass) ama temiz olmali.

### 3. tefas.json "Extra data" bug (30 dk)
PowerShell `ConvertFrom-Json` fail oluyor: `Invalid JSON primitive: .`
- Backend cron'da `tefas.json` ya iki kez yaziliyor ya da yarim yazim
- Frontend tarafinda yine de calisiyor cunku tarayicilar daha tolerantsi olabilir
- `scripts/tefas_fetch.py` atomic write: tmp dosyaya yaz, sonra `os.replace()` ile rename

---

## YARIN OPSIYONEL (sira)

### 4. Finora rebrand (Faz 2 — uygulama)
- Logo (basit, monogram)
- Sidebar slogan + index.html title + meta + JSON-LD: zaten "Veri · Analiz · Firsat" yazildi
- "Hane Finans" → "Finora" / "Finsardes" — karar verilmeli
- TURKPATENT tescil arama

### 5. Cowork Plugin (8 skill + slash + marketplace)
- `cowork-plugin/` klasor yapisi var (manifest hazir, ID #146)
- Eksik: skill icerikleri (#147), slash commands (#148), marketplace.json (#149)
- Genis is — 4-6 saat

### 6. Asama 3: Liste pratiklik
- Filtre persist
- Hizli arama
- Kategori filter chip'leri

---

## BEKLEYEN KUCUK ISLER

- **#190** PowerShell push dogrulama (zaten devam ediyor)
- **#198-200** Finora marka arastirma + uygulama
- **#147-149** Cowork Plugin
- TEFAS feed atomic write bug

---

## ONEMLI NOTLAR

### Mount-sync truncation
- Cowork sandbox'in Linux mount'u Windows ile arasinda kronik truncation var
- `npx tsc --noEmit` Linux mount'tan calistirildiginda yanlis hatalar veriyor
- **DAIMA** kullanici PowerShell'de `npm run typecheck` koşturmali

### Cherry-pick push stratejisi
Push divergent oluyorsa:
```powershell
$myCommit = (git log -1 --format=%H)
git fetch origin
git reset --hard origin/main
git cherry-pick $myCommit
git push origin main
```

### data/tefas-open-codes.json guncelleme
- Takasbank Excel'i Cron'da cekemezse bu cache devrede
- Periyodik (aylik) elle guncelleme:
  1. https://www.takasbank.com.tr/plugins/ExcelExportTefasFundsTradingInvestmentPlatform?language=tr
  2. Excel indir, Cowork seansinda upload
  3. data/tefas-open-codes.json regenerate (agent'a okutturup yazdir)
  4. Commit + push

---

## GUNCEL DURUM OZETI

| Konu | Durum |
|---|---|
| TEFAS Acik/Kapali | Frontend cache JSON kesin (1012 fon), backend cron destek |
| Fonlar sayfasi TEFAS sutunu + Kapali tab | TAMAM |
| Portfoy pasta grafik (donut) | TAMAM (hisse+fon) |
| Portfoy D1 cloud sync | KOD HAZIR, migration + push bekliyor |
| Portfoyum (Hisse+Fon+Gecmis+Edit) | TAMAM, production'da |
| Risk Profili + Katilim | TAMAM |
| FundDetailPage badge | TAMAM |
| Bundle optimization | TAMAM (vendor chunks ayri) |
| Mobile compact | TAMAM |
| Premium typography | TAMAM (Inter Variable) |
| PWA + Push | TAMAM |
| Alarm + Streak + Prediction game | TAMAM |
| Brief (sabah ozet) | KALDIRILDI |
| Watchlist + Funds tab + Strong Buy | TAMAM |
| CI Build | KIRIK (9 error, frontend deploy etkilemiyor) |
| Finora rebrand | YARIM (Faz 1: slogan + meta) |
| Cowork Plugin | BASLANGIC (klasor + manifest) |
