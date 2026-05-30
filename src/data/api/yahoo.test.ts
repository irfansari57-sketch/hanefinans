import { describe, it, expect } from 'vitest';
import { computePeriodReturns } from './yahoo';

describe('computePeriodReturns', () => {
  it('boş seride boş obje döner', () => {
    expect(computePeriodReturns([])).toEqual({});
  });

  it('tek nokta için boş obje döner', () => {
    const today = Date.now();
    expect(computePeriodReturns([{ date: today, close: 100 }])).toEqual({});
  });

  it('1 günlük artıştan +1g getirisi hesaplar', () => {
    const today = Date.now();
    const day = 86400_000;
    const series = [
      { date: today - day, close: 100 },
      { date: today, close: 110 },
    ];
    const r = computePeriodReturns(series);
    expect(r['1g']).toBeCloseTo(10, 4);
    expect(r['1y']).toBeCloseTo(10, 4); // yıllık tek baseline noktası
  });

  it('1 hafta + 1 ay + 3 ay getirilerini ayrı ayrı hesaplar', () => {
    const today = Date.now();
    const day = 86400_000;
    const series = [
      { date: today - 120 * day, close: 50 }, // 4 ay önce → baseline (1y)
      { date: today - 95 * day, close: 60 }, // ~3a için
      { date: today - 31 * day, close: 80 }, // ~1a için
      { date: today - 8 * day, close: 90 }, // ~1h için
      { date: today - 1 * day, close: 95 }, // ~1g için
      { date: today, close: 100 },
    ];
    const r = computePeriodReturns(series);
    expect(r['1g']).toBeCloseTo(((100 - 95) / 95) * 100, 4);
    expect(r['1h']).toBeCloseTo(((100 - 90) / 90) * 100, 4);
    expect(r['1a']).toBeCloseTo(((100 - 80) / 80) * 100, 4);
    expect(r['3a']).toBeCloseTo(((100 - 60) / 60) * 100, 4);
    expect(r['1y']).toBeCloseTo(((100 - 50) / 50) * 100, 4);
  });

  it('negatif (düşen) seride negatif yüzde döner', () => {
    const today = Date.now();
    const day = 86400_000;
    const series = [
      { date: today - day, close: 200 },
      { date: today, close: 100 },
    ];
    const r = computePeriodReturns(series);
    expect(r['1g']).toBeCloseTo(-50, 4);
  });
});
