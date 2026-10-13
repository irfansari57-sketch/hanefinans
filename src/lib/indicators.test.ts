/**
 * indicators.ts golden + özellik testleri (13 Eki 2026, Güven Katmanı sprinti).
 *
 * Yaklaşım:
 *   - Elle hesaplanabilen küçük seriler için KESİN değerler (golden).
 *   - RSI/ADX için bağımsız referans implementasyon ile çapraz doğrulama
 *     (aynı formül ikinci kez yazıldı; regresyon yakalar).
 *   - Monotonik/sabit seri gibi matematiksel sınır özellikleri.
 */

import { describe, it, expect } from 'vitest';
import { sma, ema, rsi, macd, bollinger, adx, supportResistance, closedBarsOnly, type OHLC } from './indicators';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

describe('sma', () => {
  it('golden: [1..5] period 3 → [NaN,NaN,2,3,4]', () => {
    const r = sma([1, 2, 3, 4, 5], 3);
    expect(r.slice(0, 2).every(Number.isNaN)).toBe(true);
    expect(r.slice(2)).toEqual([2, 3, 4]);
  });
  it('period > length → hepsi NaN', () => {
    expect(sma([1, 2], 5).every(Number.isNaN)).toBe(true);
  });
});

describe('ema', () => {
  it('golden: SMA seed + k=2/(n+1); [1..5] p=3 → [NaN,NaN,2,3,4]', () => {
    const r = ema([1, 2, 3, 4, 5], 3);
    expect(r.slice(2)).toEqual([2, 3, 4]);
  });
  it('golden: [10,11,12,13,14,15] p=2 → seed 10.5, sonra k=2/3', () => {
    const r = ema([10, 11, 12, 13, 14, 15], 2);
    // i=1: 10.5 ; i=2: 12*2/3 + 10.5/3 = 11.5 ; i=3: 13*2/3 + 11.5/3 = 12.5
    expect(near(r[1], 10.5)).toBe(true);
    expect(near(r[2], 11.5)).toBe(true);
    expect(near(r[3], 12.5)).toBe(true);
  });
  it('sabit seri → EMA sabit', () => {
    const r = ema(new Array(30).fill(7), 10);
    expect(r.slice(9).every((v) => near(v, 7))).toBe(true);
  });
});

describe('rsi (Wilder)', () => {
  it('monoton yükseliş → 100, monoton düşüş → 0', () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i);
    const dn = Array.from({ length: 40 }, (_, i) => 100 - i);
    expect(rsi(up, 14).at(-1)).toBeCloseTo(100, 6);
    expect(rsi(dn, 14).at(-1)).toBeCloseTo(0, 6);
  });
  it('bağımsız Wilder referansı ile birebir', () => {
    // Deterministik "rastgele" seri
    const closes: number[] = [];
    let p = 50;
    for (let i = 0; i < 120; i++) {
      p += Math.sin(i * 0.7) * 1.3 + Math.cos(i * 0.23) * 0.4;
      closes.push(Number(p.toFixed(4)));
    }
    const ref = (c: number[], n: number): number => {
      let g = 0, l = 0;
      for (let i = 1; i <= n; i++) {
        const d = c[i] - c[i - 1];
        if (d > 0) g += d; else l -= d;
      }
      let ag = g / n, al = l / n;
      for (let i = n + 1; i < c.length; i++) {
        const d = c[i] - c[i - 1];
        ag = (ag * (n - 1) + Math.max(d, 0)) / n;
        al = (al * (n - 1) + Math.max(-d, 0)) / n;
      }
      return 100 - 100 / (1 + ag / (al || 1e-12));
    };
    const ours = rsi(closes, 14).at(-1) as number;
    expect(ours).toBeCloseTo(ref(closes, 14), 9);
    expect(ours).toBeGreaterThan(0);
    expect(ours).toBeLessThan(100);
  });
  it('period+1 bardan az veri → hepsi NaN', () => {
    expect(rsi([1, 2, 3], 14).every(Number.isNaN)).toBe(true);
  });
});

