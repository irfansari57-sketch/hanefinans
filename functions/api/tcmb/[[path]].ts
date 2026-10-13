/**
 * Cloudflare Pages Function — TCMB EVDS proxy.
 * TCMB_API_KEY environment variable'a inject edilir, frontend görmez.
 */

interface Env {
  TCMB_API_KEY?: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');
  const target = `https://evds2.tcmb.gov.tr/service/evds/${path}`;

  if (!env.TCMB_API_KEY) {
    return new Response(JSON.stringify({ error: 'TCMB_API_KEY environment variable not set' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 13 Eki 2026: path kısıtı (sadece EVDS serileri), timeout, hata yanıtını cache'leme.
  if (!/^[A-Za-z0-9_\-./=&?%]+$/.test(path) || path.includes('..')) {
    return new Response(JSON.stringify({ error: 'Geçersiz path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: 'GET',
      signal: ctrl.signal,
      headers: {
        key: env.TCMB_API_KEY,
        'User-Agent': 'Mozilla/5.0 Chrome/120.0',
        Accept: 'application/json',
      },
    });
  } catch (e) {
    clearTimeout(t);
    return new Response(JSON.stringify({ error: `TCMB upstream: ${(e as Error).message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  clearTimeout(t);

  const body = await upstream.arrayBuffer();
  // Sadece 200 cache'lenir; 4xx/5xx asla (cache zehirlenmesi).
  const cacheControl = upstream.ok ? 'public, max-age=300, s-maxage=300' : 'no-store';
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': cacheControl,
    },
  });
};
