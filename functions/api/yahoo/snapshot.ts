/**
 * /api/yahoo/snapshot — toplu quote endpoint
 *
 * Tek HTTP isteyle tüm sembollerin son quote'unu D1 cache'den döner.
 * Frontend 819 ayrı request yerine 1 request atar → ilk render saniyeler içinde.
 *
 * Quote için kullanılan cache key: `${symbol}:5d:1d` (tatil/hafta sonu fix sonrası)
 * Eski cache key `${symbol}:2d:1d` da fallback olarak okunur.
 *
 * Format: { ok: true, updatedAt: <ms>, quotes: { SYMBOL: { price, changePct, prev, updatedAt } } }
 */

interface Env {
  DB?: D1Database;
}

interface QuoteOut {
  price: number;
  changePct: number;
  prev: number;
  updatedAt: number;
  name?: string;
}

interface YahooChartResult {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        regularMarketTime?: number;
        shortName?: string;
        longName?: string;
      };
      indicators?: {
        quote?: Array<{ close?: (number | null)[] }>;
      };
    }>;
  };
}

function parseYahooBody(body: string): { price: number; changePct: number; prev: number; updatedAt: number; name?: string } | null {
  try {
    const json = JSON.parse(body) as YahooChartResult;
    const result = json.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const validCloses: number[] = [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (c != null && Number.isFinite(c) && (c as number) > 0) validCloses.push(c as number);
      if (validCloses.length >= 2) break;
    }

    let price: number | undefined = meta.regularMarketPrice;
    if (price == null && validCloses.length > 0) price = validCloses[0];
    if (price == null || !Number.isFinite(price) || price <= 0) return null;

    let prev: number;
    if (validCloses.length >= 2) {
      const lastClose = validCloses[0];
      const beforeClose = validCloses[1];
      prev = Math.abs(price - lastClose) < 0.0001 ? beforeClose : lastClose;
    } else {
      prev = meta.previousClose ?? meta.chartPreviousClose ?? price;
    }
    const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    const updatedAt = meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now();
    return { price, changePct, prev, updatedAt, name: meta.shortName ?? meta.longName };
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

  // Quote cache keys: ":5d:1d" suffix (yeni). Legacy 2d:1d'yi skip — tatil/kapali piyasa
  // verilerinde changePct=0 dondurup frontend'i mock'a dusururdu.
  const rows = await env.DB
    .prepare(
      `SELECT key, payload, updated_at FROM yahoo_cache
       WHERE key LIKE '%:5d:1d'
       ORDER BY updated_at DESC`,
    )
    .all<{ key: string; payload: string; updated_at: number }>();

  const quotes: Record<string, QuoteOut> = {};
  const seen = new Set<string>();
  let parsedCount = 0;
  let mostRecent = 0;

  for (const row of rows.results ?? []) {
    // key format: "SYMBOL:5d:1d" or "SYMBOL:2d:1d"
    const colonIdx = row.key.indexOf(':');
    if (colonIdx < 0) continue;
    const symbol = row.key.slice(0, colonIdx);
    if (seen.has(symbol)) continue; // ORDER BY desc => en yenisini al
    seen.add(symbol);

    const q = parseYahooBody(row.payload);
    if (!q) continue;
    quotes[symbol] = q;
    parsedCount++;
    if (row.updated_at > mostRecent) mostRecent = row.updated_at;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      count: parsedCount,
      updatedAt: mostRecent,
      quotes,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
      },
    },
  );
};
