/**
 * Piyasa rejimi — Sinyal Motoru Hafta 2 (15 Eki 2026).
 *
 * Tamamen deterministik; girdi günlük kapanış dizisi (eski → yeni). Çıktı üç
 * etiket + her etiketin KANIT satırları (EvidenceLink ile gösterilir). LLM yok.
 *
 * Trend     : kapanış vs SMA50 / SMA200 + SMA50 eğimi (20 bar)
 * Oynaklık  : 20 günlük gerçekleşmiş vol (yıllıklandırılmış) ve bunun 1 yıllık
 *             dağılım içindeki yüzdelik dilimi
 * Genişlik  : dışarıdan verilir (snapshot: yükselen/düşen) — burada yalnız yorumlanır
 *
 * Etiketler yargı değil, tanım: eşikler aşağıda sabit ve görünür. Eşik değişirse
 * tarih damgasıyla not düş.
 */

export type TrendRegime = 'yükseliş' | 'yatay' | 'düşüş';
export type VolRegime = 'düşük' | 'normal' | 'yüksek';
export type BreadthRegime = 'güçlü' | 'karışık' | 'zayıf';

export interface EvidenceRow { label: string; value: string; source?: string; at?: string }

export interface TrendResult {
  regime: TrendRegime;
  close: number;
  sma50: number | null;
  sma200: number | null;
  slope50Pct: number | null;   // SMA50'nin 20 bar önceki değerine göre % değişimi
  distToSma50Pct: number | null;
  distToSma200Pct: number | null;
  evidence: EvidenceRow[];
}

export interface VolResult {
  regime: VolRegime;
  realized20: number | null;   // yıllık %, ör. 28.6
  percentile1y: number | null; // 0-100
  evidence: EvidenceRow[];
}

export interface BreadthResult {
  regime: BreadthRegime;
  advancers: number;
  decliners: number;
  ratioPct: number;            // yükselen / (yükselen+düşen) %
  evidence: EvidenceRow[];
}

export interface RegimeResult {
  asOfDate: string | null;     // son bar tarihi (YYYY-MM-DD)
  bars: number;
  trend: TrendResult;
  vol: VolResult;
  breadth: BreadthResult | null;
  /** Tek cümle — rejim şeridi için. Veri yetersizse açık söyler, uydurmaz. */
  sentence: string;
}

// --- Eşikler (görünür, sabit) ---
export const REGIME_THRESHOLDS = {
  trendSlopeFlatPct: 1.0,     // SMA50 20 barda ±%1 içinde → eğim yatay
  trendMinBars: 60,           // SMA50 + eğim için minimum
  volLowPctile: 25,
  volHighPctile: 75,
  volMinBars: 60,
  breadthStrong: 60,          // yükselen oranı ≥ %60
  breadthWeak: 40,
} as const;

function smaAt(values: number[], period: number, endIdx: number): number | null {
  if (endIdx + 1 < period) return null;
  let s = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) s += values[i];
  return s / period;
}

const pct = (a: number, b: number) => ((a - b) / b) * 100;
const f2 = (v: number) => v.toFixed(2);

export function computeTrend(closes: number[], src = 'bars_daily'): TrendResult {
  const n = closes.length;
  const close = n ? closes[n - 1] : NaN;
  const sma50 = smaAt(closes, 50, n - 1);
  const sma200 = smaAt(closes, 200, n - 1);
  const sma50Prev = smaAt(closes, 50, n - 21);
  const slope50Pct = sma50 != null && sma50Prev != null ? pct(sma50, sma50Prev) : null;
  const d50 = sma50 != null ? pct(close, sma50) : null;
  const d200 = sma200 != null ? pct(close, sma200) : null;

  let regime: TrendRegime = 'yatay';
  if (n >= REGIME_THRESHOLDS.trendMinBars && sma50 != null && slope50Pct != null) {
    const above = close > sma50;
    const up = slope50Pct > REGIME_THRESHOLDS.trendSlopeFlatPct;
    const down = slope50Pct < -REGIME_THRESHOLDS.trendSlopeFlatPct;
    if (above && up) regime = 'yükseliş';
    else if (!above && down) regime = 'düşüş';
    else regime = 'yatay';
  }

  const evidence: EvidenceRow[] = [
    { label: 'Kapanış', value: Number.isFinite(close) ? close.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '—', source: src },
    { label: 'SMA50', value: sma50 != null ? `${sma50.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} (${d50! >= 0 ? '+' : ''}${f2(d50!)}%)` : 'yetersiz veri' },
    { label: 'SMA200', value: sma200 != null ? `${sma200.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} (${d200! >= 0 ? '+' : ''}${f2(d200!)}%)` : 'yetersiz veri (<200 bar)' },
    { label: 'SMA50 eğimi (20 bar)', value: slope50Pct != null ? `${slope50Pct >= 0 ? '+' : ''}${f2(slope50Pct)}%` : '—', source: `eşik ±${REGIME_THRESHOLDS.trendSlopeFlatPct}%` },
    { label: 'Bar sayısı', value: String(n) },
  ];
  return { regime, close, sma50, sma200, slope50Pct, distToSma50Pct: d50, distToSma200Pct: d200, evidence };
}

