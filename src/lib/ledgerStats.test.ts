import { describe, it, expect } from 'vitest';
import {
  mean, median, hitRate, pctReturn, forwardClose, computeForward,
  summarizeKind, summarizeByKind, MIN_SAMPLE, type CloseBar,
} from './ledgerStats';

function bars(n: number, start = 100, step = 1): CloseBar[] {
  // İş günü benzeri tarihler: 2026-01-01'den itibaren ardışık günler (hafta sonu önemsiz; sıralama yeter)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    return { date: d.toISOString().slice(0, 10), close: start + i * step };
  });
}

describe('ledgerStats — temel istatistik', () => {
  it('mean / median / hitRate', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(hitRate([2, -1, 0, 3])).toBe(0.5); // sıfır pozitif sayılmaz
    expect(mean([])).toBeNull();
    expect(median([NaN])).toBeNull();
    expect(hitRate([])).toBeNull();
  });

  it('pctReturn — kapanıştan kapanışa yüzde, giriş ≤ 0 → null', () => {
    expect(pctReturn(100, 110)).toBeCloseTo(10);
    expect(pctReturn(100, 95)).toBeCloseTo(-5);
    expect(pctReturn(0, 10)).toBeNull();
  });
});

describe('ledgerStats — forwardClose', () => {
  const b = bars(30);
  it('n işlem günü sonraki barı döndürür (takvim günü değil, bar sayısı)', () => {
    const f = forwardClose(b, b[3].date, 5);
    expect(f).not.toBeNull();
    expect(f!.date).toBe(b[8].date);
    expect(f!.close).toBe(108);
  });
  it('yeterli bar geçmemişse null (doldurma beklemede)', () => {
    expect(forwardClose(b, b[27].date, 5)).toBeNull();
    expect(forwardClose(b, b[0].date, 60)).toBeNull();
  });
  it('tarih tam eşleşmezse önceki son bar temel alınır; dizi öncesi tarih → null', () => {
    // b[4] ve b[5] arasında bir tarih yok; sahte bir "ara" tarih: b[4].date + 'T' ile sıralama > b[4]
    const between = `${b[4].date}x`;
    const f = forwardClose(b, between, 2);
    expect(f!.date).toBe(b[6].date);
    expect(forwardClose(b, '2025-12-31', 2)).toBeNull();
  });
  it('computeForward — hisse + endeks getirileri aynı pencerede', () => {
    const idx = bars(30, 1000, 10); // her gün +10 → 5g: +5% (1000→1050 değil; giriş gün 3: 1030→1080)
    const r = computeForward(b, b[3].date, b[3].close, idx, idx[3].close);
    expect(r.close_5d).toBe(108);
    expect(r.ret_5d).toBeCloseTo(((108 - 103) / 103) * 100);
    expect(r.index_ret_5d).toBeCloseTo(((1080 - 1030) / 1030) * 100);
    expect(r.ret_20d).toBeCloseTo(((123 - 103) / 103) * 100);
    expect(r.ret_60d).toBeNull();
    expect(r.index_ret_60d).toBeNull();
  });
});

describe('ledgerStats — özet ve örneklem eşiği', () => {
  const row = (r5: number | null, i5: number | null = null) => ({
    kind: 'momentum', ret_5d: r5, ret_20d: null, ret_60d: null, index_ret_5d: i5, index_ret_20d: null, index_ret_60d: null,
  });

  it(`n < ${MIN_SAMPLE} → insufficient:true, istatistikler null`, () => {
    const rows = Array.from({ length: MIN_SAMPLE - 1 }, (_, i) => row(i - 5));
    const s = summarizeKind('momentum', rows);
    expect(s.insufficient).toBe(true);
    expect(s.w5.insufficient).toBe(true);
    expect(s.w5.filled).toBe(MIN_SAMPLE - 1);
    expect(s.w5.mean).toBeNull();
    expect(s.w5.hitRate).toBeNull();
  });

  it('n ≥ eşik → mean/median/hitRate/meanExcess hesaplanır; bekleyen (null) kayıtlar filled sayılmaz', () => {
    const rows = [
      ...Array.from({ length: 15 }, () => row(2, 1)),   // +2, endeks +1 → fazla +1
      ...Array.from({ length: 5 }, () => row(-1, 1)),   // −1, endeks +1 → fazla −2
      row(null), row(null),                             // henüz dolmamış
    ];
    const s = summarizeKind('momentum', rows);
    expect(s.n).toBe(22);
    expect(s.insufficient).toBe(false);
    expect(s.w5.filled).toBe(20);
    expect(s.w5.insufficient).toBe(false);
    expect(s.w5.mean).toBeCloseTo((15 * 2 - 5) / 20);
    expect(s.w5.median).toBe(2);
    expect(s.w5.hitRate).toBeCloseTo(0.75);
    expect(s.w5.meanExcess).toBeCloseTo((15 * 1 - 5 * 2) / 20);
    // 20g penceresi hiç dolmamış → yetersiz
    expect(s.w20.filled).toBe(0);
    expect(s.w20.insufficient).toBe(true);
  });

  it('summarizeByKind — kurala göre gruplar', () => {
    const rows = [row(1), { ...row(1), kind: 'kirilim' }, { ...row(1), kind: 'kirilim' }];
    const out = summarizeByKind(rows);
    expect(out.map((k) => [k.kind, k.n])).toEqual([['momentum', 1], ['kirilim', 2]]);
  });
});
