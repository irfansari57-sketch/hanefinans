/**
 * Cloudflare Pages Function — Indicator Agent.
 *
 * POST /api/agents/indicator
 * Body: { symbols?: string[]; lookbackDays?: number }
 *
 * Akış:
 *   1) Verilen sembollere (yoksa default BIST popüler 15) Yahoo'dan 6 aylık OHLC
 *   2) RSI(14), MACD, MA20/MA50 cross, hacim spike, fiyat-MA50 mesafesi hesapla
 *   3) Sinyaller üret (alıcı/satıcı/nötr) güç skoruyla
 *   4) Sıralanmış sinyal listesi döner
 *
 * Claude kullanmaz — saf matematik, hızlı. Edge cache 15 dk.
 */

interface YahooBar { open: number; high: number; low: number; close: number; volume: number; date: number; }

interface Signal {
  symbol: string;
  price: number;
  changePct: number;
  strength: number;            // -100 ... +100 (negatif = satıcı, pozitif = alıcı)
  label: 'güçlü-al' | 'al' | 'nötr' | 'sat' | 'güçlü-sat';
  reasons: string[];           // 2-4 kısa Türkçe cümle
  metrics: {
    rsi?: number;
    macdCross?: 'up' | 'down' | null;
    maPosition?: string;        // "MA20 üstü", "MA50 altı" vs.
    volumeRatio?: number;       // bugün / 20gün avg
  };
}

interface AgentResponse {
  ok: boolean;
  generatedAt: string;
  scannedSymbols: number;
  signals: Signal[];           // güç sırasına göre (mutlak |strength|)
  error?: string;
}

const DEFAULT_SYMBOLS = [
  'THYAO', 'GARAN', 'AKBNK', 'ASELS', 'EREGL', 'KCHOL', 'SAHOL',
  'TUPRS', 'BIMAS', 'SISE', 'TOASO', 'FROTO', 'TCELL', 'TTKOM', 'ARCLK',
];

function jsonResponse(data: unknown, status = 200, ttlSec = 900): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${ttlSec}`,
    },
  });
}

async function fetchYahooBars(origin: string, sym: string): Promise<YahooBar[] | null> {
  try {
    const symbol = `${sym}.IS`;
    const url = `${origin}/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{
            open?: (number|null)[]; high?: (number|null)[]; low?: (number|null)[];
            close?: (number|null)[]; volume?: (number|null)[];
          }> };
        }>;
      };
    };
    const result = j.chart?.result?.[0];
    const ts = result?.timestamp;
    const q = result?.indicators?.quote?.[0];
    if (!ts || !q || !q.close) return null;
    const bars: YahooBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = q.close[i];
      if (c == null) continue;
      bars.push({
        date: ts[i] * 1000,
        open: q.open?.[i] ?? c,
        high: q.high?.[i] ?? c,
        low: q.low?.[i] ?? c,
        close: c,
        volume: q.volume?.[i] ?? 0,
      });
    }
    return bars.length > 0 ? bars : null;
  } catch {
    return null;
  }
}

// --- İndikatörler ---
function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) {
      avgG = (avgG * (period - 1) + d) / period;
      avgL = (avgL * (period - 1)) / period;
    } else {
      avgG = (avgG * (period - 1)) / period;
      avgL = (avgL * (period - 1) - d) / period;
    }
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - (100 / (1 + rs));
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function macdCross(closes: number[]): 'up' | 'down' | null {
  if (closes.length < 35) return null;
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const n = macdLine.length;
  const histNow = macdLine[n - 1] - signalLine[n - 1];
  const histPrev = macdLine[n - 2] - signalLine[n - 2];
  if (histPrev <= 0 && histNow > 0) return 'up';
  if (histPrev >= 0 && histNow < 0) return 'down';
  return null;
}

