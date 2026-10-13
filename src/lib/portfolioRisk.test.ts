import { describe, it, expect } from 'vitest';
import { computeRiskReport } from './portfolioRisk';

describe('computeRiskReport', () => {
  it('boş → null', () => {
    expect(computeRiskReport([])).toBeNull();
  });

  it('10 eşit pozisyon → HHI 0.1, etkin N 10, uyarı yok (konsantrasyon)', () => {
    const pos = Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, marketValue: 100, sector: `Sek${i}` }));
    const r = computeRiskReport(pos)!;
    expect(r.hhi).toBeCloseTo(0.1, 9);
    expect(r.effectiveN).toBeCloseTo(10, 9);
    expect(r.topWeight?.weight).toBeCloseTo(0.1, 9);
    expect(r.warnings.some((w) => w.level === 'high')).toBe(false);
  });

  it('tek pozisyon %60 → high uyarı', () => {
    const r = computeRiskReport([
      { symbol: 'A', marketValue: 600 }, { symbol: 'B', marketValue: 200 }, { symbol: 'C', marketValue: 200 },
    ])!;
    expect(r.topWeight).toEqual({ symbol: 'A', weight: 0.6 });
    expect(r.warnings.some((w) => w.level === 'high' && w.title.includes('A'))).toBe(true);
  });

  it('aynı sembol iki satır → birleştirilir', () => {
    const r = computeRiskReport([{ symbol: 'A', marketValue: 50 }, { symbol: 'A', marketValue: 50 }, { symbol: 'B', marketValue: 100 }])!;
    expect(r.positionCount).toBe(2);
    expect(r.topWeight?.weight).toBeCloseTo(0.5, 9);
  });

  it('sektör ağırlıkları toplamı 1', () => {
    const r = computeRiskReport([
      { symbol: 'A', marketValue: 300, sector: 'Banka' }, { symbol: 'B', marketValue: 300, sector: 'Banka' }, { symbol: 'C', marketValue: 400, sector: 'Enerji' },
    ])!;
    const sum = r.sectors.reduce((s, x) => s + x.weight, 0);
    expect(sum).toBeCloseTo(1, 9);
    expect(r.sectors[0]).toEqual({ sector: 'Banka', weight: 0.6 });
  });

  it('volatilite: sabit fiyat → 0, maks düşüş 0; kapsam 1', () => {
    const closes = { A: new Array(80).fill(10) };
    const r = computeRiskReport([{ symbol: 'A', marketValue: 100 }], closes)!;
    expect(r.vol60Annualized).toBeCloseTo(0, 6);
    expect(r.maxDrawdown60).toBeCloseTo(0, 6);
    expect(r.volCoverage).toBe(1);
  });

  it('volatilite: düzenli %10 düşüş → maks düşüş negatif ve büyük', () => {
    const closes = { A: Array.from({ length: 80 }, (_, i) => 100 * 0.99 ** i) };
    const r = computeRiskReport([{ symbol: 'A', marketValue: 100 }], closes)!;
    expect(r.maxDrawdown60).toBeLessThan(-30);
  });

  it('seri olmayan pozisyon kapsam dışı → volCoverage < 1 ve info uyarısı', () => {
    const closes = { A: new Array(80).fill(10) };
    const r = computeRiskReport([{ symbol: 'A', marketValue: 50 }, { symbol: 'B', marketValue: 50 }], closes)!;
    expect(r.volCoverage).toBeCloseTo(0.5, 9);
    expect(r.warnings.some((w) => w.title.includes('kapsam'))).toBe(true);
  });
});