/** Günlük log getirilerden 20g gerçekleşmiş vol (yıllık %), ve 1y yüzdelik. */
export function computeVol(closes: number[], src = 'bars_daily'): VolResult {
  const n = closes.length;
  const rets: number[] = [];
  for (let i = 1; i < n; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const rv = (end: number): number | null => {
    if (end + 1 < 20) return null;
    const w = rets.slice(end - 19, end + 1);
    const m = w.reduce((a, b) => a + b, 0) / w.length;
    const v = w.reduce((a, b) => a + (b - m) ** 2, 0) / (w.length - 1);
    return Math.sqrt(v) * Math.sqrt(252) * 100;
  };
  const realized20 = rets.length >= 20 ? rv(rets.length - 1) : null;

  // 1 yıllık (≤252) kayan 20g vol serisi → yüzdelik
  let percentile1y: number | null = null;
  if (realized20 != null && rets.length >= REGIME_THRESHOLDS.volMinBars) {
    const start = Math.max(19, rets.length - 252);
    const hist: number[] = [];
    for (let e = start; e < rets.length; e++) { const x = rv(e); if (x != null) hist.push(x); }
    if (hist.length >= 30) {
      const below = hist.filter((x) => x <= realized20).length;
      percentile1y = Math.round((below / hist.length) * 100);
    }
  }
  let regime: VolRegime = 'normal';
  if (percentile1y != null) {
    if (percentile1y <= REGIME_THRESHOLDS.volLowPctile) regime = 'düşük';
    else if (percentile1y >= REGIME_THRESHOLDS.volHighPctile) regime = 'yüksek';
  }
  const evidence: EvidenceRow[] = [
    { label: '20g gerçekleşmiş vol (yıllık)', value: realized20 != null ? `%${f2(realized20)}` : 'yetersiz veri', source: src },
    { label: '1 yıl içindeki yüzdelik', value: percentile1y != null ? `${percentile1y}. yüzdelik` : 'yetersiz veri (<60 bar)', source: `eşik ≤${REGIME_THRESHOLDS.volLowPctile} düşük · ≥${REGIME_THRESHOLDS.volHighPctile} yüksek` },
    { label: 'Getiri sayısı', value: String(rets.length) },
  ];
  return { regime, realized20, percentile1y, evidence };
}

export function computeBreadth(advancers: number, decliners: number, src = 'snapshot'): BreadthResult {
  const tot = advancers + decliners;
  const ratioPct = tot > 0 ? Math.round((advancers / tot) * 100) : 0;
  const regime: BreadthRegime = tot === 0 ? 'karışık'
    : ratioPct >= REGIME_THRESHOLDS.breadthStrong ? 'güçlü'
    : ratioPct <= REGIME_THRESHOLDS.breadthWeak ? 'zayıf' : 'karışık';
  return {
    regime, advancers, decliners, ratioPct,
    evidence: [
      { label: 'Yükselen / düşen', value: `${advancers} / ${decliners}`, source: src },
      { label: 'Yükselen oranı', value: `%${ratioPct}`, source: `eşik ≥${REGIME_THRESHOLDS.breadthStrong} güçlü · ≤${REGIME_THRESHOLDS.breadthWeak} zayıf` },
    ],
  };
}

export function buildSentence(t: TrendResult, v: VolResult, b: BreadthResult | null, bars: number): string {
  if (bars < REGIME_THRESHOLDS.trendMinBars) return `Rejim için veri yetersiz (${bars} bar, en az ${REGIME_THRESHOLDS.trendMinBars} gerekli)`;
  const trendTxt = t.regime === 'yükseliş' ? 'Yükseliş trendi' : t.regime === 'düşüş' ? 'Düşüş trendi' : 'Yatay seyir';
  const volTxt = v.percentile1y == null ? '' : v.regime === 'yüksek' ? 'yüksek oynaklık' : v.regime === 'düşük' ? 'düşük oynaklık' : 'normal oynaklık';
  const brTxt = b ? (b.regime === 'güçlü' ? 'geniş katılım' : b.regime === 'zayıf' ? 'dar katılım' : 'karışık katılım') : '';
  return [trendTxt, volTxt, brTxt].filter(Boolean).join(' · ');
}

export function computeRegime(
  bars: Array<{ date: string; close: number }>,
  breadth?: { advancers: number; decliners: number } | null,
  src = 'bars_daily',
): RegimeResult {
  const closes = bars.map((b) => b.close).filter((c) => Number.isFinite(c) && c > 0);
  const trend = computeTrend(closes, src);
  const vol = computeVol(closes, src);
  const br = breadth ? computeBreadth(breadth.advancers, breadth.decliners) : null;
  return {
    asOfDate: bars.length ? bars[bars.length - 1].date : null,
    bars: closes.length,
    trend, vol, breadth: br,
    sentence: buildSentence(trend, vol, br, closes.length),
  };
}
