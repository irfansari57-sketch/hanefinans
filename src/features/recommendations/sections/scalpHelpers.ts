import { ema, sma } from '@/lib/indicators';
import type { ScalpRec, ScalpTf } from './types';

/**
 * 5m bar'ları 3'erli birleştirip 15m bar'a çevir.
 */
export function aggregateTo15m(closes5m: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < closes5m.length; i += 3) {
    const chunk = closes5m.slice(i, Math.min(i + 3, closes5m.length));
    if (chunk.length === 0) continue;
    // close = son bar'ın close'u (3 5m → 1 15m)
    out.push(chunk[chunk.length - 1]);
  }
  return out;
}

/**
 * Selected timeframe için long sinyalini çıkar.
 * 5m/15m: scalp detect (EMA 50 vs 200), 1h/4h/1d: trend analizi.
 */
export function isLongForTf(rec: ScalpRec, tf: ScalpTf): boolean {
  switch (tf) {
    case '5m': return rec.scalp5mLong;
    case '15m': return rec.scalp15mLong;
    case '1h': return rec.trend1h?.trend === 'long';
    case '4h': return rec.trend4h?.trend === 'long';
    case '1d': return rec.trend1d?.trend === 'long';
  }
}

export function tfLabel(tf: ScalpTf): string {
  return { '5m': '5DK', '15m': '15DK', '1h': '1H', '4h': '4H', '1d': '1G' }[tf];
}

/** Sadece 5m/15m fresh golden cross destekler (1h/4h/1d trend analizinde yok). */
export function isFreshForTf(rec: ScalpRec, tf: ScalpTf): boolean {
  if (tf === '5m') return rec.scalp5mFreshCross;
  if (tf === '15m') return rec.scalp15mFreshCross;
  return false;
}

/** TF-specific score — sıralama için. */
export function scoreForTf(rec: ScalpRec, tf: ScalpTf): number {
  switch (tf) {
    case '5m': return rec.scalp5mScore;
    case '15m': return rec.scalp15mScore;
    case '1h':
    case '4h':
    case '1d':
      // Trend analizi 'long' ise 10 puan baz, neutral 0, short -10
      const t = tf === '1h' ? rec.trend1h : tf === '4h' ? rec.trend4h : rec.trend1d;
      if (!t) return 0;
      if (t.trend === 'long') return 10;
      if (t.trend === 'short') return -10;
      return 0;
  }
}

/**
 * MA Üçlü Üst (5-8-13) — güçlü kısa vade yukarı trend sinyali.
 *  - Fiyat MA 5, MA 8, MA 13'ün tamamının üstünde (üç MA da üstte)
 *  - MA 5 > MA 8 > MA 13 dizilim (sağlamlık testi)
 *  - Taze trend: son 5 bar öncesinde böyle değildi → bonus
 *
 * Fibonacci kısa periyot — momentum başlangıcını erken yakalar.
 * En az 13 bar veri gerek (yetersizse false döner).
 */
export function detectGoldenCross(closes: number[]): { isLong: boolean; score: number; freshCross: boolean } {
  if (closes.length < 13) return { isLong: false, score: 0, freshCross: false };
  const last = closes[closes.length - 1];
  const ma5Arr = sma(closes, 5);
  const ma8Arr = sma(closes, 8);
  const ma13Arr = sma(closes, 13);
  const ma5 = ma5Arr.at(-1) ?? NaN;
  const ma8 = ma8Arr.at(-1) ?? NaN;
  const ma13 = ma13Arr.at(-1) ?? NaN;
  if (!Number.isFinite(ma5) || !Number.isFinite(ma8) || !Number.isFinite(ma13)) {
    return { isLong: false, score: 0, freshCross: false };
  }

  // Üçü de fiyatın altında + sağlam dizilim (5>8>13)
  const above5 = last > ma5;
  const above8 = last > ma8;
  const above13 = last > ma13;
  const properStack = ma5 > ma8 && ma8 > ma13;
  const isLong = above5 && above8 && above13 && properStack;

  // Taze trend: son 5 bar önce bu durumda değildi
  const lookback = Math.min(5, ma5Arr.length - 1);
  const ma5Past = ma5Arr[ma5Arr.length - 1 - lookback];
  const ma8Past = ma8Arr[ma8Arr.length - 1 - lookback];
  const ma13Past = ma13Arr[ma13Arr.length - 1 - lookback];
  const lastPast = closes[closes.length - 1 - lookback];
  const wasLong = Number.isFinite(ma5Past) && Number.isFinite(ma8Past) && Number.isFinite(ma13Past)
    ? lastPast > ma5Past && lastPast > ma8Past && lastPast > ma13Past && ma5Past > ma8Past && ma8Past > ma13Past
    : true;
  const freshCross = isLong && !wasLong;
  const distancePct = ((last - ma13) / ma13) * 100;
  const score = (isLong ? 10 : 0) + (freshCross ? 5 : 0) + Math.min(distancePct, 5);
  return { isLong, score, freshCross };
}
