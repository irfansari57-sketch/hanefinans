/**
 * Cloudflare Pages Function — Telegram Bot proxy.
 * TELEGRAM_BOT_TOKEN URL'e inject edilir, frontend görmez.
 *
 * Tarayıcı /api/telegram/sendMessage çağırır
 * → bu function api.telegram.org/bot<TOKEN>/sendMessage'a yönlendirir
 */

interface Env {
  TELEGRAM_BOT_TOKEN?: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');

  if (!env.TELEGRAM_BOT_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: 'TELEGRAM_BOT_TOKEN env not set' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const target = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${path}`;

  const init: RequestInit = {
    method: request.method,
    headers: {
      'Content-Type': request.headers.get('Content-Type') ?? 'application/x-www-form-urlencoded',
    },
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
