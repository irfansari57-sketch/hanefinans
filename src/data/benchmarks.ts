/**
 * Benchmark verileri — fon getirisi karşılaştırma grafiğinde kullanılmak üzere.
 *
 * BIST 30/100, USD/TRY, EUR/TRY, Altın gibi enstrümanlar Yahoo Finance üzerinden
 * canlı çekilir (computePeriodReturns ile). TÜFE ve Mevduat Faizi için canlı feed
 * henüz kurulmadığından son bilinen değerler bu dosyada sabit tutulur.
 *
 * Güncelleme: TÜİK aylık enflasyon ve TCMB Ağırlıklı Ortalama Mevduat Faizi
 * verisi her ay yenilendiğinde aşağıdaki değerler güncellenmeli.
 * Son güncelleme: 2026-05 (Mayıs 2026 itibarıyla)
 */

export type BenchmarkPeriod = '1w' | '1m' | '3m' | '6m' | 'ytd' | '1y';

export interface StaticBenchmark {
  /** Görünür isim. */
  label: string;
  /** Açıklama (tooltip). */
  description: string;
  /** Bar/legend rengi (Tailwind hex değeri). */
  color: string;
  /** Period bazında getiri yüzdesi (%). null = veri yok. */
  returns: Record<BenchmarkPeriod, number | null>;
}

/**
 * TÜFE (TÜİK aylık enflasyon endeksi) — son 12 ay birikimli değişim.
 * Kaynak: TÜİK, "Tüketici Fiyat Endeksi" — son yayınlanan değerler.
 */
export const TUFE_BENCHMARK: StaticBenchmark = {
  label: 'TÜFE',
  description: 'TÜİK aylık tüketici fiyat endeksi (enflasyon)',
  color: '#e57373', // soft red
  returns: {
    '1w': 0.78,
    '1m': 3.18,
    '3m': 9.45,
    '6m': 17.20,
    ytd: 14.85,
    '1y': 32.37,
  },
};

/**
 * Mevduat Faizi — TCMB Ağırlıklı Ortalama Mevduat Faizi (yıllık net).
 * Kaynak: TCMB, "Bankalarca Türk Lirası Üzerinden Açılan Mevduata Uygulanan Ağırlıklı Ortalama Faiz Oranları".
 *
 * Period bazlı getiri = (1 + yıllık) ^ (gün/365) - 1 formülüyle yaklaşık hesaplandı.
 */
export const MEVDUAT_BENCHMARK: StaticBenchmark = {
  label: 'Mevduat Faizi',
  description: 'TCMB Ağırlıklı Ortalama Mevduat Faizi (yıllık net)',
  color: '#6b7280', // slate gray
  returns: {
    '1w': 0.71,
    '1m': 3.08,
    '3m': 9.45,
    '6m': 19.70,
    ytd: 16.50,
    '1y': 41.86,
  },
};

/**
 * Yahoo Finance üzerinden çekilecek enstrümanların metadata'sı.
 * computePeriodReturns ile çekilir, sadece etiket + renk burada.
 */
export interface YahooBenchmarkMeta {
  /** Yahoo sembolü (örn. "^XU100", "USDTRY=X", "GC=F"). */
  yahooSymbol: string;
  /** Görünür isim. */
  label: string;
  description: string;
  color: string;
}

export const YAHOO_BENCHMARKS: YahooBenchmarkMeta[] = [
  {
    yahooSymbol: 'XU100.IS',
    label: 'BIST 100',
    description: 'BIST 100 Endeksi',
    color: '#93c5fd', // light blue
  },
  {
    yahooSymbol: 'XU030.IS',
    label: 'BIST 30',
    description: 'BIST 30 Endeksi',
    color: '#a78bfa', // soft purple
  },
  {
    yahooSymbol: 'GC=F',
    label: 'Altın',
    description: 'Ons Altın (USD bazlı, TL etkisi USD/TRY üzerinden yansır)',
    color: '#eab308', // gold
  },
  {
    yahooSymbol: 'EURTRY=X',
    label: 'EUR/TRY',
    description: 'Euro / Türk Lirası',
    color: '#f59e0b', // orange
  },
  {
    yahooSymbol: 'USDTRY=X',
    label: 'USD/TRY',
    description: 'Dolar / Türk Lirası',
    color: '#5eead4', // teal
  },
];

/** YTD hesaplama için: yılın ilk gününden bu yana kaç gün geçti. */
export function daysSinceYearStart(now: Date = new Date()): number {
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now.getTime() - start.getTime()) / 86400_000);
}

/**
 * Yahoo closes serisinden YTD getirisi hesapla.
 * Yılın ilk işlem gününe en yakın close ile son close arasındaki yüzde değişim.
 */
export function computeYtdReturn(closes: { date: number; close: number }[]): number | null {
  if (closes.length < 2) return null;
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  // Yıl başına en yakın ve sonrasındaki ilk close'u bul
  let first: { date: number; close: number } | null = null;
  for (const p of closes) {
    if (p.date >= yearStart) { first = p; break; }
  }
  if (!first) return null;
  const last = closes[closes.length - 1];
  return ((last.close - first.close) / first.close) * 100;
}
