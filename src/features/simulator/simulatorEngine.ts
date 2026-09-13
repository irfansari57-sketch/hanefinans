/**
 * Portföy Simülatörü — saf backtest motoru.
 *
 * UI'dan tamamen ayrı: input al, hesap et, sonuç dön. Kolayca test edilir.
 *
 * Sunar:
 *  - Multi-asset backtest (fon + hisse aynı portföyde)
 *  - Günlük equity curve
 *  - Risk metrikleri (max drawdown, volatilite, Sharpe)
 *  - Reel getiri (TÜFE-adjusted)
 *  - Stopaj + net kar hesabı (%17.5 fon / %10 hisse Turkiye)
 *  - Opsiyonel rebalans (Yok / Aylık / 3-Aylık)
 *  - Benchmark karşılaştırma (BIST 100 / USD / Altın / TÜFE)
 */

export type AssetType = 'fund' | 'stock';
export type Rebalance = 'none' | 'monthly' | 'quarterly';

export interface PricePoint {
  /** YYYY-MM-DD */
  date: string;
  price: number;
}

export interface AssetInput {
  code: string;
  name: string;
  type: AssetType;
  /** 0-100 arası hedef ağırlık yüzdesi */
  allocationPct: number;
  /** Kronolojik sıralı fiyat serisi (eski → yeni) */
  history: PricePoint[];
}

export interface SimulationInput {
  initialCapital: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  assets: AssetInput[];
  rebalance: Rebalance;
  /** Benchmark serileri — opsiyonel, key = benchmark id */
  benchmarks?: Record<string, PricePoint[]>;
}

export interface PerAssetResult {
  code: string;
  name: string;
  type: AssetType;
  allocationPct: number;
  startPrice: number;
  endPrice: number;
  units: number;
  startValue: number;
  endValue: number;
  returnPct: number;
  /** Getirinin toplam portföye TL katkısı */
  contributionTL: number;
}

export interface BenchmarkResult {
  id: string;
  startValue: number;
  endValue: number;
  returnPct: number;
  /** Aynı başlangıç sermayesi ile normalize edilmiş equity curve */
  equityCurve: Array<{ date: string; value: number }>;
}

export interface TaxResult {
  grossProfit: number;
  /** Ağırlıklı ortalama stopaj oranı (fon %17.5, hisse %10) */
  effectiveRate: number;
  stopajAmount: number;
  netProfit: number;
  netFinalValue: number;
}

export interface SimulationResult {
  input: SimulationInput;
  initialCapital: number;
  finalValue: number;
  spentCapital: number;
  cashRemaining: number;
  totalReturnPct: number;
  cagr: number;
  maxDrawdownPct: number;
  volatilityAnnualPct: number;
  sharpe: number;
  bestDay: { date: string; pct: number } | null;
  worstDay: { date: string; pct: number } | null;
  equityCurve: Array<{ date: string; value: number }>;
  perAsset: PerAssetResult[];
  benchmarks: BenchmarkResult[];
  taxes: TaxResult;
  /** TÜFE-adjusted reel getiri (yıllık ortalama) — TÜFE benchmark verilmişse */
  realReturnPct: number | null;
  warnings: string[];
}

// ---- Yardimci fonksiyonlar ----

/** YYYY-MM-DD stringlerini karşılaştırır. */
function cmpDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * `date` tarihi için serideki en yakın (mümkünse ≤ date) fiyatı bul.
 * Fon/hisse hafta sonu veya tatil kapalı olursa bir önceki iş günü fiyatı döner.
 */
export function findPriceAt(history: PricePoint[], date: string): PricePoint | null {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => cmpDate(a.date, b.date));
  // <= date olan son bar
  let best: PricePoint | null = null;
  for (const p of sorted) {
    if (cmpDate(p.date, date) <= 0 && p.price > 0) best = p;
    else if (cmpDate(p.date, date) > 0) break;
  }
  // Yoksa (start önce) — ileri en yakın
  if (!best) {
    for (const p of sorted) {
      if (p.price > 0) { best = p; break; }
    }
  }
  return best;
}

/** İki tarih arası yıl sayısı (365.25 baz). */
function yearsBetween(startYmd: string, endYmd: string): number {
  const a = new Date(startYmd + 'T00:00:00Z').getTime();
  const b = new Date(endYmd + 'T00:00:00Z').getTime();
  return Math.max(0, (b - a) / (1000 * 60 * 60 * 24 * 365.25));
}

