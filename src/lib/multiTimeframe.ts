/**
 * Çoklu zaman dilimli trend analizi
 *
 * Her sembol için 3 zaman diliminde (1h, 4h, 1d) EMA bazlı long/short yön belirler.
 * Büyük oyuncu eğilimini de MACD + EMA200 pozisyonu üzerinden hesaplar.
 */

import { ema, macd, type OHLC } from './indicators';
import type { OhlcvBar } from '@/data/api/yahoo';

export type Trend = 'long' | 'short' | 'neutral';

export interface TimeframeAnalysis {
  trend: Trend;
  /** EMA dizilim notu (kaç EMA üstte) */
  emaScore: number;
  /** Hangi periyotlar fiyat üzerinde */
  emasAbove: number[];
  /** Hangi periyotlar fiyat altında */
  emasBelow: number[];
}

export interface MultiTimeframeResult {
  symbol: string;
  label: string;
  price: number;
  changePct: number;
  tf1h: TimeframeAnalysis | null;
  tf4h: TimeframeAnalysis | null;
  tf1d: TimeframeAnalysis | null;
  bigPlayerLean: 'alıcı' | 'satıcı' | 'kararsız';
  verdict: string;
}

/** 1h barlardan 4h barlar üret (4 bar = 1 4h bar). */
export function aggregateTo4h(bars1h: OhlcvBar[]): OhlcvBar[] {
  const bars4h: OhlcvBar[] = [];
  for (let i = 0; i < bars1h.length; i += 4) {
    const chunk = bars1h.slice(i, Math.min(i + 4, bars1h.length));
    if (chunk.length === 0) continue;
    bars4h.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + (c.volume ?? 0), 0),
    });
  }
  return bars4h;
}

/**
 * Verilen closes dizisinden EMA dizilimi → trend hesabı
 * Kısa zaman dilimleri için periods=[5,8,13,21,55]
 * Günlük için periods=[5,8,13,21,55,200]
 */
export function analyzeTimeframe(
  closes: number[],
  periods: number[] = [5, 8, 13, 21, 55],
): TimeframeAnalysis | null {
  if (closes.length < Math.max(...periods)) return null;
  const last = closes[closes.length - 1];

  const emaValues = periods.map((p) => ({
    period: p,
    value: ema(closes, p).at(-1) ?? NaN,
  }));

  const validEmas = emaValues.filter((e) => Number.isFinite(e.value));
  if (validEmas.length === 0) return null;

  const emasAbove: number[] = [];
  const emasBelow: number[] = [];
  for (const e of validEmas) {
    if (last >= e.value) emasAbove.push(e.period);
    else emasBelow.push(e.period);
  }

  const score = emasAbove.length / validEmas.length;
  let trend: Trend = 'neutral';
  if (score >= 0.8) trend = 'long';
  else if (score <= 0.2) trend = 'short';

  return { trend, emaScore: emasAbove.length, emasAbove, emasBelow };
}

/**
 * Büyük oyuncu eğilimi: MACD histogram + EMA200 pozisyonu
 * Daily bar üzerinden hesaplanır
 */
export function computeBigPlayerLean(bars: OHLC[]): 'alıcı' | 'satıcı' | 'kararsız' {
  if (bars.length < 200) return 'kararsız';
  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const ema200 = ema(closes, 200).at(-1);
  const macdR = macd(closes);
  const histLast = macdR.histogram.at(-1) ?? 0;
  const histPrev = macdR.histogram.at(-2) ?? 0;

  if (!Number.isFinite(ema200)) return 'kararsız';
  const above200 = last > (ema200 as number);
  const histRising = histLast > histPrev;

  // Güçlü alıcı: 200 üstünde + MACD pozitif + yükseliyor
  if (above200 && histLast > 0 && histRising) return 'alıcı';
  if (above200 && histLast > 0) return 'alıcı';
  // Güçlü satıcı: 200 altında + MACD negatif + düşüyor
  if (!above200 && histLast < 0 && !histRising) return 'satıcı';
  if (!above200 && histLast < 0) return 'satıcı';
  return 'kararsız';
}

/** Multi-timeframe sonucundan kısa Türkçe verdict üret. */
export function buildVerdict(r: Omit<MultiTimeframeResult, 'verdict'>): string {
  const trends = [r.tf1h?.trend, r.tf4h?.trend, r.tf1d?.trend].filter(Boolean);
  const longCount = trends.filter((t) => t === 'long').length;
  const shortCount = trends.filter((t) => t === 'short').length;

  const parts: string[] = [];
  if (longCount === 3) {
    parts.push('Tüm zaman dilimleri LONG yönlü — güçlü yukarı yönlü trend.');
  } else if (shortCount === 3) {
    parts.push('Tüm zaman dilimleri SHORT yönlü — güçlü aşağı yönlü baskı.');
  } else if (longCount === 2) {
    parts.push('İki zaman diliminde LONG eğilim hakim, kısa vadeli toparlanma görünümü.');
  } else if (shortCount === 2) {
    parts.push('İki zaman diliminde SHORT eğilim hakim, satış baskısı sürüyor.');
  } else {
    parts.push('Yön karışık — zaman dilimleri arasında uyumsuzluk var, temkinli ol.');
  }

  if (r.bigPlayerLean === 'alıcı') {
    parts.push('Büyük oyuncular ALICI tarafta — momentum güçlü.');
  } else if (r.bigPlayerLean === 'satıcı') {
    parts.push('Büyük oyuncular SATICI tarafta — pozisyon küçültme görülüyor.');
  } else {
    parts.push('Kurumsal eğilim kararsız.');
  }

  return parts.join(' ');
}
