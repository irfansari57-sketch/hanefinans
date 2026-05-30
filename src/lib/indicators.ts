// Teknik göstergeler — Yahoo/CoinGecko OHLCV verisi üzerinden hesaplanır.
// Standart formüller (Wilder smoothing dahil) kullanılmıştır.

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
}

// ============ SMA / EMA ============
export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += values[j];
    out.push(s / period);
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  if (values.length === 0) return out;
  const k = 2 / (period + 1);
  // İlk EMA = ilk period değerin SMA'sı
  let prev = NaN;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    if (i === period - 1) {
      let s = 0;
      for (let j = 0; j < period; j++) s += values[j];
      prev = s / period;
      out.push(prev);
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

// ============ RSI (Wilder smoothing) ============
export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = 100 - 100 / (1 + (avgGain / (avgLoss || 1e-12)));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = 100 - 100 / (1 + (avgGain / (avgLoss || 1e-12)));
  }
  return out;
}

// ============ MACD ============
export interface MACDResult {
  macd: number[];      // EMA12 - EMA26
  signal: number[];    // EMA9 of macd
  histogram: number[]; // macd - signal
  /** Son barda bullish crossover oldu mu? */
  recentBullishCross: boolean;
  /** Son barda bearish crossover oldu mu? */
  recentBearishCross: boolean;
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MACDResult {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    Number.isFinite(emaFast[i]) && Number.isFinite(emaSlow[i]) ? emaFast[i] - emaSlow[i] : NaN,
  );
  const cleanMacd = macdLine.filter((v) => Number.isFinite(v));
  const signalClean = ema(cleanMacd, signalPeriod);
  // align signal back to original length
  const signal = new Array(closes.length).fill(NaN);
  const offset = macdLine.findIndex((v) => Number.isFinite(v));
  for (let i = 0; i < signalClean.length; i++) {
    signal[i + offset] = signalClean[i];
  }
  const histogram = closes.map((_, i) =>
    Number.isFinite(macdLine[i]) && Number.isFinite(signal[i]) ? macdLine[i] - signal[i] : NaN,
  );
  // crossover detection (son 2 bar)
  const n = closes.length;
  let bullish = false, bearish = false;
  if (n >= 2) {
    const m1 = macdLine[n - 2], s1 = signal[n - 2];
    const m2 = macdLine[n - 1], s2 = signal[n - 1];
    if (Number.isFinite(m1) && Number.isFinite(s1) && Number.isFinite(m2) && Number.isFinite(s2)) {
      bullish = m1 <= s1 && m2 > s2;
      bearish = m1 >= s1 && m2 < s2;
    }
  }
  return { macd: macdLine, signal, histogram, recentBullishCross: bullish, recentBearishCross: bearish };
}

// ============ Bollinger Bands ============
export interface BollingerResult {
  middle: number[];
  upper: number[];
  lower: number[];
  position?: 'above-upper' | 'upper-half' | 'lower-half' | 'below-lower';
}

export function bollinger(closes: number[], period = 20, stdMult = 2): BollingerResult {
  const middle = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (!Number.isFinite(middle[i])) { upper.push(NaN); lower.push(NaN); continue; }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - middle[i]) ** 2;
    const sd = Math.sqrt(sumSq / period);
    upper.push(middle[i] + stdMult * sd);
    lower.push(middle[i] - stdMult * sd);
  }
  const lastClose = closes[closes.length - 1];
  const lastMid = middle[middle.length - 1];
  const lastUp = upper[upper.length - 1];
  const lastLo = lower[lower.length - 1];
  let position: BollingerResult['position'] | undefined;
  if (Number.isFinite(lastClose) && Number.isFinite(lastMid)) {
    if (lastClose > lastUp) position = 'above-upper';
    else if (lastClose > lastMid) position = 'upper-half';
    else if (lastClose > lastLo) position = 'lower-half';
    else position = 'below-lower';
  }
  return { middle, upper, lower, position };
}

// ============ ADX (+DI, -DI, ADX) ============
export interface ADXResult {
  adx: number[];
  plusDI: number[];
  minusDI: number[];
  lastTrendStrength?: 'weak' | 'moderate' | 'strong' | 'very-strong';
  bullishBias?: boolean;
}

