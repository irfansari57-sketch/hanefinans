/**
 * Cloudflare Pages Function — Yahoo Finance proxy (D1-cache + SWR).
 *
 * Strateji:
 *   1. Edge cache (5dk) → hızlı yol
 *   2. D1 fresh (< 6dk) → döndür [X-Source: D1]
 *   3. D1 stale (< 24h): eski veriyi ANINDA dön [X-Source: D1-SWR],
 *      ARKA PLANDA upstream'i tetikle (ctx.waitUntil), D1'i güncelle
 *   4. D1 yok: upstream'e gid, yaz, döndür [X-Source: UPSTREAM]
 *   5. Upstream 429/5xx + D1 stale varsa: STALE-D1 fallback
 */

interface Env { DB?: D1Database; }

interface CacheRow {
  payload: string;
  updated_at: number;
  status: number;
}

const FRESH_MS = 6 * 60 * 1000;
const SWR_MAX_MS = 24 * 60 * 60 * 1000;

function parseChartRequest(path: string, search: string): { symbol: string; range: string; interval: string } | null {
  const m = /^v8\/finance\/chart\/(.+)$/.exec(path);
  if (!m) return null;
  const symbol = decodeURIComponent(m[1]);
  const params = new URLSearchParams(search);
  const range = params.get('range') ?? '1mo';
  const interval = params.get('interval') ?? '1d';
  return { symbol, range, interval };
}

async function readCache(db: D1Database, key: string): Promise<CacheRow | null> {
  const row = await db
    .prepare('SELECT payload, updated_at, status FROM yahoo_cache WHERE key = ?')
    .bind(key)
    .first<CacheRow>();
  return row;
}

async function writeCache(db: D1Database, key: string, payload: string, status: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO yahoo_cache (key, payload, updated_at, status, source)
       VALUES (?, ?, ?, ?, 'proxy')
       ON CONFLICT(key) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at,
         status = excluded.status,
         source = 'proxy'`,
    )
    .bind(key, payload, Date.now(), status)
    .run();
}

function makeResponse(body: string | ArrayBuffer, status: number, source: 'D1' | 'D1-SWR' | 'STALE-D1' | 'UPSTREAM' | 'EDGE'): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': status === 200 ? 'public, max-age=300, s-maxage=300' : 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Source': source,
    },
  });
}

async function fetchUpstreamAndCache(
  target: string,
  cacheKey: string | null,
  db: D1Database | undefined,
): Promise<{ status: number; body: string }> {
  const upstream = await fetch(target, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept: 'application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  const body = await upstream.text();
  if (upstream.ok && cacheKey && db) {
    await writeCache(db, cacheKey, body, upstream.status).catch(() => null);
  }
  return { status: upstream.status, body };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, params, env } = context;
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');
  const url = new URL(request.url);
  const target = `https://query1.finance.yahoo.com/${path}${url.search}`;

  const chartReq = parseChartRequest(path, url.search);
  const ctx = context as typeof context & { waitUntil?: (p: Promise<unknown>) => void };
  const waitUntil = ctx.waitUntil?.bind(ctx) ?? ((_p: Promise<unknown>) => undefined);

  // === EDGE CACHE ===
  const cache = caches.default;
  const edgeKey = new Request(target, { method: 'GET' });
  const edgeHit = await cache.match(edgeKey);
  if (edgeHit) {
    return new Response(edgeHit.body, {
      status: edgeHit.status,
      headers: {
        'Content-Type': edgeHit.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
        'X-Source': 'EDGE',
      },
    });
  }

  // === D1 CACHE ===
  const cacheKey = chartReq ? `${chartReq.symbol}:${chartReq.range}:${chartReq.interval}` : null;

  if (chartReq && env.DB && cacheKey) {
    const cached = await readCache(env.DB, cacheKey);
    if (cached) {
      const age = Date.now() - cached.updated_at;

      // FRESH → anında dön
      if (age < FRESH_MS) {
        const resp = makeResponse(cached.payload, cached.status, 'D1');
        await cache.put(edgeKey, resp.clone());
        return resp;
      }

      // STALE-WHILE-REVALIDATE: eski veriyi dön + arka planda yenile
      if (age < SWR_MAX_MS) {
        // Arka plan task'ı tetikle (response'u beklemez)
        waitUntil(
          (async () => {
            try {
              const fresh = await fetchUpstreamAndCache(target, cacheKey, env.DB);
              if (fresh.status === 200) {
                // Edge cache'i de güncelle
                const freshResp = makeResponse(fresh.body, 200, 'UPSTREAM');
                await cache.put(edgeKey, freshResp.clone());
              }
            } catch { /* arka plan hatası — sessizce yut */ }
          })(),
        );
        // Stale veriyi anında dön
        return makeResponse(cached.payload, cached.status, 'D1-SWR');
      }
      // 24h+ stale — upstream'e git
    }
  }

  // === UPSTREAM ===
  let upstreamStatus: number;
  let upstreamBody: string;
  try {
    const result = await fetchUpstreamAndCache(target, cacheKey, env.DB);
    upstreamStatus = result.status;
    upstreamBody = result.body;
  } catch (e) {
    // Network error — D1 son çare
    if (chartReq && env.DB && cacheKey) {
      const stale = await readCache(env.DB, cacheKey);
      if (stale && Date.now() - stale.updated_at < SWR_MAX_MS) {
        return makeResponse(stale.payload, 200, 'STALE-D1');
      }
    }
    return new Response(JSON.stringify({ error: 'upstream_unreachable', detail: String(e) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  if (upstreamStatus === 200) {
    const resp = makeResponse(upstreamBody, 200, 'UPSTREAM');
    await cache.put(edgeKey, resp.clone()).catch(() => null);
    return resp;
  }

  // 429/5xx → stale fallback
  if (chartReq && env.DB && cacheKey && (upstreamStatus === 429 || upstreamStatus >= 500)) {
    const stale = await readCache(env.DB, cacheKey);
    if (stale && Date.now() - stale.updated_at < SWR_MAX_MS) {
      return makeResponse(stale.payload, 200, 'STALE-D1');
    }
  }

  return new Response(upstreamBody, {
    status: upstreamStatus,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Source': 'UPSTREAM',
    },
  });
};
