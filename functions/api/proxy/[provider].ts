/**
 * GET /api/proxy/:provider — 3. taraf ücretli API'ler için sunucu tarafı proxy.
 *
 * 13 Eki 2026 (P0): GNews/GoldAPI/TwelveData/Metals-API anahtarları VITE_* ile
 * istemci bundle'ına giriyordu. Artık anahtarlar yalnızca Pages env'de:
 *   GNEWS_API_KEY, GOLDAPI_KEY, TWELVEDATA_KEY, METALSAPI_KEY
 *
 * Sağlayıcılar ve parametreler (whitelist, başka parametre geçmez):
 *   gnews       ?q=<metin>&max=<1..50>
 *   goldapi     ?pair=XAU|XAG|XPT|XPD
 *   twelvedata  ?symbol=<A,B,C>&exchange=BIST?   (forex/emtia için exchange yok)
 *   metalsapi   ?symbols=XAU,XAG,XPT,XPD
 *
 * Edge cache: kota koruması için sağlayıcıya göre 5–30 dk; hata yanıtı cache'lenmez.
 * Anahtar yoksa 503 (frontend null döner, eski davranış korunur).
 */

interface Env {
  GNEWS_API_KEY?: string;
  GOLDAPI_KEY?: string;
  TWELVEDATA_KEY?: string;
  METALSAPI_KEY?: string;
}

type Provider = 'gnews' | 'goldapi' | 'twelvedata' | 'metalsapi';

const TTL: Record<Provider, number> = {
  gnews: 600,
  goldapi: 1800,
  twelvedata: 300,
  metalsapi: 1800,
};

function json(data: unknown, status = 200, cacheControl = 'no-store'): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheControl },
  });
}

function buildUpstream(provider: Provider, q: URLSearchParams, env: Env): { url: string; headers?: Record<string, string> } | Response {
  switch (provider) {
    case 'gnews': {
      if (!env.GNEWS_API_KEY) return json({ ok: false, error: 'GNEWS_API_KEY tanımlı değil' }, 503);
      const query = (q.get('q') ?? '').slice(0, 200);
      const max = Math.min(50, Math.max(1, parseInt(q.get('max') ?? '25', 10) || 25));
      if (!query) return json({ ok: false, error: 'q zorunlu' }, 400);
      const u = new URL('https://gnews.io/api/v4/search');
      u.searchParams.set('q', query);
      u.searchParams.set('lang', 'tr');
      u.searchParams.set('country', 'tr');
      u.searchParams.set('max', String(max));
      u.searchParams.set('apikey', env.GNEWS_API_KEY);
      return { url: u.toString() };
    }
    case 'goldapi': {
      if (!env.GOLDAPI_KEY) return json({ ok: false, error: 'GOLDAPI_KEY tanımlı değil' }, 503);
      const pair = (q.get('pair') ?? '').toUpperCase();
      if (!/^(XAU|XAG|XPT|XPD)$/.test(pair)) return json({ ok: false, error: 'pair XAU|XAG|XPT|XPD olmalı' }, 400);
      return {
        url: `https://www.goldapi.io/api/${pair}/USD`,
        headers: { 'x-access-token': env.GOLDAPI_KEY, 'Content-Type': 'application/json' },
      };
    }
    case 'twelvedata': {
      if (!env.TWELVEDATA_KEY) return json({ ok: false, error: 'TWELVEDATA_KEY tanımlı değil' }, 503);
      const symbol = (q.get('symbol') ?? '').toUpperCase();
      if (!symbol || !/^[A-Z0-9/.,=-]{1,200}$/.test(symbol)) return json({ ok: false, error: 'symbol geçersiz' }, 400);
      const u = new URL('https://api.twelvedata.com/quote');
      u.searchParams.set('symbol', symbol);
      const exchange = q.get('exchange');
      if (exchange && /^[A-Z]{1,10}$/.test(exchange)) u.searchParams.set('exchange', exchange);
      u.searchParams.set('apikey', env.TWELVEDATA_KEY);
      return { url: u.toString() };
    }
    case 'metalsapi': {
      if (!env.METALSAPI_KEY) return json({ ok: false, error: 'METALSAPI_KEY tanımlı değil' }, 503);
      const symbols = (q.get('symbols') ?? 'XAU,XAG,XPT,XPD').toUpperCase();
      if (!/^(XAU|XAG|XPT|XPD)(,(XAU|XAG|XPT|XPD))*$/.test(symbols)) return json({ ok: false, error: 'symbols geçersiz' }, 400);
      const u = new URL('https://metals-api.com/api/latest');
      u.searchParams.set('access_key', env.METALSAPI_KEY);
      u.searchParams.set('base', 'USD');
      u.searchParams.set('symbols', symbols);
      return { url: u.toString() };
    }
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, params, env, waitUntil }) => {
  const provider = String(params.provider ?? '') as Provider;
  if (!(provider in TTL)) return json({ ok: false, error: 'Bilinmeyen sağlayıcı' }, 404);

  const url = new URL(request.url);
  const built = buildUpstream(provider, url.searchParams, env);
  if (built instanceof Response) return built;

  // Edge cache — anahtar içermeyen kendi URL'imiz (apikey upstream'de kalır)
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  let upstream: Response;
  try {
    upstream = await fetch(built.url, { headers: built.headers, signal: ctrl.signal });
  } catch (e) {
    clearTimeout(t);
    return json({ ok: false, error: `upstream: ${(e as Error).message}` }, 502);
  }
  clearTimeout(t);

  const body = await upstream.text();
  if (!upstream.ok) {
    return json({ ok: false, error: `upstream ${upstream.status}`, detail: body.slice(0, 200) }, 502);
  }

  const ttl = TTL[provider];
  const resp = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
    },
  });
  waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
  return resp;
};