/**
 * Tarih aralığındaki tüm iş günlerini toplar — assets ve benchmarks'ın her
 * birinin history'sinden gelen tarihlerin birleşimi. Böylece portföy değeri
 * her mevcut günde hesaplanabilir.
 */
function collectTradingDays(
  start: string,
  end: string,
  serieses: PricePoint[][],
): string[] {
  const set = new Set<string>();
  for (const s of serieses) {
    for (const p of s) {
      if (cmpDate(p.date, start) >= 0 && cmpDate(p.date, end) <= 0) {
        set.add(p.date);
      }
    }
  }
  return Array.from(set).sort();
}

/**
 * Bir asset'in belirli günkü fiyatını hızlıca bulmak için basit forward-fill index.
 * Kronolojik seri üzerinden ileri sıralı pointer ile O(n) çalışır.
 */
function buildPriceLookup(history: PricePoint[]): (date: string) => number | null {
  const sorted = [...history].sort((a, b) => cmpDate(a.date, b.date));
  const cache = new Map<string, number>();
  return (date: string) => {
    if (cache.has(date)) return cache.get(date)!;
    // Binary search: <= date olan en son fiyat
    let lo = 0, hi = sorted.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cmpDate(sorted[mid].date, date) <= 0) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (best === -1 || sorted[best].price <= 0) return null;
    cache.set(date, sorted[best].price);
    return sorted[best].price;
  };
}

/** Rebalans günü mü? */
function isRebalanceDay(prevDate: string, curDate: string, mode: Rebalance): boolean {
  if (mode === 'none') return false;
  const p = new Date(prevDate + 'T00:00:00Z');
  const c = new Date(curDate + 'T00:00:00Z');
  if (mode === 'monthly') {
    return p.getUTCMonth() !== c.getUTCMonth() || p.getUTCFullYear() !== c.getUTCFullYear();
  }
  // quarterly
  const pq = Math.floor(p.getUTCMonth() / 3);
  const cq = Math.floor(c.getUTCMonth() / 3);
  return pq !== cq || p.getUTCFullYear() !== c.getUTCFullYear();
}

// ---- Core simulation ----