// --- Sinyal üretimi ---
function analyzeBars(symbol: string, bars: YahooBar[]): Signal | null {
  if (bars.length < 50) return null;
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const changePct = ((last.close - prev.close) / prev.close) * 100;

  const r = rsi(closes, 14);
  const cross = macdCross(closes);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = closes.length >= 200 ? sma(closes, 200) : null;
  const volAvg20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volRatio = volAvg20 > 0 ? last.volume / volAvg20 : 1;

  const reasons: string[] = [];
  let score = 0;

  // RSI
  if (r != null) {
    if (r >= 70) {
      reasons.push(`RSI ${r.toFixed(0)} - asiri alim, dikkat`);
      score -= 25;
    } else if (r <= 30) {
      reasons.push(`RSI ${r.toFixed(0)} - asiri satim, firsat olabilir`);
      score += 25;
    } else if (r >= 60 && cross === 'up') {
      reasons.push(`RSI ${r.toFixed(0)} momentum guclu`);
      score += 10;
    } else if (r <= 40 && cross === 'down') {
      reasons.push(`RSI ${r.toFixed(0)} momentum zayifliyor`);
      score -= 10;
    }
  }

  // MACD cross
  if (cross === 'up') {
    reasons.push('MACD yukari kesisme (bullish)');
    score += 20;
  } else if (cross === 'down') {
    reasons.push('MACD asagi kesisme (bearish)');
    score -= 20;
  }

  // MA20/50 pozisyonu
  let maPos = '';
  if (ma20 != null && ma50 != null) {
    if (last.close > ma20 && last.close > ma50 && ma20 > ma50) {
      maPos = 'MA20 ve MA50 ustunde (uptrend)';
      reasons.push(maPos);
      score += 15;
    } else if (last.close < ma20 && last.close < ma50 && ma20 < ma50) {
      maPos = 'MA20 ve MA50 altinda (downtrend)';
      reasons.push(maPos);
      score -= 15;
    } else if (last.close > ma50) {
      maPos = 'MA50 ustunde';
      score += 5;
    } else {
      maPos = 'MA50 altinda';
      score -= 5;
    }
  }

  // Golden / Death cross (MA50 vs MA200)
  if (ma50 != null && ma200 != null) {
    const ma50Prev = sma(closes.slice(0, -1), 50);
    const ma200Prev = sma(closes.slice(0, -1), 200);
    if (ma50Prev != null && ma200Prev != null) {
      if (ma50Prev <= ma200Prev && ma50 > ma200) {
        reasons.push('Golden Cross (MA50 > MA200) - uzun vade alici');
        score += 30;
      } else if (ma50Prev >= ma200Prev && ma50 < ma200) {
        reasons.push('Death Cross (MA50 < MA200) - uzun vade satici');
        score -= 30;
      }
    }
  }

  // Volume spike
  if (volRatio >= 2.5) {
    reasons.push(`Hacim ${volRatio.toFixed(1)}x ortalama - ciddi ilgi`);
    score += Math.sign(changePct) * 10;
  } else if (volRatio >= 1.8) {
    reasons.push(`Hacim ${volRatio.toFixed(1)}x ortalama`);
    score += Math.sign(changePct) * 5;
  }

  // Skoru -100..+100 aralıgina sikistir
  score = Math.max(-100, Math.min(100, score));

  const label: Signal['label'] =
    score >= 50 ? 'güçlü-al' :
    score >= 20 ? 'al' :
    score <= -50 ? 'güçlü-sat' :
    score <= -20 ? 'sat' : 'nötr';

  // En az 1 sinyal üretemiyorsa nötr göster ama gizleyebiliriz frontend'de
  if (reasons.length === 0) {
    reasons.push('Belirgin sinyal yok');
  }

  return {
    symbol,
    price: last.close,
    changePct,
    strength: score,
    label,
    reasons: reasons.slice(0, 4),
    metrics: {
      rsi: r ?? undefined,
      macdCross: cross,
      maPosition: maPos || undefined,
      volumeRatio: volRatio,
    },
  };
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  let body: { symbols?: string[]; lookbackDays?: number } = {};
  try { body = await request.json(); } catch { /* boş OK */ }

  const symbols = (body.symbols && body.symbols.length > 0 ? body.symbols : DEFAULT_SYMBOLS)
    .map((s) => s.toUpperCase())
    .slice(0, 30);

  const origin = new URL(request.url).origin;

  // Paralel fetch — 30 sembol için Yahoo proxy dayanır
  const results = await Promise.all(symbols.map(async (sym) => {
    const bars = await fetchYahooBars(origin, sym);
    if (!bars) return null;
    return analyzeBars(sym, bars);
  }));

  const signals = results
    .filter((s): s is Signal => s !== null)
    .sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength));

  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    scannedSymbols: symbols.length,
    signals,
  } as AgentResponse, 200, 900);
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
