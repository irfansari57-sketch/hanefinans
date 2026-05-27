/**
 * /api/yahoo/returns-snapshot — toplu PeriodReturns endpoint
 *
 * D1'deki :1y:1d historical cache'leri okuyup her sembol icin PeriodReturns hesapla.
 * Frontend 200 sembol icin ayri Yahoo cagrisi yapmak yerine 1 cagri.
 *
 * Format: { ok: true, updatedAt: <ms>, returns: { SYMBOL: { "1g", "1h", "1a", "3a", "6a", "1y" } } }
 */

interface Env {
  DB?: D1Database;
}

interface PeriodReturns {
  '1g'?: number;
  '1h'?: number;
  '1a'?: number;
  '3a'?: number;
  '6a'?: number;
  '1y'?: number;
}

interface YahooHistRaw {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: (number | null)[] }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
  };
}

function computePeriodReturns(closes: { date: number; close: number }[]): PeriodReturns {
  if (closes.length === 0) return {};
  const last = closes[closes.length - 1];
  const findOldest = (daysAgo: number) => {
    const targetMs = last.date - daysAgo * 86400_000;
    let best: { date: number; close: number } | null = null;
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (c.date <= targetMs) { best = c; break; }
      best = c;
    }
    return best;
  };
  const pct = (old?: { close: number } | null) =>
    old && old.close > 0 ? ((last.close - old.close) / old.close) * 100 : undefined;
  return {
    '1g': pct(findOldest(1)),
    '1h': pct(findOldest(7)),
    '1a': pct(findOldest(30)),
    '3a': pct(findOldest(90)),
    '6a': pct(findOldest(180)),
    '1y': pct(findOldest(365)),
  };
}

function parseHist(body: string): { date: number; close: number }[] | null {
  try {
    const json = JSON.parse(body) as YahooHistRaw;
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    const closes = result.indicators?.adjclose?.[0]?.adjclose ?? quote?.close ?? [];
    if (timestamps.length === 0 || closes.length === 0) return null;
    const pairs: { date: number; close: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c == null || !Number.isFinite(c) || (c as number) <= 0) continue;
      pairs.push({ date: timestamps[i] * 1000, close: c as number });
    }
    return pairs.length > 0 ? pairs : null;
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // :1y:1d cache key'lerini oku
  const rows = await env.DB
    .prepare(
      `SELECT key, payload, updated_at FROM yahoo_cache
       WHERE key LIKE '%:1y:1d'
       ORDER BY updated_at DESC`,
    )
    .all<{ key: string; payload: string; updated_at: number }>();

  const returns: Record<string, PeriodReturns> = {};
  const seen = new Set<string>();
  let parsedCount = 0;
  let mostRecent = 0;

  for (const row of rows.results ?? []) {
    const colonIdx = row.key.indexOf(':');
    if (colonIdx < 0) continue;
    const symbol = row.key.slice(0, colonIdx);
    if (seen.has(symbol)) continue;
    seen.add(symbol);

    const closes = parseHist(row.payload);
    if (!closes) continue;
    const r = computePeriodReturns(closes);
    if (Object.values(r).some((v) => v != null)) {
      returns[symbol] = r;
      parsedCount++;
      if (row.updated_at > mostRecent) mostRecent = row.updated_at;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      count: parsedCount,
      updatedAt: mostRecent,
      returns,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
      },
    },
  );
};
