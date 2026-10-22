/**
 * Kanıt Defteri istatistikleri — Sinyal Motoru Hafta 5 (22 Eki 2026).
 *
 * Saf yardımcılar; D1/fetch yok. Hem cron (functions/api/cron/signal-ledger.ts)
 * hem okuma endpoint'i (functions/api/signals/ledger.ts) hem de sayfa kullanır.
 *
 * Tanımlar (SPK dili: bu bir performans ÖLÇÜMÜDÜR, tavsiye değildir):
 *   - İleri getiri (ret_Nd): sinyal günü kapanışından N İŞLEM GÜNÜ sonraki
 *     kapanışa, yüzde. Kapanıştan kapanışa; temettü/bedelsiz düzeltmesi
 *     bars_daily'nin düzeltilmiş kapanışı kadardır; işlem maliyeti ve kayma yok.
 *   - Endeks getirisi (index_ret_Nd): aynı pencerede XU100 kapanıştan kapanışa.
 *   - Göreli (fazla) getiri: ret_Nd − index_ret_Nd (basit fark, yüzde puan).
 *   - Hit rate (pozitif oranı): ret_Nd > 0 olan kayıtların doldurulmuş kayıtlara oranı.
 *   - Örneklem eşiği: doldurulmuş n < MIN_SAMPLE (20) ise istatistik gösterilmez.
 */

export const LEDGER_WINDOWS = [5, 20, 60] as const;
export type LedgerWindow = (typeof LEDGER_WINDOWS)[number];

/** Bu sayının altındaki örneklem için istatistik "yetersiz" işaretlenir. */
export const MIN_SAMPLE = 20;

export interface CloseBar { date: string; close: number }

export function mean(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Pozitif oranı (0-1). Sıfır getiri "pozitif" sayılmaz. */
export function hitRate(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  return v.filter((x) => x > 0).length / v.length;
}

/** Yüzde getiri; giriş ≤ 0 ise null. */
export function pctReturn(entry: number, exit: number): number | null {
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0) return null;
  return ((exit - entry) / entry) * 100;
}

/**
 * Sinyal gününün bar dizisindeki konumu. Tam eşleşme yoksa sinyal tarihinden
 * ÖNCEKİ veya eşit son bar (ör. endeks barı o gün eksikse). Hiç yoksa -1.
 * bars: tarihe göre artan sıralı (eski → yeni).
 */
export function indexOfDate(bars: CloseBar[], date: string): number {
  let lo = 0, hi = bars.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/**
 * Sinyal tarihinden n işlem günü sonraki bar (kapanış + tarih).
 * Henüz n bar geçmemişse null (doldurma beklemede).
 */
export function forwardClose(bars: CloseBar[], signalDate: string, n: number): CloseBar | null {
  const i = indexOfDate(bars, signalDate);
  if (i < 0) return null;
  const j = i + n;
  if (j >= bars.length) return null;
  return bars[j];
}

export interface ForwardResult {
  close_5d: number | null; close_20d: number | null; close_60d: number | null;
  ret_5d: number | null; ret_20d: number | null; ret_60d: number | null;
  index_ret_5d: number | null; index_ret_20d: number | null; index_ret_60d: number | null;
}

/**
 * Bir defter kaydı için 5/20/60g ileri kapanış + getiri + aynı pencerede endeks getirisi.
 * Endeks barları veya endeks giriş kapanışı yoksa endeks getirileri null kalır.
 */
export function computeForward(
  bars: CloseBar[],
  signalDate: string,
  entryClose: number,
  indexBars?: CloseBar[] | null,
  indexEntryClose?: number | null,
): ForwardResult {
  const out: ForwardResult = {
    close_5d: null, close_20d: null, close_60d: null,
    ret_5d: null, ret_20d: null, ret_60d: null,
    index_ret_5d: null, index_ret_20d: null, index_ret_60d: null,
  };
  for (const n of LEDGER_WINDOWS) {
    const fwd = forwardClose(bars, signalDate, n);
    if (fwd) {
      out[`close_${n}d`] = fwd.close;
      out[`ret_${n}d`] = pctReturn(entryClose, fwd.close);
    }
    if (indexBars && indexEntryClose != null && indexEntryClose > 0) {
      const ifwd = forwardClose(indexBars, signalDate, n);
      if (ifwd) out[`index_ret_${n}d`] = pctReturn(indexEntryClose, ifwd.close);
    }
  }
  return out;
}

export interface WindowStats {
  /** Bu pencere için doldurulmuş kayıt sayısı */
  filled: number;
  mean: number | null;
  median: number | null;
  /** 0-1 */
  hitRate: number | null;
  /** ort(ret − index_ret), yüzde puan; endeks verisi olan kayıtlar üzerinden */
  meanExcess: number | null;
  /** filled < MIN_SAMPLE */
  insufficient: boolean;
}

export interface LedgerRowLike {
  ret_5d: number | null; ret_20d: number | null; ret_60d: number | null;
  index_ret_5d: number | null; index_ret_20d: number | null; index_ret_60d: number | null;
}

export function summarizeWindow(rows: LedgerRowLike[], n: LedgerWindow, minSample = MIN_SAMPLE): WindowStats {
  const rets: number[] = [];
  const excess: number[] = [];
  for (const r of rows) {
    const v = r[`ret_${n}d`];
    if (v == null || !Number.isFinite(v)) continue;
    rets.push(v);
    const iv = r[`index_ret_${n}d`];
    if (iv != null && Number.isFinite(iv)) excess.push(v - iv);
  }
  const insufficient = rets.length < minSample;
  return {
    filled: rets.length,
    mean: insufficient ? null : mean(rets),
    median: insufficient ? null : median(rets),
    hitRate: insufficient ? null : hitRate(rets),
    meanExcess: insufficient || excess.length < minSample ? null : mean(excess),
    insufficient,
  };
}

export interface KindStats {
  kind: string;
  /** Toplam kayıt (doldurulmuş + bekleyen) */
  n: number;
  w5: WindowStats; w20: WindowStats; w60: WindowStats;
  /** n < MIN_SAMPLE — kart hiç istatistik göstermez */
  insufficient: boolean;
}

export function summarizeKind(kind: string, rows: LedgerRowLike[], minSample = MIN_SAMPLE): KindStats {
  return {
    kind,
    n: rows.length,
    w5: summarizeWindow(rows, 5, minSample),
    w20: summarizeWindow(rows, 20, minSample),
    w60: summarizeWindow(rows, 60, minSample),
    insufficient: rows.length < minSample,
  };
}

/** Tüm kayıtları kurala göre gruplayıp özetler. */
export function summarizeByKind<T extends LedgerRowLike & { kind: string }>(rows: T[], minSample = MIN_SAMPLE): KindStats[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const g = groups.get(r.kind);
    if (g) g.push(r); else groups.set(r.kind, [r]);
  }
  return Array.from(groups.entries()).map(([k, rs]) => summarizeKind(k, rs, minSample));
}
