import { describe, it, expect } from 'vitest';
import { evaluateSignals, type Bar } from './signals';

function mkBars(closes: number[], vols?: number[]): Bar[] {
  return closes.map((c, i) => ({
    date: new Date(Date.UTC(2026, 0, 1) + i * 86400_000).toISOString().slice(0, 10),
    open: c * 0.995, high: c * 1.01, low: c * 0.99, close: c, volume: vols?.[i] ?? 1_000_000,
  }));
}

describe('signals', () => {
  it('veri yetersizse boş döner', () => {
    expect(evaluateSignals(mkBars(Array.from({ length: 30 }, () => 100)))).toEqual([]);
  });

  it('istikrarlı yükseliş → momentum; endeks yükselişte uyumlu, düşüşte karşı', () => {
    // Dalgalı yükseliş (+1,2% / −0,6% dönüşümlü) — RSI 55-70 bandında kalır, sürekli artış RSI'ı 100 yapardı
    const closes: number[] = [100];
    for (let i = 1; i < 120; i++) closes.push(closes[i - 1] * (i % 2 ? 1.012 : 0.994));
    const s = evaluateSignals(mkBars(closes), 'yükseliş');
    const mom = s.find((x) => x.kind === 'momentum');
    expect(mom).toBeTruthy();
    expect(mom!.regimeFit).toBe('uyumlu');
    expect(evaluateSignals(mkBars(closes), 'düşüş').find((x) => x.kind === 'momentum')!.regimeFit).toBe('karşı');
  });

  it('20 günlük kırılım + hacim teyidi → kirilim (güç ≥ 2)', () => {
    const closes = Array.from({ length: 100 }, () => 100);
    closes[99] = 104; // bugün önceki 20 günün en yükseğinin (101) üstünde
    const vols = Array.from({ length: 100 }, () => 1_000_000);
    vols[99] = 3_000_000;
    const s = evaluateSignals(mkBars(closes, vols));
    const k = s.find((x) => x.kind === 'kirilim');
    expect(k).toBeTruthy();
    expect(k!.strength).toBeGreaterThanOrEqual(2);
  });

  it('hacim 5× + %4 düşüş → hacim patlaması aşağı yönlü', () => {
    const closes = Array.from({ length: 100 }, () => 100);
    closes[99] = 96;
    const vols = Array.from({ length: 100 }, () => 1_000_000);
    vols[99] = 5_000_000;
    const s = evaluateSignals(mkBars(closes, vols), 'düşüş');
    const h = s.find((x) => x.kind === 'hacim-patlamasi');
    expect(h?.direction).toBe('aşağı');
    expect(h?.regimeFit).toBe('uyumlu');
  });

  it('RSI 30 altından yukarı dönüş → asiri-satim-donusu', () => {
    // 24 gün sert düşüş (RSI → ~0), sonra 3 gün toparlanma: 3. günde RSI 30'u yukarı keser
    const closes: number[] = Array.from({ length: 72 }, () => 100);
    let p = 100;
    for (let i = 45; i < 69; i++) { p *= 0.98; closes[i] = p; }
    for (let i = 69; i < 72; i++) { p *= 1.04; closes[i] = p; }
    const s = evaluateSignals(mkBars(closes));
    expect(s.some((x) => x.kind === 'asiri-satim-donusu')).toBe(true);
  });

  it('sürekli sert yükseliş → asiri-alim uyarısı (yön: uyarı, rejim nötr)', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 * Math.pow(1.02, i));
    const s = evaluateSignals(mkBars(closes), 'yükseliş');
    const a = s.find((x) => x.kind === 'asiri-alim');
    expect(a?.direction).toBe('uyarı');
    expect(a?.regimeFit).toBe('nötr');
  });

  it('her sinyalde en az bir kanıt satırı ve tarih var', () => {
    const closes: number[] = [100];
    for (let i = 1; i < 120; i++) closes.push(closes[i - 1] * (i % 2 ? 1.012 : 0.994));
    for (const sg of evaluateSignals(mkBars(closes))) {
      expect(sg.evidence.length).toBeGreaterThan(0);
      expect(sg.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
