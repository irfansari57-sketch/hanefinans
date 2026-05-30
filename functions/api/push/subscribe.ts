/**
 * POST /api/push/subscribe
 *
 * Browser'dan gelen PushSubscription objesini D1'e kaydet.
 * Aynı endpoint ikinci kez gelirse upsert: user_id güncellenir, last_used_at reset.
 *
 * Body: {
 *   endpoint: string,
 *   keys: { p256dh: string, auth: string },
 *   userAgent?: string
 * }
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

interface RequestBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  userAgent?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz — önce giriş yap' }, 401);

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400);
  }

  const endpoint = (body.endpoint ?? '').trim();
  const p256dh = (body.keys?.p256dh ?? '').trim();
  const authSecret = (body.keys?.auth ?? '').trim();

  if (!endpoint || !p256dh || !authSecret) {
    return jsonResponse({ ok: false, error: 'endpoint + keys.p256dh + keys.auth zorunlu' }, 400);
  }
  if (!endpoint.startsWith('https://')) {
    return jsonResponse({ ok: false, error: 'endpoint HTTPS olmalı' }, 400);
  }

  const userAgent = (body.userAgent ?? request.headers.get('user-agent') ?? '').slice(0, 200);
  const now = Math.floor(Date.now() / 1000);

  try {
    // Upsert: aynı endpoint zaten varsa user_id güncelle (aynı tarayıcı başka hesaba geçmiş olabilir)
    await env.DB
      .prepare(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at, last_used_at, failure_count)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 0)
         ON CONFLICT(endpoint) DO UPDATE SET
           user_id = excluded.user_id,
           p256dh = excluded.p256dh,
           auth = excluded.auth,
           user_agent = excluded.user_agent,
           last_used_at = NULL,
           last_error = NULL,
           failure_count = 0`,
      )
      .bind(auth.user.id, endpoint, p256dh, authSecret, userAgent, now)
      .run();
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse(
      { ok: false, error: `DB error: ${(e as Error).message.slice(0, 100)}` },
      500,
    );
  }
};
