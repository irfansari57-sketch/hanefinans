# NEXT SESSION — Hane Finans

> Son guncelleme: 17 Haziran 2026, 23:45
> Bu dosya, bir sonraki Cowork seansinda nereden devam edilecegini gosterir.

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
| TEFAS Acik/Kapali | Cache cozumu hazir, cron tetikleme bekliyor |
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