export function adx(bars: OHLC[], period = 14): ADXResult {
  const len = bars.length;
  const plusDI = new Array<number>(len).fill(NaN);
  const minusDI = new Array<number>(len).fill(NaN);
  const adxArr = new Array<number>(len).fill(NaN);
  if (len < period * 2) return { adx: adxArr, plusDI, minusDI };

  const tr: number[] = [0];
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  for (let i = 1; i < len; i++) {
    const cur = bars[i];
    const prev = bars[i - 1];
    const t = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    tr.push(t);
    const up = cur.high - prev.high;
    const dn = prev.low - cur.low;
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
  }
  // Wilder smoothing
  const smooth = (arr: number[]): number[] => {
    const out = new Array<number>(arr.length).fill(NaN);
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += arr[i];
    out[period] = sum;
    for (let i = period + 1; i < arr.length; i++) {
      out[i] = out[i - 1] - out[i - 1] / period + arr[i];
    }
    return out;
  };
  const sTR = smooth(tr);
  const sPlus = smooth(plusDM);
  const sMinus = smooth(minusDM);
  const dx = new Array<number>(len).fill(NaN);
  for (let i = period; i < len; i++) {
    plusDI[i] = (sPlus[i] / sTR[i]) * 100;
    minusDI[i] = (sMinus[i] / sTR[i]) * 100;
    const sum = plusDI[i] + minusDI[i];
    dx[i] = sum === 0 ? 0 : (Math.abs(plusDI[i] - minusDI[i]) / sum) * 100;
  }
  // ADX = Wilder smoothing of DX
  let prev = NaN;
  for (let i = period * 2 - 1; i < len; i++) {
    if (i === period * 2 - 1) {
      let s = 0;
      for (let j = period; j <= i; j++) s += dx[j];
      prev = s / period;
    } else {
      prev = (prev * (period - 1) + dx[i]) / period;
    }
    adxArr[i] = prev;
  }
  const lastAdx = adxArr[len - 1];
  let lastTrendStrength: ADXResult['lastTrendStrength'] | undefined;
  if (Number.isFinite(lastAdx)) {
    if (lastAdx < 20) lastTrendStrength = 'weak';
    else if (lastAdx < 25) lastTrendStrength = 'moderate';
    else if (lastAdx < 40) lastTrendStrength = 'strong';
    else lastTrendStrength = 'very-strong';
  }
  const bullishBias = Number.isFinite(plusDI[len - 1]) && Number.isFinite(minusDI[len - 1])
    ? plusDI[len - 1] > minusDI[len - 1]
    : undefined;
  return { adx: adxArr, plusDI, minusDI, lastTrendStrength, bullishBias };
}

// ============ Yardımcılar ============
export function rsiSignal(value: number): 'aşırı satım' | 'satış bölgesi' | 'nötr' | 'alış bölgesi' | 'aşırı alım' {
  if (value < 30) return 'aşırı satım';
  if (value < 45) return 'satış bölgesi';
  if (value <= 55) return 'nötr';
  if (value <= 70) return 'alış bölgesi';
  return 'aşırı alım';
}

export function bollingerLabel(p?: BollingerResult['position']): string {
  if (!p) return '—';
  return p === 'above-upper' ? 'Üst bant üstünde (aşırı alım)'
    : p === 'upper-half' ? 'Üst yarıda seyrediyor'
    : p === 'lower-half' ? 'Alt yarıda seyrediyor'
    : 'Alt bant altında (aşırı satım)';
}

export function adxLabel(strength?: ADXResult['lastTrendStrength']): string {
  if (!strength) return '—';
  return strength === 'weak' ? 'zayıf trend'
    : strength === 'moderate' ? 'orta güçte'
    : strength === 'strong' ? 'güçlü trend'
    : 'çok güçlü trend';
}

/** Belirli destek/direnç seviyeleri: son N bar high/low */
export function supportResistance(bars: OHLC[], lookback = 60): { resistance: number; support: number } {
  const slice = bars.slice(-lookback);
  let resistance = -Infinity;
  let support = Infinity;
  for (const b of slice) {
    if (b.high > resistance) resistance = b.high;
    if (b.low < support) support = b.low;
  }
  return { resistance, support };
}
