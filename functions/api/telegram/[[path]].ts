/**
 * Cloudflare Pages Function — Telegram Bot proxy.
 * TELEGRAM_BOT_TOKEN URL'e inject edilir, frontend görmez.
 *
 * Güvenlik (#Ö9, #K4):
 *  - Method whitelist: yalnızca sendMessage / sendPhoto / sendDocument / getMe
 *    (setWebhook, getUpdates, deleteWebhook → hijack vektörü, blok)
 *  - CORS wildcard kaldırıldı; same-origin default.
 *  - Path traversal blok.
 */

import { jsonResponse } from '../auth/_utils';

interface Env {
  TELEGRAM_BOT_TOKEN?: string;
}

// Yalnızca güvenli Telegram metodları. Bot hijack vektörlerini (setWebhook,
// getUpdates, deleteWebhook) blok et.
const ALLOWED_METHODS = new Set([
  'sendMessage',
  'sendPhoto',
  'sendDocument',
  'sendMediaGroup',
  'getMe',
]);

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const rawPath = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');
  if (!rawPath || rawPath.includes('..') || rawPath.includes('/')) {
    return jsonResponse({ ok: false, error: 'Geçersiz Telegram method' }, 400);
  }
  if (!ALLOWED_METHODS.has(rawPath)) {
    return jsonResponse({ ok: false, error: `Telegram method '${rawPath}' bu proxy üzerinden çağrılamaz` }, 403);
  }

  if (!env.TELEGRAM_BOT_TOKEN) {
    return jsonResponse({ ok: false, error: 'TELEGRAM_BOT_TOKEN env not set' }, 503);
  }

  const target = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${rawPath}`;

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
      'Cache-Control': 'no-store',
      // CORS: same-origin (wildcard kaldırıldı, #Ö9).
    },
  });
};