export function simulate(input: SimulationInput): SimulationResult {
  const warnings: string[] = [];
  const totalPct = input.assets.reduce((s, a) => s + a.allocationPct, 0);
  if (Math.abs(totalPct - 100) > 0.01 && input.assets.length > 0) {
    warnings.push(`Ağırlıklar toplamı %${totalPct.toFixed(1)} — %100 olması önerilir.`);
  }
  if (input.assets.length === 0) {
    warnings.push('Portföyde varlık yok.');
  }

  // Tüm history serilerini birleştirip trading days topla
  const allSerieses = input.assets.map((a) => a.history);
  const days = collectTradingDays(input.startDate, input.endDate, allSerieses);

  // Assets için başlangıç fiyatları + unit hesabı
  const perAsset: PerAssetResult[] = [];
  let spentCapital = 0;
  let unitsByCode = new Map<string, number>();
  const priceLookupByCode = new Map<string, (d: string) => number | null>();

  for (const asset of input.assets) {
    const lookup = buildPriceLookup(asset.history);
    priceLookupByCode.set(asset.code, lookup);

    const alloc = (input.initialCapital * asset.allocationPct) / 100;
    // Başlangıç: startDate veya sonrasındaki ilk mevcut fiyat
    const firstDay = days.find((d) => lookup(d) != null) ?? input.startDate;
    const startPrice = lookup(firstDay);
    if (!startPrice || startPrice <= 0) {
      warnings.push(`${asset.code}: başlangıç fiyatı bulunamadı, portföyden atlandı.`);
      perAsset.push({
        code: asset.code, name: asset.name, type: asset.type,
        allocationPct: asset.allocationPct,
        startPrice: 0, endPrice: 0, units: 0,
        startValue: 0, endValue: 0, returnPct: 0, contributionTL: 0,
      });
      continue;
    }
    const units = alloc / startPrice;
    unitsByCode.set(asset.code, units);
    spentCapital += units * startPrice;

    const lastDay = [...days].reverse().find((d) => lookup(d) != null) ?? input.endDate;
    const endPrice = lookup(lastDay) ?? startPrice;
    const startValue = units * startPrice;
    const endValue = units * endPrice;
    perAsset.push({
      code: asset.code, name: asset.name, type: asset.type,
      allocationPct: asset.allocationPct,
      startPrice, endPrice, units,
      startValue, endValue,
      returnPct: startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0,
      contributionTL: endValue - startValue,
    });
  }

  const cashRemaining = input.initialCapital - spentCapital;

  // Günlük portföy değeri (rebalans yoksa units sabit; rebalans varsa update)
  const equityCurve: Array<{ date: string; value: number }> = [];
  let prevDay = days[0] ?? input.startDate;

  for (let i = 0; i < days.length; i++) {
    const d = days[i];

    // Rebalans günü mü? Portföyün toplam değerini hedef ağırlıklarla yeniden dağıt
    if (i > 0 && input.rebalance !== 'none' && isRebalanceDay(prevDay, d, input.rebalance)) {
      let totalVal = cashRemaining;
      for (const a of input.assets) {
        const p = priceLookupByCode.get(a.code)?.(d);
        const u = unitsByCode.get(a.code) ?? 0;
        if (p) totalVal += u * p;
      }
      // Yeniden dağıt
      for (const a of input.assets) {
        const p = priceLookupByCode.get(a.code)?.(d);
        if (!p || p <= 0) continue;
        const target = (totalVal - cashRemaining) * (a.allocationPct / 100);
        unitsByCode.set(a.code, target / p);
      }
    }

    let val = cashRemaining;
    for (const a of input.assets) {
      const p = priceLookupByCode.get(a.code)?.(d);
      const u = unitsByCode.get(a.code) ?? 0;
      if (p) val += u * p;
    }
    equityCurve.push({ date: d, value: val });
    prevDay = d;
  }

  const firstVal = equityCurve[0]?.value ?? input.initialCapital;
  const lastVal = equityCurve[equityCurve.length - 1]?.value ?? firstVal;
  const totalReturnPct = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;

  const years = Math.max(1 / 365, yearsBetween(input.startDate, input.endDate));
  const cagr = firstVal > 0 && lastVal > 0
    ? (Math.pow(lastVal / firstVal, 1 / years) - 1) * 100
    : 0;

  // Günlük getirilerden risk metrikleri
  const dailyReturns: number[] = [];
  let bestDay: { date: string; pct: number } | null = null;
  let worstDay: { date: string; pct: number } | null = null;
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].value;
    const cur = equityCurve[i].value;
    if (prev <= 0) continue;
    const r = (cur - prev) / prev;
    dailyReturns.push(r);
    const pct = r * 100;
    if (!bestDay || pct > bestDay.pct) bestDay = { date: equityCurve[i].date, pct };
    if (!worstDay || pct < worstDay.pct) worstDay = { date: equityCurve[i].date, pct };
  }

  // Max drawdown
  let peak = firstVal;
  let maxDD = 0;
  for (const p of equityCurve) {
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? (peak - p.value) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }

  // Volatilite (yıllıklandırılmış std dev)
  const mean = dailyReturns.length
    ? dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
    : 0;
  const variance = dailyReturns.length
    ? dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length
    : 0;
  const dailyStd = Math.sqrt(variance);
  const volatilityAnnualPct = dailyStd * Math.sqrt(252) * 100;

  // Sharpe (rf=0 basitleştirilmiş; TR mevduat ~%40 için uyarlanabilir ama karşılaştırma amaçlı 0 kabul)
  const sharpe = dailyStd > 0 ? (mean / dailyStd) * Math.sqrt(252) : 0;

  // Benchmark hesabı — aynı initial capital ile normalize
  const benchmarks: BenchmarkResult[] = [];
  if (input.benchmarks) {
    for (const [id, series] of Object.entries(input.benchmarks)) {
      if (!series || series.length === 0) continue;
      const bl = buildPriceLookup(series);
      const firstDay = days.find((d) => bl(d) != null) ?? input.startDate;
      const startPrice = bl(firstDay);
      if (!startPrice) continue;
      const bcurve: Array<{ date: string; value: number }> = [];
      for (const d of days) {
        const p = bl(d);
        if (p) bcurve.push({ date: d, value: (p / startPrice) * input.initialCapital });
      }
      const bStart = bcurve[0]?.value ?? input.initialCapital;
      const bEnd = bcurve[bcurve.length - 1]?.value ?? bStart;
      benchmarks.push({
        id, startValue: bStart, endValue: bEnd,
        returnPct: bStart > 0 ? ((bEnd - bStart) / bStart) * 100 : 0,
        equityCurve: bcurve,
      });
    }
  }

  // Stopaj — ağırlıklı ortalama (fon %17.5, hisse %10)
  const grossProfit = Math.max(0, lastVal - input.initialCapital);
  const totalWeight = perAsset.reduce((s, a) => s + a.allocationPct, 0) || 1;
  const weightedRate = perAsset.reduce((s, a) => {
    const r = a.type === 'fund' ? 0.175 : 0.10;
    return s + r * (a.allocationPct / totalWeight);
  }, 0);
  const stopajAmount = grossProfit * weightedRate;
  const taxes: TaxResult = {
    grossProfit,
    effectiveRate: weightedRate,
    stopajAmount,
    netProfit: grossProfit - stopajAmount,
    netFinalValue: input.initialCapital + (grossProfit - stopajAmount),
  };

  // Reel getiri — TÜFE benchmark verildiyse
  let realReturnPct: number | null = null;
  const inflBench = benchmarks.find((b) => b.id === 'TUFE');
  if (inflBench && inflBench.startValue > 0) {
    const nominalMult = lastVal / firstVal;
    const inflMult = inflBench.endValue / inflBench.startValue;
    realReturnPct = inflMult > 0 ? ((nominalMult / inflMult) - 1) * 100 : null;
  }

  return {
    input,
    initialCapital: input.initialCapital,
    finalValue: lastVal,
    spentCapital,
    cashRemaining,
    totalReturnPct,
    cagr,
    maxDrawdownPct: maxDD * 100,
    volatilityAnnualPct,
    sharpe,
    bestDay,
    worstDay,
    equityCurve,
    perAsset,
    benchmarks,
    taxes,
    realReturnPct,
    warnings,
  };
}

