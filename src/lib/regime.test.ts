import { describe, it, expect } from 'vitest';
import { computeTrend, computeVol, computeBreadth, computeRegime, REGIME_THRESHOLDS } from './regime';

function series<T = number>(n: number, fn: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

describe('regime — trend', () => {
  it('sürekli yükselen seri → yükseliş', () => {
    const closes = series(260, (i) => 100 * Math.pow(1.002, i));
    const t = computeTrend(closes);
    expect(t.regime).toBe('yükseliş');
    expect(t.slope50Pct!).toBeGreaterThan(REGIME_THRESHOLDS.trendSlopeFlatPct);
    expect(t.close).toBeGreaterThan(t.sma50!);
  });
  it('sürekli düşen seri → düşüş', () => {
    const closes = series(260, (i) => 100 * Math.pow(0.998, i));
    expect(computeTrend(closes).regime).toBe('düşüş');
  });
  it('sabit seri → yatay (eğim 0)', () => {
    const closes = series(260, () => 100);
    const t = computeTrend(closes);
    expect(t.regime).toBe('yatay');
    expect(t.slope50Pct).toBe(0);
  });
  it('yetersiz bar → yatay + kanıtta "yetersiz veri"', () => {
    const t = computeTrend(series(30, (i) => 100 + i));
    expect(t.regime).toBe('yatay');
    expect(t.sma50).toBeNull();
    expect(t.evidence.some((e) => /yetersiz/.test(e.value))).toBe(true);
  });
  it('SMA200 yokken 60+ barla yine karar verir', () => {
    const t = computeTrend(series(80, (i) => 100 * Math.pow(1.003, i)));
    expect(t.sma200).toBeNull();
    expect(t.regime).toBe('yükseliş');
  });
});

describe('regime — oynaklık', () => {
  it('son 20 günde sıçrayan vol → yüksek (yüzdelik ≥ 75)', () => {
    // 240 gün sakin (±0.2%), son 20 gün sert (±3%)
    let p = 100; const closes: number[] = [p];
    for (let i = 1; i < 260; i++) {
      const amp = i >= 240 ? 0.03 : 0.002;
      p = p * (1 + (i % 2 === 0 ? amp : -amp));
      closes.push(p);
    }
    const v = computeVol(closes);
    expect(v.regime).toBe('yüksek');
    expect(v.percentile1y!).toBeGreaterThanOrEqual(REGIME_THRESHOLDS.volHighPctile);
  });
  it('son 20 günde sönen vol → düşük', () => {
    let p = 100; const closes: number[] = [p];
    for (let i = 1; i < 260; i++) {
      const amp = i >= 240 ? 0.001 : 0.02;
      p = p * (1 + (i % 2 === 0 ? amp : -amp));
      closes.push(p);
    }
    expect(computeVol(closes).regime).toBe('düşük');
  });
  it('yıllıklandırma: günlük %1 sabit salınım ≈ %16 yıllık', () => {
    let p = 100; const closes: number[] = [p];
    for (let i = 1; i < 260; i++) { p = p * (1 + (i % 2 === 0 ? 0.01 : -0.01)); closes.push(p); }
    const v = computeVol(closes);
    expect(v.realized20!).toBeGreaterThan(14);
    expect(v.realized20!).toBeLessThan(18);
  });
  it('yetersiz veri → normal + yüzdelik null', () => {
    const v = computeVol(series(25, (i) => 100 + (i % 3)));
    expect(v.percentile1y).toBeNull();
    expect(v.regime).toBe('normal');
  });
});

describe('regime — genişlik', () => {
  it('74/537 → zayıf (%12)', () => {
    const b = computeBreadth(74, 537);
    expect(b.regime).toBe('zayıf');
    expect(b.ratioPct).toBe(12);
  });
  it('400/200 → güçlü (%67)', () => expect(computeBreadth(400, 200).regime).toBe('güçlü'));
  it('0/0 → karışık, bölme hatası yok', () => expect(computeBreadth(0, 0).regime).toBe('karışık'));
});

describe('regime — cümle', () => {
  it('veri yetersizse açıkça söyler', () => {
    const r = computeRegime(series(20, (i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, close: 100 + i })));
    expect(r.sentence).toMatch(/veri yetersiz/);
  });
  it('tam veride üç parça birleşir', () => {
    const bars = series(260, (i) => ({ date: String(i), close: 100 * Math.pow(1.002, i) }));
    const r = computeRegime(bars, { advancers: 74, decliners: 537 });
    expect(r.sentence).toMatch(/Yükseliş trendi/);
    expect(r.sentence).toMatch(/oynaklık/);
    expect(r.sentence).toMatch(/dar katılım/);
  });
});
