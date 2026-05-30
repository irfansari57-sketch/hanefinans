/**
 * Yahoo finance query hook'ları — TanStack Query üzerinden cache + dedup.
 *
 * Aynı sembol için açık birden çok sayfa varsa Yahoo'ya tek istek atılır.
 * Cache anahtarı `['yahoo', 'historical', sym, range, interval]` gibi tip-güvenli
 * tuple'larla yönetilir.
 *
 * Var olan saf `fetchHistoricalYahoo` / `fetchQuotesYahoo` imza-uyumlu çalışmaya
 * devam eder; bunlar artık `http.ts` üzerinden geçer (timeout + retry).
 */

import { useQuery, useQueries, type UseQueryResult } from '@tanstack/react-query';
import { request } from '@/lib/http';
import type { HistoricalSeries, OhlcvBar } from './yahoo';

// ============================================================
// Sembol normalize
// ============================================================
function isBareBistSymbol(s: string): boolean {
  return !(s.includes('.') || s.startsWith('^') || s.includes('=') || s.includes('-'));
}

export function toBistSymbolIfNeeded(symbol: string, addBistSuffix = true): string {
  if (!addBistSuffix) return symbol;
  return isBareBistSymbol(symbol) ? `${symbol}.IS` : symbol;
}

// ============================================================
// Spot quote (single price + changePct)
// ============================================================
export interface YahooQuote {
  symbol: string;
  price: number;
  changePct: number;
  name?: string;
  currency?: string;
  updatedAt: string;
}

interface YahooChartRaw {
  chart: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        regularMarketTime?: number;
        currency?: string;
        shortName?: string;
        longName?: string;
        exchangeName?: string;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

async function fetchYahooQuote(
  symbol: string,
  signal: AbortSignal | undefined,
): Promise<YahooQuote | null> {
  const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  const j = await request<YahooChartRaw>(url, { signal, retries: 1 });
  const meta = j.chart.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice == null) return null;
  const prev = meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
  const price = meta.regularMarketPrice;
  return {
    symbol,
    price,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    name: meta.shortName ?? meta.longName,
    currency: meta.currency,
    updatedAt: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
  };
}

export interface UseYahooQuoteOptions {
  /** BIST sembolüne `.IS` eklensin mi (default true). ABD/kripto/forex için false. */
  bistSuffix?: boolean;
  /** Cache stale süresi (ms). Canlı endeks için 0, normalde 60_000. */
  staleTime?: number;
  /** Periyodik yenileme (ms). Default off. */
  refetchInterval?: number | false;
  /** Hook etkin mi (kullanıcı symbol vermediyse false). */
  enabled?: boolean;
}

export function useYahooQuote(symbol: string | null | undefined, options: UseYahooQuoteOptions = {}) {
  const sym = symbol ? toBistSymbolIfNeeded(symbol, options.bistSuffix !== false) : '';
  return useQuery({
    queryKey: ['yahoo', 'quote', sym],
    queryFn: ({ signal }) => fetchYahooQuote(sym, signal),
    enabled: !!sym && (options.enabled ?? true),
    staleTime: options.staleTime,
    refetchInterval: options.refetchInterval,
  });
}

/**
 * Toplu quote — birden çok sembol için aynı anda useQuery
 * (useQueries TanStack desteği). Her biri ayrı cache'lenir.
 */
export function useYahooQuotes(symbols: string[], options: UseYahooQuoteOptions = {}) {
  const list = symbols.map((s) => toBistSymbolIfNeeded(s, options.bistSuffix !== false));
  return useQueries({
    queries: list.map((sym) => ({
      queryKey: ['yahoo', 'quote', sym] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchYahooQuote(sym, signal),
      enabled: !!sym && (options.enabled ?? true),
      staleTime: options.staleTime,
      refetchInterval: options.refetchInterval,
    })),
  });
}

// ============================================================
// Historical series
// ============================================================
export type YahooRange = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'ytd';
export type YahooInterval = '1m' | '5m' | '15m' | '30m' | '60m' | '1d' | '1wk' | '1mo';

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

async function fetchYahooHistorical(
  symbol: string,
  range: YahooRange,
  interval: YahooInterval,
  signal: AbortSignal | undefined,
): Promise<HistoricalSeries | null> {
  const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const j = await request<YahooHistoricalRaw>(url, { signal, retries: 1, timeoutMs: 15_000 });
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
    if (c == null) continue;
    const o = quote?.open?.[i];
    const h = quote?.high?.[i];
    const l = quote?.low?.[i];
    const v = quote?.volume?.[i];
    pairs.push({ date: timestamps[i] * 1000, close: c });
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
    symbol,
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
}

export interface UseYahooHistoricalOptions {
  range?: YahooRange;
  interval?: YahooInterval;
  bistSuffix?: boolean;
  enabled?: boolean;
  /** Geçmiş veri statik → 5 dk staleTime makul. Override edilebilir. */
  staleTime?: number;
}

export function useYahooHistorical(symbol: string | null | undefined, options: UseYahooHistoricalOptions = {}) {
  const sym = symbol ? toBistSymbolIfNeeded(symbol, options.bistSuffix !== false) : '';
  const range = options.range ?? '1y';
  const interval = options.interval ?? '1d';
  return useQuery({
    queryKey: ['yahoo', 'historical', sym, range, interval],
    queryFn: ({ signal }) => fetchYahooHistorical(sym, range, interval, signal),
    enabled: !!sym && (options.enabled ?? true),
    staleTime: options.staleTime ?? 5 * 60_000,
  });
}

/**
 * Toplu historical — Watchlist gibi N sembollü ekranlarda kullanılır.
 * Returns: `UseQueryResult<HistoricalSeries | null>[]` (input sırasıyla).
 */
export function useYahooHistoricals(
  symbols: string[],
  options: UseYahooHistoricalOptions = {},
): UseQueryResult<HistoricalSeries | null>[] {
  const list = symbols.map((s) => toBistSymbolIfNeeded(s, options.bistSuffix !== false));
  const range = options.range ?? '1y';
  const interval = options.interval ?? '1d';
  return useQueries({
    queries: list.map((sym) => ({
      queryKey: ['yahoo', 'historical', sym, range, interval] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchYahooHistorical(sym, range, interval, signal),
      enabled: !!sym && (options.enabled ?? true),
      staleTime: options.staleTime ?? 5 * 60_000,
    })),
  });
}
