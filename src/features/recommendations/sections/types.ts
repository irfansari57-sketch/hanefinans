import type { Stock } from '@/data/types';
import type { TimeframeAnalysis } from '@/lib/multiTimeframe';

/** Bir Recommendations sayfası scalp önerisinin tam state'i. */
export interface ScalpRec {
  stock: Stock;
  // 5dk timeframe — Golden Cross (EMA 50/200) sinyali
  scalp5mLong: boolean;
  scalp5mScore: number;
  scalp5mFreshCross: boolean;
  // 15dk timeframe — 5m bar 3'erli aggregate
  scalp15mLong: boolean;
  scalp15mScore: number;
  scalp15mFreshCross: boolean;
  // Multi-timeframe trend analizi
  trend1h: TimeframeAnalysis | null;
  trend4h: TimeframeAnalysis | null;
  trend1d: TimeframeAnalysis | null;
  // EMA değerleri (günlük)
  emas: { period: number; value: number }[];
  // PRO için: büyük oyuncu eğilimi + algoritmik yorum
  bigPlayerLean: 'alıcı' | 'satıcı' | 'kararsız';
  verdict?: string;
  // Toplam long skoru (sıralama içinm)
  longScore: number;
}

export type ScalpTf = '5m' | '15m' | '1h' | '4h' | '1d';

/**
 * BIST dışındaki extra tarama sembolleri (emtia spot).
 * Yahoo symbol: XAUUSD=X (Altın), XAGUSD=X (Gümüş) — bistSuffix=false ile çekilir.
 */
export interface CustomScanSymbol {
  symbol: string;       // Yahoo ticker (XAUUSD=X)
  displayName: string;
  sector: string;
}
export const CUSTOM_SCAN_SYMBOLS: CustomScanSymbol[] = [
  { symbol: 'XAUUSD=X', displayName: 'Altin Spot (USD)', sector: 'Emtia' },
  { symbol: 'XAGUSD=X', displayName: 'Gumus Spot (USD)', sector: 'Emtia' },
];
export const isCustomSymbol = (sym: string) =>
  CUSTOM_SCAN_SYMBOLS.some((c) => c.symbol === sym);

/**
 * Tarihsel snapshot — algoritmik önerilerin geçmiş performansını takip eder.
 * Her gün ilk başarılı refresh'te bugünün toplam önerilerini kaydederiz.
 */
export interface DailySnapshotEntry {
  symbol: string;
  name?: string;
  entryPrice: number;
  isLongAtEntry: boolean;
  isFreshAtEntry: boolean;
}
export interface DailySnapshot {
  date: string;          // YYYY-MM-DD
  ts: number;            // unix ms (ilk kayıt)
  selectedTf: ScalpTf;
  entries: DailySnapshotEntry[];
}
