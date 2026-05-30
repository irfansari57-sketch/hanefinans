/**
 * POST /api/push/unsubscribe
 *
 * Body: { endpoint: string }
 *
 * Endpoint'le subscription'ı sil. Auth optional ama varsa user_id ile match
 * kontrol edilir (başkasının subscription'ını silemezsin).
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  let body: { endpoint?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400);
  }

  const endpoint = (body.endpoint ?? '').trim();
  if (!endpoint) return jsonResponse({ ok: false, error: 'endpoint zorunlu' }, 400);

  const auth = await getAuthedUser(request, env).catch(() => null);

  try {
    if (auth) {
      // Auth varsa sadece kendi sub'unu silebilir
      await env.DB
        .prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
        .bind(endpoint, auth.user.id)
        .run();
    } else {
      // Auth yoksa endpoint match yeterli — pratikte sadece kendi browser'ı bilir
      await env.DB
        .prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
        .bind(endpoint)
        .run();
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse(
      { ok: false, error: `DB error: ${(e as Error).message.slice(0, 100)}` },
      500,
    );
  }
};
