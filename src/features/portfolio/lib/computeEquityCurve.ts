/**
 * Portföy gelişim eğrisi (equity curve) hesaplama motoru.
 *
 * Girdi: pozisyon işlemleri (buy/sell txn'leri) + varlıkların historical price'ları
 * Çıktı: her gün için portföy değeri + toplam maliyet
 *
 * Benchmark karşılaştırma: "aynı parayı aynı tarihlerde X'e yatırsaydım ne olurdu?"
 * hesabı için `computeBenchmarkCurve()` — dollar-weighted karşılaştırma.
 */

export interface PricePoint {
  date: string;      // YYYY-MM-DD
  price: number;
}

export interface Transaction {
  symbol: string;
  kind: 'stock' | 'fund';
  /** Pozitif = alım (lot artar), negatif = satım */
  lot: number;
  /** İşlem anındaki birim fiyat (TL) */
  price: number;
  /** Unix ms */
  executedAt: number;
}

export interface EquityPoint {
  date: string;
  /** Portföyün o günkü toplam piyasa değeri (TL) */
  value: number;
  /** O güne kadar toplam yatırılan net para (alımlar - satımlar × işlem fiyatı) */
  costBasis: number;
}

/**
 * `date` tarihindeki (veya en yakın önceki) fiyatı forward-fill ile bul.
 */
function findPrice(history: PricePoint[], date: string): number | null {
  if (!history.length) return null;
  // Binary search: en son <= date olan fiyat
  let lo = 0, hi = history.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (history[mid].date <= date) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (best === -1) return null;
  return history[best].price;
}

