/**
 * Hisse gösterge özeti — Tarayıcı (Hafta 4a, 15 Eki 2026).
 *
 * Girdi: günlük OHLCV barları (eski → yeni, KAPANMIŞ). Çıktı: tek satırlık,
 * filtrelenebilir sayısal özet. Her alan standart tanımdır (RSI Wilder 14,
 * SMA basit ortalama, getiriler kapanıştan kapanışa). Tahmin yok, skor yok;
 * kullanıcı eşiği kendi seçer → tarama sonucu "kuraldan geçenler"dir.
 *
 * null = veri yetersiz (ör. 200 bar yoksa SMA200 yok). Asla 0 ile doldurulmaz.
 */
import { sma, rsi } from './indicators';
import { computeTrend, type TrendRegime } from './regime';
import { evaluateSignals, type Bar, type SignalKind } from './signals';

export interface StockMetrics {
  symbol: string;
  asOfDate: string;
  bars: number;
  close: number;
  /** Son kapanış / önceki kapanış − 1 (%) */
  changePct: number | null;
  rsi14: number | null;
  /** Kapanışın SMA'ya uzaklığı (%) — pozitif = üstünde */
  sma20Pct: number | null;
  sma50Pct: number | null;
  sma200Pct: number | null;
  /** SMA50 > SMA200 (altın kesişim durumu) */
  sma50Above200: boolean | null;
  /** 52 haftalık (252 bar) en yüksek kapanışa uzaklık (%) — 0 = zirvede, negatif = altında */
  from52wHighPct: number | null;
  /** 52 haftalık en düşükten yükseliş (%) */
  from52wLowPct: number | null;
  /** Son hacim / önceki 20 gün ortalama hacim */
  volRatio20: number | null;
  /** Getiriler (%) — 5 / 21 / 63 / 126 / 252 bar */
  ret1w: number | null;
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
  ret1y: number | null;
  /** 20 günlük gerçekleşmiş oynaklık (yıllıklaştırılmış, %) */
  vol20: number | null;
  trend: TrendRegime | null;
  signals: SignalKind[];
}

const pct = (a: number, b: number): number | null => (b > 0 && Number.isFinite(a) && Number.isFinite(b) ? ((a - b) / b) * 100 : null);
const r2 = (v: number | null): number | null => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

function retN(closes: number[], n: number): number | null {
  const i = closes.length - 1 - n;
  return i >= 0 ? pct(closes[closes.length - 1], closes[i]) : null;
}

export const METRICS_MIN_BARS = 30;

export function computeMetrics(symbol: string, bars: Bar[], indexTrend?: TrendRegime | null): StockMetrics | null {
  const n = bars.length;
  if (n < METRICS_MIN_BARS) return null;
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume ?? 0);
  const last = bars[n - 1];
  const prev = bars[n - 2];

  const s20 = n >= 20 ? sma(closes, 20)[n - 1] : NaN;
  const s50 = n >= 50 ? sma(closes, 50)[n - 1] : NaN;
  const s200 = n >= 200 ? sma(closes, 200)[n - 1] : NaN;
  const rsiArr = rsi(closes, 14);
  const rsiNow = rsiArr[n - 1];

  const look = Math.min(252, n);
  let hi = -Infinity, lo = Infinity;
  for (let i = n - look; i < n; i++) { hi = Math.max(hi, closes[i]); lo = Math.min(lo, closes[i]); }

  const vol20Arr = sma(vols, 20);
  const avgVol = vol20Arr[n - 2];
  const volRatio = Number.isFinite(avgVol) && avgVol > 0 ? last.volume / avgVol : null;

  let vol20: number | null = null;
  if (n >= 21) {
    const rets: number[] = [];
    for (let i = n - 20; i < n; i++) if (closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
    if (rets.length >= 15) {
      const m = rets.reduce((a, b) => a + b, 0) / rets.length;
      const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1);
      vol20 = Math.sqrt(v) * Math.sqrt(252) * 100;
    }
  }

  const trend = n >= 60 ? computeTrend(closes).regime : null;
  const signals = n >= 60 ? evaluateSignals(bars, indexTrend).map((s) => s.kind) : [];

  return {
    symbol,
    asOfDate: last.date,
    bars: n,
    close: last.close,
    changePct: r2(prev ? pct(last.close, prev.close) : null),
    rsi14: r2(Number.isFinite(rsiNow) ? rsiNow : null),
    sma20Pct: r2(Number.isFinite(s20) ? pct(last.close, s20) : null),
    sma50Pct: r2(Number.isFinite(s50) ? pct(last.close, s50) : null),
    sma200Pct: r2(Number.isFinite(s200) ? pct(last.close, s200) : null),
    sma50Above200: Number.isFinite(s50) && Number.isFinite(s200) ? s50 > s200 : null,
    from52wHighPct: r2(look >= 120 && Number.isFinite(hi) ? pct(last.close, hi) : null),
    from52wLowPct: r2(look >= 120 && Number.isFinite(lo) ? pct(last.close, lo) : null),
    volRatio20: r2(volRatio),
    ret1w: r2(retN(closes, 5)),
    ret1m: r2(retN(closes, 21)),
    ret3m: r2(retN(closes, 63)),
    ret6m: r2(retN(closes, 126)),
    ret1y: r2(retN(closes, 252)),
    vol20: r2(vol20),
    trend,
    signals,
  };
}

