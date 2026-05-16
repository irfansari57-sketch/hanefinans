import type { Stock } from '../types';

// Vite dev proxy üzerinden çağrılır. Production'da Hafta 2 backend agent'a değişecek.
// /api/yahoo → query1.finance.yahoo.com

interface YahooChartResult {
  chart: {
    result?: {
      meta?: {
        symbol: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        regularMarketTime?: number;
        currency?: string;
        shortName?: string;
        longName?: string;
        exchangeName?: string;
      };
    }[];
    error?: { code: string; description: string } | null;
  };
}

function toBISTSymbol(s: string): string {
  // BIST sembolleri Yahoo'da `.IS` suffix'iyle: THYAO.IS
  if (s.includes('.') || s.startsWith('^') || s.includes('=')) return s;
  return `${s}.IS`;
}

async function fetchOne(yahooSymbol: string): Promise<{ price: number; changePct: number; name?: string; updatedAt: string } | null> {
  try {
    const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResult;
    const meta = json.chart.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice == null) return null;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
    const price = meta.regularMarketPrice;
    const changePct = prev ? ((price - prev) / prev) * 100 : 0;
    const updatedAt = meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();
    return { price, changePct, name: meta.shortName ?? meta.longName, updatedAt };
  } catch {
    return null;
  }
}

export async function fetchQuotesYahoo(symbols: string[]): Promise<Stock[] | null> {
  if (symbols.length === 0) return null;
  const results = await Promise.all(symbols.map((s) => fetchOne(toBISTSymbol(s))));
  const stocks: Stock[] = [];
  symbols.forEach((s, i) => {
    const r = results[i];
    if (r) {
      stocks.push({
        symbol: s.toUpperCase(),
        name: r.name ?? s,
        sector: undefined,
        price: r.price,
        changePct: r.changePct,
        updatedAt: r.updatedAt,
      });
    }
  });
  return stocks.length ? stocks : null;
}

export async function fetchIndexYahoo(
  yahooSymbol: string,
): Promise<{ value: number; changePct: number } | null> {
  const r = await fetchOne(yahooSymbol);
  if (!r) return null;
  return { value: r.price, changePct: r.changePct };
}

// Predefined Yahoo symbols for our macro indicators
export const YAHOO_SYMBOLS = {
  bist100: 'XU100.IS',
  bist30: 'XU030.IS',
  brent: 'BZ=F',
  wti: 'CL=F',
  vix: '^VIX',
  gold: 'GC=F',     // $ / ons (yedek; GoldAPI birincil)
  silver: 'SI=F',   // $ / ons
  platinum: 'PL=F', // $ / ons
  sp500Futures: 'ES=F',
  nasdaqFutures: 'NQ=F',
  dowFutures: 'YM=F',
} as const;

/** Bir ons emtiayı gram TL'ye çevir (1 ons = 31.1035 gram). */
export function ouncePriceToGramTRY(ouncePriceUsd: number, usdToTry: number): number {
  return (ouncePriceUsd / 31.1035) * usdToTry;
}

// ============= Historical data =============
export interface OhlcvBar {
  time: number;       // unix seconds (lightweight-charts formatı)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalSeries {
  symbol: string;
  closes: { date: number; close: number }[]; // timestamp ms + close (geriye uyumluluk)
  bars: OhlcvBar[];                            // candlestick için tam OHLCV
  meta: {
    currency?: string;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    regularMarketVolume?: number;
    averageDailyVolume3Month?: number;
    averageDailyVolume10Day?: number;
    marketCap?: number;
    name?: string;
    exchange?: string;
  };
}

interface YahooHistoricalRaw {
  chart: {
    result?: Array<{
      meta?: Record<string, unknown>;
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
  };
}

export async function fetchHistoricalYahoo(
  symbol: string,
  range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'ytd' = '1y',
  interval: '1m' | '5m' | '15m' | '30m' | '60m' | '1d' | '1wk' | '1mo' = '1d',
  options?: { bistSuffix?: boolean },
): Promise<HistoricalSeries | null> {
  // Default true — BIST hisseleri için THYAO → THYAO.IS dönüşümü.
  // ABD/kripto/forex için false geçilmeli (sembol olduğu gibi kullanılır).
  const useBistSuffix = options?.bistSuffix !== false;
  const ySym = (
    symbol.includes('.') || symbol.startsWith('^') || symbol.includes('=') || symbol.includes('-') || !useBistSuffix
  )
    ? symbol
    : `${symbol}.IS`;
  try {
    const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(ySym)}?range=${range}&interval=${interval}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as YahooHistoricalRaw;
    const result = j.chart.result?.[0];
    const meta = result?.meta;
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    const closes = result?.indicators?.adjclose?.[0]?.adjclose ?? quote?.close ?? [];
    if (timestamps.length === 0 || closes.length === 0) return null;

    const pairs: { date: number; close: number }[] = [];
    const bars: OhlcvBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      const o = quote?.open?.[i];
      const h = quote?.high?.[i];
      const l = quote?.low?.[i];
      const v = quote?.volume?.[i];
      if (c == null) continue;
      pairs.push({ date: timestamps[i] * 1000, close: c });
      // Bar için OHLC eksikse close ile doldur (tek satır flat candle)
      bars.push({
        time: timestamps[i],
        open: o ?? c,
        high: h ?? c,
        low: l ?? c,
        close: c,
        volume: v ?? 0,
      });
    }
    if (pairs.length === 0) return null;
    return {
      symbol: ySym,
      closes: pairs,
      bars,
      meta: {
        currency: meta?.currency as string,
        fiftyTwoWeekHigh: meta?.fiftyTwoWeekHigh as number,
        fiftyTwoWeekLow: meta?.fiftyTwoWeekLow as number,
        regularMarketVolume: meta?.regularMarketVolume as number,
        averageDailyVolume3Month: meta?.averageDailyVolume3Month as number,
        averageDailyVolume10Day: meta?.averageDailyVolume10Day as number,
        marketCap: meta?.marketCap as number,
        name: (meta?.shortName as string) ?? (meta?.longName as string),
        exchange: meta?.exchangeName as string,
      },
    };
  } catch {
    return null;
  }
}

/** Verilen tarihsel seriden periyot getirileri hesapla. */
export interface PeriodReturns {
  '1g'?: number;
  '1h'?: number;
  '1a'?: number;
  '3a'?: number;
  '6a'?: number;
  '1y'?: number;
}

export function computePeriodReturns(closes: { date: number; close: number }[]): PeriodReturns {
  if (closes.length === 0) return {};
  const last = closes[closes.length - 1];
  const findOldest = (daysAgo: number) => {
    const targetMs = last.date - daysAgo * 86400_000;
    // Hedef tarihten önceki veya eşit olan en yakın değeri bul
    let best: { date: number; close: number } | null = null;
    for (const p of closes) {
      if (p.date <= targetMs) best = p;
      else break;
    }
    return best;
  };
  const pct = (oldClose: number) => ((last.close - oldClose) / oldClose) * 100;
  const r: PeriodReturns = {};
  const days1 = findOldest(1); if (days1) r['1g'] = pct(days1.close);
  const days7 = findOldest(7); if (days7) r['1h'] = pct(days7.close);
  const days30 = findOldest(30); if (days30) r['1a'] = pct(days30.close);
  const days90 = findOldest(90); if (days90) r['3a'] = pct(days90.close);
  const days180 = findOldest(180); if (days180) r['6a'] = pct(days180.close);
  if (closes.length > 1) r['1y'] = pct(closes[0].close);
  return r;
}
