# Hisseler Sayfası → Akordeon Satır Listesine Çevirme Planı

## Hedef
`/stocks` sayfasını Fonlar (`/funds`) sayfasındaki **akordeon satır** stiline çevirmek. Şu anki klasik `<table>` görünümü, mobile cramped, action butonları az kullanılıyor. Akordeon satır yapısı daha modern ve tıklanırlığı artırıyor.

## Mevcut Durum

### Hisseler (StocksPage.tsx, 440 satır)
- **Görünüm**: Klasik tablo (`<table><thead><tbody><tr><td>`)
- **Sütunlar**: sıra, sembol, isim, fiyat, gün %, 1G/1H/1A/3A/6A/YBB/1Y getiriler, dış linkler
- **Etkileşim**: sembole tıkla → detay; yıldız → watchlist; sıralama tıkla
- **Sayfalama**: Pagination component, 25/sayfa varsayalım
- **Tab**: "Tüm Hisseler" + "Takipte"

### Fonlar (FundsPage.tsx, 672 satır) — hedef stil
- **Görünüm**: `<div className="space-y-1.5">` + her satır `<WatchedFundRow>` (collapse/expand)
- **Summary satırı**: sıra rozeti · kod (FBA gibi) · kategori chip · isim · 3 mini perf chip + 1 büyük perf değeri · yıldız
- **Açılınca**: 7 dönem mini grid (1G/1H/1A/3A/6A/YBB/1Y) + butonlar (Detay/TEFAS/Fintables) + Takipten çıkar
- **Sıralama**: butonlar (1G/1H/1A/3A/6A/YBB/1Y/Kod) + asc/desc

## Plan — Yapılacaklar

### 1. `WatchedStockRow.tsx` componenti oluştur
- `FundsPage > WatchedFundRow`u baz al
- Konum: `src/features/stocks/sections/WatchedStockRow.tsx`
- Props:
  ```ts
  interface WatchedStockRowProps {
    stock: StockRow;        // = Stock & { returns?: PeriodReturns }
    rank: number;
    sortKey: SortKey;       // ör. 'changePct' | 'r1h' | 'r1a' | ...
    isWatched: boolean;
    onToggle: () => void;
  }
  ```
- Summary alanı:
  - Sıra rozeti (rank)
  - Sembol (mono font, kalın)
  - Sektör chip (BIST_UNIQUE'ten)
  - İsim (truncate)
  - 3 mini chip (active hariç en alakalı 3 dönem)
  - Büyük perf değeri (seçili `sortKey`)
  - Yıldız (watchlist toggle)
- Açılan içerik:
  - 7 dönem mini grid (1G/1H/1A/3A/6A/YBB/1Y)
  - Action butonları: Detay (`/stock/${symbol}`), Fintables, KAP (slug varsa)
  - Watchlist'ten çıkar

### 2. `StocksPage.tsx`'i refactor et
- `<table>` bloğunu sil
- Yerine: `<div className="space-y-1.5">` + `paginated.map((s, i) => <WatchedStockRow ... />)`
- Sıralama UI'ı: butonlu period chip'leri (Fonlar gibi)
- Tab yapısı korunsun (Tüm Hisseler / Takipte)

### 3. Period dönüşümleri
- Mevcut StocksPage'in SortKey'leri: `'symbol' | 'price' | 'changePct' | 'r1g' | 'r1h' | 'r1a' | 'r3a' | 'r6a' | 'rytd' | 'r1y'`
- Fonlar SortKey ile uyumlu olsun: `'code' | 'day' | 'week' | 'month' | 'threeMonth' | 'sixMonth' | 'ytd' | 'year' | ...`
- Mapping table: `changePct → day`, `r1h → week`, `r1a → month`, vs.

### 4. Returns hesaplama
- StocksPage zaten `fetchHistoricalYahoo` ile periyot getirilerini hesaplıyor (StockRow.returns)
- Bunu olduğu gibi koru
- WatchedStockRow içinde `stock.returns?.['1h']` gibi okuyup mini chip'lerde göster

### 5. Performans
- Mevcut sayfalama (25/sayfa) korunsun
- Akordeon collapsed durumda DOM hafif olur — tablodan daha hızlı
- Returns lazy fetch (zaten var)

## Tahmini Efor
- WatchedStockRow component: ~150 satır
- StocksPage refactor: ~100 satır değişiklik
- Toplam: 1-2 saat

## Dikkat Edilmesi Gerekenler
- Mobil görünüm: akordeon satır mobile'da daha iyi çalışır ✓
- Returns lazy fetch'in beklediği state durumu (placeholder skeleton)
- Watchlist toggle animasyonu
- Detay link `/stock/${symbol}` route'unu korumalıyız

## Referans Dosyalar
- `src/features/funds/FundsPage.tsx` (satır ~462-580 `WatchedFundRow` component)
- `src/features/stocks/StocksPage.tsx` (mevcut implementation)
- `src/features/recommendations/sections/FundAccordionItem.tsx` (Recommendations'taki fund accordion)

## Sonraki Seans İçin Hızlı Başlangıç
1. `WatchedFundRow`u `WatchedStockRow.tsx` olarak kopyala
2. `FundPerformance` → `StockRow`, `category`/`code` → `sector`/`symbol` field mapping
3. `PERIOD_LABEL` / `SortKey` uyumlama
4. StocksPage'de table → div + map
5. Typecheck + build + deploy