/* ---------- Filtre tanımı (URL ile paylaşılabilir, deterministik) ---------- */

export type TriState = 'any' | 'above' | 'below';

export interface ScreenFilter {
  rsiMin?: number; rsiMax?: number;
  sma50: TriState; sma200: TriState;
  /** SMA50 > SMA200 zorunlu */
  goldenCross?: boolean;
  /** 52h zirveye en fazla şu kadar uzak (%) — ör. 5 → zirveye ≤ %5 */
  near52wHighMax?: number;
  volRatioMin?: number;
  ret1wMin?: number; ret1wMax?: number;
  ret1mMin?: number; ret1mMax?: number;
  ret3mMin?: number; ret3mMax?: number;
  vol20Max?: number;
  trends: TrendRegime[];
  signals: SignalKind[];
}

export const EMPTY_FILTER: ScreenFilter = { sma50: 'any', sma200: 'any', trends: [], signals: [] };

function inRange(v: number | null, min?: number, max?: number): boolean {
  if (min == null && max == null) return true;
  if (v == null) return false;
  if (min != null && v < min) return false;
  if (max != null && v > max) return false;
  return true;
}

function tri(v: number | null, t: TriState): boolean {
  if (t === 'any') return true;
  if (v == null) return false;
  return t === 'above' ? v > 0 : v < 0;
}

export function matchesFilter(m: StockMetrics, f: ScreenFilter): boolean {
  if (!inRange(m.rsi14, f.rsiMin, f.rsiMax)) return false;
  if (!tri(m.sma50Pct, f.sma50)) return false;
  if (!tri(m.sma200Pct, f.sma200)) return false;
  if (f.goldenCross && m.sma50Above200 !== true) return false;
  if (f.near52wHighMax != null && (m.from52wHighPct == null || m.from52wHighPct < -f.near52wHighMax)) return false;
  if (f.volRatioMin != null && (m.volRatio20 == null || m.volRatio20 < f.volRatioMin)) return false;
  if (!inRange(m.ret1w, f.ret1wMin, f.ret1wMax)) return false;
  if (!inRange(m.ret1m, f.ret1mMin, f.ret1mMax)) return false;
  if (!inRange(m.ret3m, f.ret3mMin, f.ret3mMax)) return false;
  if (f.vol20Max != null && (m.vol20 == null || m.vol20 > f.vol20Max)) return false;
  if (f.trends.length > 0 && (!m.trend || !f.trends.includes(m.trend))) return false;
  if (f.signals.length > 0 && !f.signals.some((k) => m.signals.includes(k))) return false;
  return true;
}

/** Aktif koşulları insan diliyle listeler (sonuç başlığı + kanıt). */
export function describeFilter(f: ScreenFilter): string[] {
  const out: string[] = [];
  if (f.rsiMin != null || f.rsiMax != null) out.push(`RSI(14) ${f.rsiMin ?? 0}–${f.rsiMax ?? 100}`);
  if (f.sma50 !== 'any') out.push(`Fiyat SMA50 ${f.sma50 === 'above' ? 'üstünde' : 'altında'}`);
  if (f.sma200 !== 'any') out.push(`Fiyat SMA200 ${f.sma200 === 'above' ? 'üstünde' : 'altında'}`);
  if (f.goldenCross) out.push('SMA50 > SMA200');
  if (f.near52wHighMax != null) out.push(`52h zirveye ≤ %${f.near52wHighMax}`);
  if (f.volRatioMin != null) out.push(`Hacim ≥ ${f.volRatioMin}× (20g ort.)`);
  if (f.ret1wMin != null || f.ret1wMax != null) out.push(`1 hafta ${f.ret1wMin != null ? `≥ %${f.ret1wMin}` : ''}${f.ret1wMin != null && f.ret1wMax != null ? ', ' : ''}${f.ret1wMax != null ? `≤ %${f.ret1wMax}` : ''}`);
  if (f.ret1mMin != null || f.ret1mMax != null) out.push(`1 ay ${f.ret1mMin != null ? `≥ %${f.ret1mMin}` : ''}${f.ret1mMin != null && f.ret1mMax != null ? ', ' : ''}${f.ret1mMax != null ? `≤ %${f.ret1mMax}` : ''}`);
  if (f.ret3mMin != null || f.ret3mMax != null) out.push(`3 ay ${f.ret3mMin != null ? `≥ %${f.ret3mMin}` : ''}${f.ret3mMin != null && f.ret3mMax != null ? ', ' : ''}${f.ret3mMax != null ? `≤ %${f.ret3mMax}` : ''}`);
  if (f.vol20Max != null) out.push(`20g oynaklık ≤ %${f.vol20Max}`);
  if (f.trends.length) out.push(`Trend: ${f.trends.join(' / ')}`);
  if (f.signals.length) out.push(`Sinyal: ${f.signals.length} tür`);
  return out;
}