/** İki tarih arasındaki günleri döndürür (ISO YYYY-MM-DD). */
function daysBetween(startYmd: string, endYmd: string): string[] {
  const days: string[] = [];
  const start = new Date(startYmd + 'T00:00:00Z');
  const end = new Date(endYmd + 'T00:00:00Z');
  const ms = 24 * 60 * 60 * 1000;
  for (let t = start.getTime(); t <= end.getTime(); t += ms) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

function unixToYmd(unixMs: number): string {
  return new Date(unixMs).toISOString().slice(0, 10);
}

/**
 * Portföy günlük değer eğrisini hesaplar.
 *
 * @param txns İşlem geçmişi (kronolojik sıra önemli değil, içeride sıralanır)
 * @param priceHistories Symbol → historical price array map
 * @param endDate ISO YYYY-MM-DD (default: bugün)
 */
export function computeEquityCurve(
  txns: Transaction[],
  priceHistories: Map<string, PricePoint[]>,
  endDate?: string,
): EquityPoint[] {
  if (txns.length === 0) return [];

  const sorted = [...txns].sort((a, b) => a.executedAt - b.executedAt);
  const startDate = unixToYmd(sorted[0].executedAt);
  const end = endDate ?? new Date().toISOString().slice(0, 10);

  const days = daysBetween(startDate, end);
  if (days.length === 0) return [];

  // Symbol → cumulative units held
  const units = new Map<string, number>();
  // Net cash invested (buys - sells at their execution prices)
  let cumulativeCost = 0;

  // txn index for chronological playback
  let txnIdx = 0;

  const curve: EquityPoint[] = [];

  for (const day of days) {
    // Bu güne kadar (dahil) tüm işlemleri uygula
    while (txnIdx < sorted.length && unixToYmd(sorted[txnIdx].executedAt) <= day) {
      const t = sorted[txnIdx];
      units.set(t.symbol, (units.get(t.symbol) ?? 0) + t.lot);
      cumulativeCost += t.lot * t.price; // pozitif lot = alım (maliyet artar), negatif = satım (çıkarır)
      txnIdx++;
    }

    // Portföy değeri = Σ(units_i × price_i_today)
    let value = 0;
    for (const [sym, qty] of units.entries()) {
      if (qty === 0) continue;
      const hist = priceHistories.get(sym);
      const p = hist ? findPrice(hist, day) : null;
      if (p != null) {
        value += qty * p;
      } else {
        // Fallback: son bilinen tx fiyatı ile değerle (rare)
        const lastTxPrice = sorted.filter((t) => t.symbol === sym && unixToYmd(t.executedAt) <= day).pop()?.price ?? 0;
        value += qty * lastTxPrice;
      }
    }

    curve.push({ date: day, value, costBasis: cumulativeCost });
  }

  return curve;
}

/**
 * "Aynı parayı aynı tarihlerde bu benchmark'a yatırsaydım" curve'ü.
 *
 * Her cash injection (alım) için:
 *   units_bench = cashInvested / benchmarkPrice_at_injection_date
 * Bugünkü değer = units_bench × benchmarkPrice_today
 *
 * Böylece kullanıcının DCA (dollar-cost averaging) davranışını benchmark'a
 * uyarlamış oluruz. Ekonomik olarak "apples-to-apples".
 */
export function computeBenchmarkCurve(
  txns: Transaction[],
  benchmarkHistory: PricePoint[],
  endDate?: string,
): EquityPoint[] {
  if (txns.length === 0 || benchmarkHistory.length === 0) return [];

  const sorted = [...txns].sort((a, b) => a.executedAt - b.executedAt);
  const startDate = unixToYmd(sorted[0].executedAt);
  const end = endDate ?? new Date().toISOString().slice(0, 10);
  const days = daysBetween(startDate, end);

  // Benchmark units accumulated over time (like buying benchmark instead of stocks)
  let benchUnits = 0;
  let cumulativeCost = 0;
  let txnIdx = 0;

  const curve: EquityPoint[] = [];

  for (const day of days) {
    // Her işlemi benchmark'ta gerçekleştir
    while (txnIdx < sorted.length && unixToYmd(sorted[txnIdx].executedAt) <= day) {
      const t = sorted[txnIdx];
      const txDay = unixToYmd(t.executedAt);
      const benchPrice = findPrice(benchmarkHistory, txDay);
      if (benchPrice && benchPrice > 0) {
        const cashDelta = t.lot * t.price; // pozitif = alım, negatif = satım
        // Benchmark units: aynı parayı benchmark'a yatır
        benchUnits += cashDelta / benchPrice;
      }
      cumulativeCost += t.lot * t.price;
      txnIdx++;
    }

    const benchPriceToday = findPrice(benchmarkHistory, day);
    const value = benchPriceToday ? benchUnits * benchPriceToday : 0;

    curve.push({ date: day, value, costBasis: cumulativeCost });
  }

  return curve;
}

/**
 * Sentetik TÜFE (enflasyon) benchmark'ı — yıllık compound ile günlük büyüme.
 * Türkiye BES/Portföy karşılaştırmalarında reel getiri için kritik.
 */
export function synthesizeTufeSeries(
  startYmd: string,
  endYmd: string,
  yoyPct: number = 40,
  initial: number = 100,
): PricePoint[] {
  const dailyRate = Math.pow(1 + yoyPct / 100, 1 / 365) - 1;
  const days = daysBetween(startYmd, endYmd);
  const out: PricePoint[] = [];
  let val = initial;
  for (const day of days) {
    out.push({ date: day, price: val });
    val *= 1 + dailyRate;
  }
  return out;
}

/**
 * Ozet metrik — equity curve'den performans metrikleri.
 */
export interface EquityMetrics {
  initialValue: number;
  currentValue: number;
  totalReturn: number;        // TL bazında kar/zarar
  totalReturnPct: number;     // % getiri (net kar / toplam yatırım)
  cagr: number;               // yıllık bileşik getiri %
  maxDrawdownPct: number;     // en büyük tepe→dip düşüş %
  volatilityAnnualPct: number; // yıllık volatilite %
  sharpe: number;             // Sharpe oranı (rf=0)
  bestDay: { date: string; pct: number } | null;
  worstDay: { date: string; pct: number } | null;
  daysTracked: number;
}

export function computeMetrics(curve: EquityPoint[]): EquityMetrics {
  if (curve.length < 2) {
    return {
      initialValue: curve[0]?.value ?? 0,
      currentValue: curve[0]?.value ?? 0,
      totalReturn: 0, totalReturnPct: 0, cagr: 0,
      maxDrawdownPct: 0, volatilityAnnualPct: 0, sharpe: 0,
      bestDay: null, worstDay: null,
      daysTracked: curve.length,
    };
  }

  const last = curve[curve.length - 1];
  const currentValue = last.value;
  const totalCost = last.costBasis;
  const totalReturn = currentValue - totalCost;
  const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

  const startD = new Date(curve[0].date + 'T00:00:00Z').getTime();
  const endD = new Date(last.date + 'T00:00:00Z').getTime();
  const years = Math.max(1 / 365, (endD - startD) / (365.25 * 24 * 60 * 60 * 1000));
  const cagr = totalCost > 0 && currentValue > 0
    ? (Math.pow(currentValue / totalCost, 1 / years) - 1) * 100
    : 0;

  // Günlük getiriler + risk metrikleri
  const dailyReturns: number[] = [];
  let bestDay: { date: string; pct: number } | null = null;
  let worstDay: { date: string; pct: number } | null = null;
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].value;
    if (prev <= 0) continue;
    const r = (curve[i].value - prev) / prev;
    dailyReturns.push(r);
    const pct = r * 100;
    if (!bestDay || pct > bestDay.pct) bestDay = { date: curve[i].date, pct };
    if (!worstDay || pct < worstDay.pct) worstDay = { date: curve[i].date, pct };
  }

  // Max Drawdown
  let peak = curve[0].value;
  let maxDD = 0;
  for (const p of curve) {
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? (peak - p.value) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }

  // Volatilite + Sharpe
  const mean = dailyReturns.length
    ? dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length : 0;
  const variance = dailyReturns.length
    ? dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length : 0;
  const dailyStd = Math.sqrt(variance);
  const volatilityAnnualPct = dailyStd * Math.sqrt(252) * 100;
  const sharpe = dailyStd > 0 ? (mean / dailyStd) * Math.sqrt(252) : 0;

  return {
    initialValue: curve[0].value,
    currentValue,
    totalReturn, totalReturnPct, cagr,
    maxDrawdownPct: maxDD * 100,
    volatilityAnnualPct, sharpe,
    bestDay, worstDay,
    daysTracked: curve.length,
  };
}
