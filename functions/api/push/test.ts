/**
 * POST /api/push/test
 *
 * Authenticated kullanıcının TÜM subscription'larına test bildirim gönderir.
 * Body opsiyonel: { title?, body?, url? } — yoksa default metin.
 *
 * 410/404 dönen endpoint'leri DB'den siler.
 *
 * Response:
 *   { ok: true, sent: N, failed: M, expired: K }
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';
import { sendPush, type PushSubscriptionData, type PushVapidEnv } from '../../_push';

interface Env extends AuthEnv, PushVapidEnv {
  DB: D1Database;
}

interface SubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return jsonResponse({ ok: false, error: 'VAPID env tam değil' }, 503);
  }

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  let body: { title?: string; body?: string; url?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* opsiyonel — boş olabilir */
  }

  const payload = JSON.stringify({
    title: (body.title ?? 'InvestliQ — Test Bildirimi').slice(0, 100),
    body: (body.body ?? 'Push bildirimleri çalışıyor! Alarmlar buradan gelecek.').slice(0, 200),
    url: (body.url ?? '/panel').slice(0, 200),
    tag: 'push-test',
  });

  const rows = await env.DB
    .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
    .bind(auth.user.id)
    .all<SubRow>();

  const subs = rows.results ?? [];
  if (subs.length === 0) {
    return jsonResponse({ ok: false, error: 'Bu hesapta kayıtlı push subscription yok. Önce bildirimi aç.' }, 400);
  }

  let sent = 0;
  let failed = 0;
  let expired = 0;
  const expiredEndpoints: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  await Promise.all(
    subs.map(async (sub) => {
      const subData: PushSubscriptionData = {
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
      };
      const r = await sendPush(subData, payload, env, { ttl: 60, urgency: 'normal' });
      if (r.ok) {
        sent++;
        // last_used_at güncelle (best-effort)
        env.DB
          .prepare('UPDATE push_subscriptions SET last_used_at = ?, last_error = NULL, failure_count = 0 WHERE endpoint = ?')
          .bind(now, sub.endpoint)
          .run()
          .catch(() => null);
      } else if (r.expired) {
        expired++;
        expiredEndpoints.push(sub.endpoint);
      } else {
        failed++;
        env.DB
          .prepare('UPDATE push_subscriptions SET last_error = ?, failure_count = failure_count + 1 WHERE endpoint = ?')
          .bind((r.error ?? `HTTP ${r.status}`).slice(0, 200), sub.endpoint)
          .run()
          .catch(() => null);
      }
    }),
  );

  // Expired endpoint'leri sil
  if (expiredEndpoints.length > 0) {
    const placeholders = expiredEndpoints.map(() => '?').join(',');
    await env.DB
      .prepare(`DELETE FROM push_subscriptions WHERE endpoint IN (${placeholders})`)
      .bind(...expiredEndpoints)
      .run()
      .catch(() => null);
  }

  return jsonResponse({ ok: sent > 0, sent, failed, expired, total: subs.length });
};
