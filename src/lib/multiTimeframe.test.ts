import { describe, it, expect } from 'vitest';
import {
  analyzeTimeframe,
  aggregateTo4h,
  BIST_4H,
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

  // Saatlik epoch (saniye) üretici — UTC 2026-10-13 başlangıç
  const H = 3600;
  const day0 = Math.floor(Date.parse('2026-10-13T00:00:00Z') / 1000);
  const at = (hourUtc: number, c: number) => mkBar(day0 + hourUtc * H, c);

  it('UTC 00-03 saatleri → 1 adet 4h bar (varsayılan hizalama)', () => {
    const bars1h = [at(0, 10), at(1, 12), at(2, 11), at(3, 13)];
    const bars4h = aggregateTo4h(bars1h);
    expect(bars4h).toHaveLength(1);
    expect(bars4h[0].open).toBe(10);
    expect(bars4h[0].close).toBe(13);
    expect(bars4h[0].high).toBe(14); // 13 + 1
    expect(bars4h[0].low).toBe(9); // 10 - 1
    expect(bars4h[0].volume).toBe(400);
  });

  it('kova sınırı saate göre: UTC 00-05 → 2 bar (00-03, 04-05)', () => {
    const bars1h = Array.from({ length: 6 }, (_, i) => at(i, 10 + i));
    const bars4h = aggregateTo4h(bars1h);
    expect(bars4h).toHaveLength(2);
    expect(bars4h[1].open).toBe(14); // 5. bar (UTC 04)
  });

  it('BIST hizası: TR 10-13 / 14-17 / 18 ayrı kovalar, dizinin ortasından başlasa da', () => {
    // TR 10:00 = UTC 07:00. Dizi TR 11:00'dan başlıyor (eski sürüm 4'erli keserdi: 11-14 → yanlış)
    const trHours = [11, 12, 13, 14, 15, 16, 17, 18];
    const bars1h = trHours.map((h, i) => at(h - 3, 100 + i));
    const bars4h = aggregateTo4h(bars1h, BIST_4H);
    expect(bars4h).toHaveLength(3);
    expect(bars4h[0].open).toBe(100); // TR 11-13 (kısmi ilk kova)
    expect(bars4h[1].open).toBe(103); // TR 14-17
    expect(bars4h[2].open).toBe(107); // TR 18 (kapanış kovası)
  });

  it('gün değişince yeni bar başlar (aynı kova numarası olsa bile)', () => {
    const d1 = [at(7, 1), at(8, 2)];                // 13 Eki TR 10-11
    const d2 = [at(24 + 7, 3), at(24 + 8, 4)];      // 14 Eki TR 10-11
    const bars4h = aggregateTo4h([...d1, ...d2], BIST_4H);
    expect(bars4h).toHaveLength(2);
    expect(bars4h[0].close).toBe(2);
    expect(bars4h[1].open).toBe(3);
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

  it('EMA 5/8 kesişim/pozisyon cümlesi Aksiyon önerisinden ÖNCE gelir (kullanıcı pozisyon kararını anında görsün)', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i); // long trend
    const tf1d = analyzeTimeframe(closes, [5, 8, 13, 21, 55, 200]);
    expect(tf1d).not.toBeNull();
    const v = buildVerdict({ ...baseResult, tf1d, changePct: 0.5 });
    // Kısa vade EMA cümlesi (triCrossLine/shortCrossLine) - "Günlük vadede"
    // prefix'i ile başlar ve "kısa periyot" veya "kısa vadeli" ortalamalar geçer.
    const emaSentenceIdx = v.search(/Günlük vadede/);
    expect(emaSentenceIdx).toBeGreaterThanOrEqual(0);
    // "Genel değerlendirme" ile başlayan aksiyon önerisi cümlesi EMA cümlesinden SONRA gelir
    // (actionHintLine "Aksiyon önerisi" değil "Genel değerlendirme:" prefix'i üretiyor)
    const actionIdx = v.indexOf('Genel değerlendirme');
    expect(actionIdx).toBeGreaterThan(emaSentenceIdx);
  });
});