/* ---------- URL (de)serileştirme ---------- */

const NUM_KEYS = ['rsiMin', 'rsiMax', 'near52wHighMax', 'volRatioMin', 'ret1wMin', 'ret1wMax', 'ret1mMin', 'ret1mMax', 'ret3mMin', 'ret3mMax', 'vol20Max'] as const;

export function filterToParams(f: ScreenFilter): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of NUM_KEYS) { const v = f[k]; if (v != null && Number.isFinite(v)) p.set(k, String(v)); }
  if (f.sma50 !== 'any') p.set('sma50', f.sma50);
  if (f.sma200 !== 'any') p.set('sma200', f.sma200);
  if (f.goldenCross) p.set('gc', '1');
  if (f.trends.length) p.set('trend', f.trends.join(','));
  if (f.signals.length) p.set('sig', f.signals.join(','));
  return p;
}

export function filterFromParams(p: URLSearchParams): ScreenFilter {
  const f: ScreenFilter = { ...EMPTY_FILTER, trends: [], signals: [] };
  for (const k of NUM_KEYS) { const v = p.get(k); if (v != null && v !== '' && Number.isFinite(Number(v))) f[k] = Number(v); }
  const s50 = p.get('sma50'); if (s50 === 'above' || s50 === 'below') f.sma50 = s50;
  const s200 = p.get('sma200'); if (s200 === 'above' || s200 === 'below') f.sma200 = s200;
  if (p.get('gc') === '1') f.goldenCross = true;
  const tr = p.get('trend'); if (tr) f.trends = tr.split(',').filter((x): x is TrendRegime => x === 'yükseliş' || x === 'yatay' || x === 'düşüş');
  const sg = p.get('sig'); if (sg) f.signals = sg.split(',').filter(Boolean) as SignalKind[];
  return f;
}

/* ---------- Hazır şablonlar — eşikler görünür, değiştirilebilir ---------- */

export const SCREEN_PRESETS: Array<{ id: string; label: string; desc: string; filter: ScreenFilter }> = [
  {
    id: 'trend-takip', label: 'Trend takibi',
    desc: 'Fiyat SMA50 ve SMA200 üstünde, SMA50 > SMA200, RSI 50–70.',
    filter: { ...EMPTY_FILTER, sma50: 'above', sma200: 'above', goldenCross: true, rsiMin: 50, rsiMax: 70, trends: [], signals: [] },
  },
  {
    id: 'zirve-yakin', label: 'Zirveye yakın',
    desc: '52 haftalık zirveye ≤ %3, SMA50 üstünde.',
    filter: { ...EMPTY_FILTER, near52wHighMax: 3, sma50: 'above', trends: [], signals: [] },
  },
  {
    id: 'asiri-satim', label: 'Aşırı satım bölgesi',
    desc: 'RSI(14) ≤ 30. Yalnız durum tespiti — dönüş anlamına gelmez.',
    filter: { ...EMPTY_FILTER, rsiMax: 30, trends: [], signals: [] },
  },
  {
    id: 'hacim', label: 'Hacim artışı',
    desc: 'Son gün hacmi 20 günlük ortalamanın ≥ 2 katı.',
    filter: { ...EMPTY_FILTER, volRatioMin: 2, trends: [], signals: [] },
  },
  {
    id: 'sakin-yukselis', label: 'Sakin yükseliş',
    desc: 'Yükseliş trendi, 20g oynaklık ≤ %35, 1 ay getiri > 0.',
    filter: { ...EMPTY_FILTER, trends: ['yükseliş'], vol20Max: 35, ret1mMin: 0, signals: [] },
  },
];
