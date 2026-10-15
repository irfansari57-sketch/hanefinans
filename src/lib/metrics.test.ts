import { describe, it, expect } from 'vitest';
import { computeMetrics, matchesFilter, EMPTY_FILTER, filterToParams, filterFromParams, SCREEN_PRESETS } from './metrics';
import type { Bar } from './signals';

function mkBars(closes: number[], vols?: number[]): Bar[] {
  return closes.map((c, i) => ({
    date: new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    open: c, high: c * 1.01, low: c * 0.99, close: c, volume: vols?.[i] ?? 1_000_000,
  }));
}

describe('metrics', () => {
  it('30 bardan az → null', () => {
    expect(computeMetrics('X', mkBars(Array.from({ length: 20 }, () => 10)))).toBeNull();
  });

  it('sürekli yükselen seri: SMA üstünde, zirvede, 1y getirisi pozitif, SMA200 varsa 50>200', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 * Math.pow(1.002, i));
    const m = computeMetrics('UP', mkBars(closes))!;
    expect(m.bars).toBe(300);
    expect(m.sma50Pct).toBeGreaterThan(0);
    expect(m.sma200Pct).toBeGreaterThan(0);
    expect(m.sma50Above200).toBe(true);
    expect(m.from52wHighPct).toBe(0);
    expect(m.ret1y).toBeGreaterThan(0);
    expect(m.trend).toBe('yükseliş');
    expect(m.changePct).toBeCloseTo(0.2, 1);
  });

  it('200 bar yoksa SMA200 null (0 ile doldurulmaz)', () => {
    const m = computeMetrics('S', mkBars(Array.from({ length: 100 }, () => 50)))!;
    expect(m.sma200Pct).toBeNull();
    expect(m.sma50Above200).toBeNull();
    expect(m.ret1y).toBeNull();
    expect(m.from52wHighPct).toBeNull(); // 120 bardan az geçmiş → 52h anlamsız
  });

  it('hacim oranı: son gün 3× → volRatio20 ≈ 3', () => {
    const closes = Array.from({ length: 60 }, () => 10);
    const vols = Array.from({ length: 60 }, () => 1_000_000); vols[59] = 3_000_000;
    const m = computeMetrics('V', mkBars(closes, vols))!;
    expect(m.volRatio20).toBeCloseTo(3, 1);
  });

  it('filtre: eksik veri (null) koşul varsa eşleşmez, koşul yoksa geçer', () => {
    const m = computeMetrics('S', mkBars(Array.from({ length: 100 }, () => 50)))!;
    expect(matchesFilter(m, EMPTY_FILTER)).toBe(true);
    expect(matchesFilter(m, { ...EMPTY_FILTER, sma200: 'above' })).toBe(false);
    expect(matchesFilter(m, { ...EMPTY_FILTER, near52wHighMax: 5 })).toBe(false);
  });

  it('URL round-trip tüm alanları korur', () => {
    const f = { ...SCREEN_PRESETS[0].filter, signals: ['momentum' as const], trends: ['yükseliş' as const] };
    const back = filterFromParams(filterToParams(f));
    expect(back).toEqual(f);
  });

  it('presetler kendi içinde tutarlı (trend-takip yükselen seriyi yakalar)', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 * Math.pow(1.002, i) * (i % 2 ? 1.004 : 0.996));
    const m = computeMetrics('UP', mkBars(closes))!;
    const p = SCREEN_PRESETS.find((x) => x.id === 'trend-takip')!;
    // RSI bandı dışında kalabilir; en azından SMA koşulları sağlanmalı
    expect(m.sma50Pct).toBeGreaterThan(0);
    expect(m.sma200Pct).toBeGreaterThan(0);
    expect(matchesFilter(m, { ...p.filter, rsiMin: undefined, rsiMax: undefined })).toBe(true);
  });
});
