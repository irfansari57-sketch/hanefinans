/**
 * POST /api/cron/metals-refresh
 *
 * Yahoo Finance'ten XAUUSD=X, XAGUSD=X, XPTUSD=X, XPDUSD=X spot degerlerini
 * ceker, D1 `metals_spot` tablosuna yazar. Frontend `/api/spot-metals`
 * bu tablodan tek row per metal okur — GoldAPI/MetalsAPI free tier quota
 * tuketmez, tum user'lar tek fetch'i paylasir.
 *
 * Auth: X-Cron-Secret header = CRON_SECRET env value.
 * Tetikleyici: .github/workflows/metals-refresh.yml (hafta ici her 30dk,
 * hafta sonu 2 saatte bir — Yahoo hafta sonu Cuma close'u tekrar dondurur,
 * yani veriyi refresh etmek gerekir).
 *
 * Basari kriteri: en az 1 metal Yahoo'dan gelirse basarili. Digerleri
 * eski D1 degerini korur (INSERT OR REPLACE sadece gelen metaller icin).
 *
 * Hafta sonu bug guardi: yeni price ile eski price ayni ise degisimi 0'la
 * (Yahoo hafta sonu Cuma close'u prev=Cuma-1 ile karistirip yanlis %
 * doner). Ayrica |change_pct| > 15 outlier ise 0'la.
 */

interface Env {
  DB: D1Database;
  CRON_SECRET?: string;
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
      };
      indicators?: {
        quote?: Array<{ close?: (number | null)[] }>;
      };
    }>;
  };
}

interface MetalFetch {
  price: number;
  changePct: number;
  prevClose: number;
  asof: string;
  updatedAt: number;
}

/**
 * Yahoo chart endpoint — tek sembol icin son 5 gunun bar'lari.
 * price = son valid close, prev = onceki gunun close'u.
 * Hafta sonu koruma: eger yeni price ile prev ayni ise (Yahoo bug),
 * changePct=0 don.
 */
async function fetchYahooMetal(symbol: string): Promise<MetalFetch | null> {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.searchParams.set('interval', '1d');
  url.searchParams.set('range', '5d');
  try {
    const resp = await fetch(url.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      cf: { cacheTtl: 60, cacheEverything: true } as RequestInitCfProperties,
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as YahooChartResult;
    const result = json.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const validCloses: number[] = [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (c != null && Number.isFinite(c) && (c as number) > 0) validCloses.push(c as number);
      if (validCloses.length >= 3) break;
    }

    let price: number | undefined = meta.regularMarketPrice;
    if (price == null && validCloses.length > 0) price = validCloses[0];
    if (price == null || !Number.isFinite(price) || price <= 0) return null;

    // prevClose: Yahoo previousClose > chartPreviousClose > validCloses[1]
    let prev: number | undefined;
    if (meta.previousClose && meta.previousClose > 0 && meta.previousClose !== price) {
      prev = meta.previousClose;
    } else if (meta.chartPreviousClose && meta.chartPreviousClose > 0 && meta.chartPreviousClose !== price) {
      prev = meta.chartPreviousClose;
    } else if (validCloses.length >= 2 && validCloses[1] !== price) {
      prev = validCloses[1];
    }
    if (!prev || prev <= 0) prev = price;

    let changePct = prev !== price ? ((price - prev) / prev) * 100 : 0;
    // Outlier clamp: metaller gunluk ±%15'i genelde gecmez.
    if (Math.abs(changePct) > 15) changePct = 0;

    const updatedAt = meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now();
    const asof = new Date(updatedAt).toISOString().slice(0, 10);
    return { price, changePct, prevClose: prev, asof, updatedAt };
  } catch {
    return null;
  }
}

const METALS: Array<{ metal: 'XAU' | 'XAG' | 'XPT' | 'XPD'; yahoo: string }> = [
  { metal: 'XAU', yahoo: 'XAUUSD=X' },
  { metal: 'XAG', yahoo: 'XAGUSD=X' },
  { metal: 'XPT', yahoo: 'XPTUSD=X' },
  { metal: 'XPD', yahoo: 'XPDUSD=X' },
];

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  // Auth
  const secret = request.headers.get('X-Cron-Secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'no-db' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{ metal: string; ok: boolean; price?: number; changePct?: number; error?: string }> = [];
  const now = Date.now();

  // Paralel fetch — 4 metal
  const fetched = await Promise.all(
    METALS.map(async ({ metal, yahoo }) => ({ metal, data: await fetchYahooMetal(yahoo) })),
  );

  // D1 write — sadece basari ile gelenler; digerleri eski degerini korur
  for (const { metal, data } of fetched) {
    if (!data) {
      results.push({ metal, ok: false, error: 'yahoo-fetch-failed' });
      continue;
    }
    try {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO metals_spot (metal, price_usd, change_pct, prev_close, source, asof, updated_at)
         VALUES (?, ?, ?, ?, 'yahoo', ?, ?)`,
      )
        .bind(metal, data.price, data.changePct, data.prevClose, data.asof, now)
        .run();
      results.push({ metal, ok: true, price: data.price, changePct: data.changePct });
    } catch (e) {
      results.push({ metal, ok: false, error: `d1-write-failed: ${(e as Error).message}` });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return new Response(
    JSON.stringify({
      ok: okCount > 0,
      updatedAt: now,
      results,
      summary: `${okCount}/${METALS.length} metals refreshed`,
    }),
    {
      status: okCount > 0 ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
