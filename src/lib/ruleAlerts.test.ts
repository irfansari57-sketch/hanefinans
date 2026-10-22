import { describe, it, expect } from 'vitest';
import { evaluateRule, parseRule, describeRule } from './ruleAlerts';
import type { StockMetrics } from './metrics';
import type { Signal } from './signals';

function m(over: Partial<StockMetrics> = {}): StockMetrics {
  return {
    symbol: 'TEST', asOfDate: '2026-10-21', bars: 300, close: 100, changePct: 1,
    rsi14: 50, sma20Pct: 1, sma50Pct: 2, sma200Pct: 5, sma50Above200: true,
    from52wHighPct: -10, from52wLowPct: 30, volRatio20: 1, ret1w: 1, ret1m: 2, ret3m: 3, ret6m: 4, ret1y: 5,
    vol20: 30, trend: 'yükseliş', signals: [],
    ...over,
  };
}

describe('evaluateRule — RSI eşiği', () => {
  it('rsi_below yalnız eşik altında sağlanır, kanıt satırı taşır', () => {
    const rule = parseRule('rsi_below', { threshold: 30 })!;
    const hit = evaluateRule(rule, m({ rsi14: 27.4 }));
    expect(hit.matched).toBe(true);
    expect(hit.evidence[0]).toMatchObject({ label: 'RSI(14)', value: '27.40' });
    expect(evaluateRule(rule, m({ rsi14: 30 })).matched).toBe(false);
    expect(evaluateRule(rule, m({ rsi14: 45 })).matched).toBe(false);
  });

  it('rsi_above eşik üstünde sağlanır; RSI yoksa insufficient', () => {
    const rule = parseRule('rsi_above', { threshold: 70 })!;
    expect(evaluateRule(rule, m({ rsi14: 71 })).matched).toBe(true);
    expect(evaluateRule(rule, m({ rsi14: 69 })).matched).toBe(false);
    const none = evaluateRule(rule, m({ rsi14: null }));
    expect(none.matched).toBe(false);
    expect(none.insufficient).toBe(true);
  });
});

describe('evaluateRule — SMA kesişimi', () => {
  it('yukarı kesişim: dün SMA50 altı, bugün üstü', () => {
    const any = parseRule('cross_sma50', {})!;
    const up = parseRule('cross_sma50', { direction: 'up' })!;
    const down = parseRule('cross_sma50', { direction: 'down' })!;
    const today = m({ sma50Pct: 0.8 });
    const yesterday = m({ sma50Pct: -0.5, asOfDate: '2026-10-20' });
    expect(evaluateRule(any, today, yesterday).matched).toBe(true);
    expect(evaluateRule(up, today, yesterday).matched).toBe(true);
    expect(evaluateRule(down, today, yesterday).matched).toBe(false);
    expect(evaluateRule(up, today, yesterday).summary).toContain('üstüne');
  });

  it('aşağı kesişim SMA200: dün üstü, bugün altı; kesişim yoksa false; dün yoksa insufficient', () => {
    const down = parseRule('cross_sma200', { direction: 'down' })!;
    expect(evaluateRule(down, m({ sma200Pct: -1.2 }), m({ sma200Pct: 0.4 })).matched).toBe(true);
    expect(evaluateRule(down, m({ sma200Pct: 1.2 }), m({ sma200Pct: 0.4 })).matched).toBe(false);
    const r = evaluateRule(down, m({ sma200Pct: -1.2 }), undefined);
    expect(r.matched).toBe(false);
    expect(r.insufficient).toBe(true);
  });
});

describe('evaluateRule — sinyal ve filtre', () => {
  it('signal kuralı sinyal listesinde eşleşince kanıtı sinyalden alır', () => {
    const rule = parseRule('signal', { kind: 'momentum' })!;
    const sig: Signal = {
      kind: 'momentum', title: 'Momentum', direction: 'yukarı', strength: 2, asOfDate: '2026-10-21', regimeFit: 'uyumlu',
      evidence: [{ label: 'RSI(14)', value: '61.00', source: '55–70 bandı' }],
    };
    const hit = evaluateRule(rule, m(), null, [sig]);
    expect(hit.matched).toBe(true);
    expect(hit.evidence).toEqual([{ label: 'RSI(14)', value: '61.00', source: '55–70 bandı' }]);
    expect(evaluateRule(rule, m(), null, []).matched).toBe(false);
    expect(parseRule('signal', { kind: 'olmayan-kural' })).toBeNull();
  });

  it('screen filtresi matchesFilter ile değerlendirilir; boş filtre reddedilir', () => {
    const rule = parseRule('screen', { rsiMax: 40, sma200: 'above' })!;
    expect(evaluateRule(rule, m({ rsi14: 35, sma200Pct: 3 })).matched).toBe(true);
    expect(evaluateRule(rule, m({ rsi14: 55, sma200Pct: 3 })).matched).toBe(false);
    expect(evaluateRule(rule, m({ rsi14: 35, sma200Pct: -3 })).matched).toBe(false);
    expect(parseRule('screen', {})).toBeNull();
    expect(describeRule(rule)).toContain('RSI(14)');
  });

  it('near_52w_high: zirveye uzaklık eşiğin içinde', () => {
    const rule = parseRule('near_52w_high', { maxPct: 3 })!;
    expect(evaluateRule(rule, m({ from52wHighPct: -2.1 })).matched).toBe(true);
    expect(evaluateRule(rule, m({ from52wHighPct: -6 })).matched).toBe(false);
    expect(parseRule('near_52w_high', { maxPct: 0 })).toBeNull();
  });
});