// ---- Preset portföyler ----

export interface PortfolioPreset {
  id: string;
  label: string;
  description: string;
  assets: Array<{ code: string; name: string; type: AssetType; allocationPct: number }>;
}

/**
 * Preset portfoyler — fon kodlari sabit ornek amacli, kullanici degistirebilir.
 * Kodlar Turkiye'de yaygin TEFAS acik fonlar ve BIST 30 hisseleri baz alindi.
 */
export const PORTFOLIO_PRESETS: PortfolioPreset[] = [
  {
    id: 'konservatif',
    label: 'Konservatif',
    description: 'Düşük volatilite — para piyasası, borçlanma araçları ağırlıklı',
    assets: [
      { code: 'AFA', name: 'Ak Portföy Para Piyasası', type: 'fund', allocationPct: 40 },
      { code: 'YAC', name: 'Yapı Kredi Portföy Kısa Vadeli Borçlanma', type: 'fund', allocationPct: 30 },
      { code: 'GPB', name: 'Garanti Portföy Borçlanma Araçları', type: 'fund', allocationPct: 20 },
      { code: 'IPJ', name: 'İş Portföy Altın Fonu', type: 'fund', allocationPct: 10 },
    ],
  },
  {
    id: 'dengeli',
    label: 'Dengeli',
    description: 'Karma — hisse, borçlanma, altın karışımı',
    assets: [
      { code: 'AFT', name: 'Ak Portföy BIST 30 Hisse', type: 'fund', allocationPct: 30 },
      { code: 'GPB', name: 'Garanti Portföy Borçlanma Araçları', type: 'fund', allocationPct: 30 },
      { code: 'IPJ', name: 'İş Portföy Altın Fonu', type: 'fund', allocationPct: 20 },
      { code: 'AFA', name: 'Ak Portföy Para Piyasası', type: 'fund', allocationPct: 20 },
    ],
  },
  {
    id: 'agresif',
    label: 'Agresif',
    description: 'Hisse ağırlıklı — yüksek getiri, yüksek risk',
    assets: [
      { code: 'AFT', name: 'Ak Portföy BIST 30 Hisse', type: 'fund', allocationPct: 40 },
      { code: 'THYAO', name: 'Türk Hava Yolları', type: 'stock', allocationPct: 20 },
      { code: 'AKBNK', name: 'Akbank', type: 'stock', allocationPct: 20 },
      { code: 'IPJ', name: 'İş Portföy Altın Fonu', type: 'fund', allocationPct: 20 },
    ],
  },
  {
    id: 'katilim',
    label: 'Katılım',
    description: 'Katılım endeksine uygun fonlar — faizsiz portföy',
    assets: [
      { code: 'KZL', name: 'Ziraat Portföy Katılım Hisse', type: 'fund', allocationPct: 40 },
      { code: 'GAS', name: 'Garanti Portföy Katılım Serbest', type: 'fund', allocationPct: 30 },
      { code: 'IPJ', name: 'İş Portföy Altın Fonu', type: 'fund', allocationPct: 30 },
    ],
  },
];