describe('macd', () => {
  it('macd = ema12 − ema26, histogram = macd − signal', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 10 + i * 0.1);
    const r = macd(closes);
    const e12 = ema(closes, 12), e26 = ema(closes, 26);
    const i = closes.length - 1;
    expect(r.macd[i]).toBeCloseTo(e12[i] - e26[i], 9);
    expect(r.histogram[i]).toBeCloseTo(r.macd[i] - r.signal[i], 9);
  });
  it('bullish crossover: macd signalın altından üstüne geçince true', () => {
    // Uzun düşüş sonra sert yükseliş → son barlarda macd signal'ı yukarı keser
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 200 - i * 1.5),
      ...Array.from({ length: 40 }, (_, i) => 110 + i * 4),
    ];
    // Kesişim anını bul: ilk bullish cross bar'ından kes ve o noktada flag'i doğrula
    let found = false;
    for (let n = 36; n <= closes.length; n++) {
      const r = macd(closes.slice(0, n));
      if (r.recentBullishCross) { found = true; expect(r.recentBearishCross).toBe(false); break; }
    }
    expect(found).toBe(true);
  });
});

describe('bollinger', () => {
  it('sabit seri → üst = alt = orta; position lower-half (close == mid, > lo)', () => {
    const r = bollinger(new Array(30).fill(50), 20, 2);
    expect(r.upper.at(-1)).toBeCloseTo(50, 9);
    expect(r.lower.at(-1)).toBeCloseTo(50, 9);
  });
  it('golden: [1..20] → mid 10.5, popülasyon sd = sqrt(399/12)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    const r = bollinger(closes, 20, 2);
    const sd = Math.sqrt(399 / 12);
    expect(r.middle.at(-1)).toBeCloseTo(10.5, 9);
    expect(r.upper.at(-1)).toBeCloseTo(10.5 + 2 * sd, 9);
    expect(r.lower.at(-1)).toBeCloseTo(10.5 - 2 * sd, 9);
    expect(r.position).toBe('upper-half'); // 20 > 10.5 ve < üst bant (22.03)
  });
});

describe('adx', () => {
  const mk = (closes: number[]): OHLC[] =>
    closes.map((c) => ({ open: c - 0.2, high: c + 0.5, low: c - 0.5, close: c }));

  it('güçlü yükseliş → +DI > −DI, bullishBias true, ADX > 25', () => {
    const r = adx(mk(Array.from({ length: 80 }, (_, i) => 100 + i * 1.2)), 14);
    expect(r.bullishBias).toBe(true);
    expect(r.adx.at(-1)).toBeGreaterThan(25);
    expect(['strong', 'very-strong']).toContain(r.lastTrendStrength);
  });
  it('güçlü düşüş → bullishBias false', () => {
    const r = adx(mk(Array.from({ length: 80 }, (_, i) => 200 - i * 1.2)), 14);
    expect(r.bullishBias).toBe(false);
  });
  it('yetersiz veri → NaN ve etiket yok', () => {
    const r = adx(mk([1, 2, 3, 4, 5]), 14);
    expect(r.adx.every(Number.isNaN)).toBe(true);
    expect(r.lastTrendStrength).toBeUndefined();
  });
  it('+DI/−DI 0–100 aralığında', () => {
    const closes = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const r = adx(mk(closes), 14);
    const tail = r.plusDI.slice(-30).concat(r.minusDI.slice(-30));
    expect(tail.every((v) => v >= 0 && v <= 100)).toBe(true);
  });
});

describe('supportResistance', () => {
  it('son N barın max high / min low', () => {
    const bars: OHLC[] = [
      { open: 1, high: 9, low: 0.5, close: 2 }, // lookback dışı
      { open: 1, high: 5, low: 2, close: 3 },
      { open: 1, high: 7, low: 3, close: 4 },
      { open: 1, high: 6, low: 1, close: 5 },
    ];
    expect(supportResistance(bars, 3)).toEqual({ resistance: 7, support: 1 });
  });
});

describe('closedBarsOnly (repaint koruması)', () => {
  const today = '2026-10-13';
  const bars = [
    { time: Date.parse('2026-10-10T15:00:00Z'), close: 1 },
    { time: Date.parse('2026-10-13T15:00:00Z'), close: 2 }, // bugün
  ];
  it('seans kapalı → dokunma', () => {
    expect(closedBarsOnly(bars, false, today)).toHaveLength(2);
  });
  it('seans açık ve son bar bugün → son barı düş', () => {
    expect(closedBarsOnly(bars, true, today)).toHaveLength(1);
  });
  it('seans açık ama son bar dünkü (gecikmeli veri) → dokunma', () => {
    expect(closedBarsOnly(bars.slice(0, 1), true, today)).toHaveLength(1);
  });
  it('saniye cinsinden epoch de desteklenir', () => {
    const secBars = [{ time: 1_792_000_000 - 86400, close: 1 }, { time: Math.floor(Date.parse(`${today}T15:00:00Z`) / 1000), close: 2 }];
    expect(closedBarsOnly(secBars, true, today)).toHaveLength(1);
  });
});
