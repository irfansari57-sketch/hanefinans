import { describe, it, expect } from 'vitest';
import {
  analyzeTimeframe,
  aggregateTo4h,
  buildVerdict,
  type MultiTimeframeResult,
} from './multiTimeframe';
import type { OhlcvBar } from '@/data/api/yahoo';

describe('analyzeTimeframe', () => {
  it('yetersiz veri olduğunda null döner', () => {
    const closes = Array.from({ length: 10 }, (_, i) => 100 + i);
    expect(analyzeTimeframe(closes, [5, 8, 13, 21, 55])).toBeNull();
  });

  it('artan fiyat serisinde long trend tespit eder', () => {
    // 100 günde monoton artış → tüm EMA'lar son fiyatın altında
    const closes = Array.from({ length: 100 }, (_, i) => 100 + i);
    const a = analyzeTimeframe(closes, [5, 8, 13, 21, 55]);
    expect(a).not.toBeNull();
    expect(a!.trend).toBe('long');
    expect(a!.emasAbove.length).toBeGreaterThanOrEqual(4);
  });

  it('azalan fiyat serisinde short trend tespit eder', () => {
    const closes = Array.from({ length: 100 }, (_, i) => 200 - i);
    const a = analyzeTimeframe(closes, [5, 8, 13, 21, 55]);
    expect(a).not.toBeNull();
    expect(a!.trend).toBe('short');
    expect(a!.emasBelow.length).toBeGreaterThanOrEqual(4);
  });

  it('emaValues map periyot başına son EMA değerini içerir', () => {
    const closes = Array.from({ length: 100 }, (_, i) => 50 + i * 0.5);
    const a = analyzeTimeframe(closes, [5, 21]);
    expect(a).not.toBeNull();
    expect(Object.keys(a!.emaValues).map(Number).sort((x, y) => x - y)).toEqual([5, 21]);
    expect(Number.isFinite(a!.emaValues[5])).toBe(true);
  });
});

describe('aggregateTo4h', () => {
  const mkBar = (t: number, c: number): OhlcvBar => ({
    time: t,
    open: c,
    high: c + 1,
    low: c - 1,
    close: c,
    volume: 100,
  });

  it('4 adet 1h bar → 1 adet 4h bar üretir', () => {
    const bars1h = [mkBar(1, 10), mkBar(2, 12), mkBar(3, 11), mkBar(4, 13)];
    const bars4h = aggregateTo4h(bars1h);
    expect(bars4h).toHaveLength(1);
    expect(bars4h[0].open).toBe(10);
    expect(bars4h[0].close).toBe(13);
    expect(bars4h[0].high).toBe(14); // 13 + 1
    expect(bars4h[0].low).toBe(9); // 10 - 1
    expect(bars4h[0].volume).toBe(400);
  });

  it('eşit olmayan bölme — son chunk daha az bar içerebilir', () => {
    const bars1h = Array.from({ length: 6 }, (_, i) => mkBar(i + 1, 10 + i));
    const bars4h = aggregateTo4h(bars1h);
    expect(bars4h).toHaveLength(2);
    expect(bars4h[1].open).toBe(14); // 5. bar
  });
});

describe('buildVerdict', () => {
  const baseResult: Omit<MultiTimeframeResult, 'verdict'> = {
    symbol: 'TEST',
    label: 'Test',
    price: 100,
    changePct: 1.5,
    tf1h: null,
    tf4h: null,
    tf1d: null,
    bigPlayerLean: 'kararsız',
  };

  it('boş analiz durumunda bile string döner', () => {
    const v = buildVerdict(baseResult);
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });

  it('EMA 5/8 kesişim cümlesi yorumun SONUNDA gelir', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i); // long trend
    const tf1d = analyzeTimeframe(closes, [5, 8, 13, 21, 55, 200]);
    expect(tf1d).not.toBeNull();
    const v = buildVerdict({ ...baseResult, tf1d, changePct: 0.5 });
    const idx = v.indexOf('EMA 5');
    expect(idx).toBeGreaterThan(0);
    // EMA 5/8 cümlesi son cümle olmalı → "Aksiyon önerisi" kelimesi ondan ÖNCE gelir.
    expect(v.indexOf('Aksiyon önerisi')).toBeLessThan(idx);
  });
});
