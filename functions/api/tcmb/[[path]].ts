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

  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      key: env.TCMB_API_KEY,
      'User-Agent': 'Mozilla/5.0 Chrome/120.0',
      Accept: 'application/json',
    },
  });

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
