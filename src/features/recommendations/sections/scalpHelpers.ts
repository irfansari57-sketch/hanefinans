import { ema } from '@/lib/indicators';
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
 * Golden Cross dedektörü — güçlü uzun trend sinyali.
 *  - Fiyat EMA 50 üstünde (kısa vade momentum)
 *  - EMA 50 > EMA 200 (golden cross aktif)
 *  - Taze cross: son 10 bar öncesinde 50 < 200 idi → şimdi yukarı kesti = bonus
 *
 * EMA 50/200 5m'de çok daha geç ve güvenli sinyal verir.
 * En az 200 bar veri gerek (yetersizse false döner).
 */
export function detectGoldenCross(closes: number[]): { isLong: boolean; score: number; freshCross: boolean } {
  if (closes.length < 200) return { isLong: false, score: 0, freshCross: false };
  const last = closes[closes.length - 1];
  const ema50Arr = ema(closes, 50);
  const ema200Arr = ema(closes, 200);
  const ema50 = ema50Arr.at(-1) ?? NaN;
  const ema200 = ema200Arr.at(-1) ?? NaN;
  if (!Number.isFinite(ema50) || !Number.isFinite(ema200)) {
    return { isLong: false, score: 0, freshCross: false };
  }

  const goldenCross = ema50 > ema200;
  const aboveEma50 = last > ema50;
  const isLong = goldenCross && aboveEma50;

  // Taze cross: 10 bar önce EMA 50 <= EMA 200 idi, şimdi üstünde
  const lookback = Math.min(10, ema50Arr.length - 1);
  const ema50Past = ema50Arr[ema50Arr.length - 1 - lookback];
  const ema200Past = ema200Arr[ema200Arr.length - 1 - lookback];
  const freshCross = Number.isFinite(ema50Past) && Number.isFinite(ema200Past)
    ? ema50Past <= ema200Past && goldenCross
    : false;

  // Skor: golden cross + aboveEma50 + freshness + above-distance
  const distancePct = ((last - ema200) / ema200) * 100;
  const score = (isLong ? 10 : 0) + (freshCross ? 5 : 0) + Math.min(distancePct, 5);
  return { isLong, score, freshCross };
}
