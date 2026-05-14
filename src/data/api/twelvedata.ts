import { API_KEYS } from './keys';
import type { Stock } from '../types';

interface TDQuote {
  symbol?: string;
  name?: string;
  exchange?: string;
  close?: string;
  percent_change?: string;
  datetime?: string;
  code?: number;
  status?: 'ok' | 'error';
  message?: string;
}

const BASE = 'https://api.twelvedata.com';

function isError(q: TDQuote): boolean {
  return q.status === 'error' || !q.close;
}

export async function fetchQuotesTD(symbols: string[]): Promise<Stock[] | null> {
  if (!API_KEYS.twelveData || symbols.length === 0) return null;
  try {
    const url = `${BASE}/quote?symbol=${encodeURIComponent(symbols.join(','))}&exchange=BIST&apikey=${API_KEYS.twelveData}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, TDQuote> | TDQuote;
    const entries: TDQuote[] = Array.isArray(json)
      ? (json as TDQuote[])
      : typeof (json as TDQuote).close === 'string'
      ? [json as TDQuote]
      : Object.values(json as Record<string, TDQuote>);
    const ok = entries.filter((q) => !isError(q));
    if (ok.length === 0) return null;
    return ok.map((q) => ({
      symbol: (q.symbol ?? '').toUpperCase(),
      name: q.name ?? q.symbol ?? '',
      sector: undefined,
      price: parseFloat(q.close!),
      changePct: parseFloat(q.percent_change ?? '0'),
      updatedAt: q.datetime ? new Date(q.datetime).toISOString() : new Date().toISOString(),
    }));
  } catch {
    return null;
  }
}
