/**
 * Cloudflare Pages Function — Yahoo Finance proxy.
 * Dev'deki Vite proxy'nin production karşılığı.
 *
 * Tarayıcı /api/yahoo/v8/finance/chart/THYAO.IS çağırır
 * → bu function query1.finance.yahoo.com/v8/finance/chart/THYAO.IS'e yönlendirir
 */

interface Env {}

export const onRequest: PagesFunction<Env> = async ({ request, params }) => {
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');
  const url = new URL(request.url);
  const target = `https://query1.finance.yahoo.com/${path}${url.search}`;

  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept: 'application/json',
    },
  });

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': 'public, max-age=30',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
