/**
 * /api/alerts/[id]
 *
 * DELETE → kullanıcı kendi alarmını siler
 * POST   → toggle active (re-enable / disable)
 *
 * Auth zorunlu; user_id mismatch → 403.
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

interface AlertRow {
  user_id: number;
  active: 0 | 1;
}

function parseId(params: Record<string, string | string[]>): number | null {
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const n = parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  const id = parseId(params as Record<string, string | string[]>);
  if (!id) return jsonResponse({ ok: false, error: 'Geçersiz alarm id' }, 400);

  try {
    // Sadece kendi alarmını silebilir
    const result = await env.DB
      .prepare('DELETE FROM price_alerts WHERE id = ? AND user_id = ?')
      .bind(id, auth.user.id)
      .run();
    const changes = result.meta?.changes ?? 0;
    if (changes === 0) {
      return jsonResponse({ ok: false, error: 'Alarm bulunamadı' }, 404);
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  const id = parseId(params as Record<string, string | string[]>);
  if (!id) return jsonResponse({ ok: false, error: 'Geçersiz alarm id' }, 400);

  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body opsiyonel
  }
  const action = (body.action ?? '').trim();

  try {
    const row = await env.DB
      .prepare('SELECT user_id, active FROM price_alerts WHERE id = ?')
      .bind(id)
      .first<AlertRow>();
    if (!row) return jsonResponse({ ok: false, error: 'Alarm bulunamadı' }, 404);
    if (row.user_id !== auth.user.id) {
      return jsonResponse({ ok: false, error: 'Yetkisiz erişim' }, 403);
    }

    let nextActive: 0 | 1;
    if (action === 'enable') nextActive = 1;
    else if (action === 'disable') nextActive = 0;
    else nextActive = row.active === 1 ? 0 : 1; // toggle

    await env.DB
      .prepare(
        nextActive === 1
          ? 'UPDATE price_alerts SET active = 1, triggered_at = NULL, trigger_price = NULL WHERE id = ?'
          : 'UPDATE price_alerts SET active = 0 WHERE id = ?',
      )
      .bind(id)
      .run();
    return jsonResponse({ ok: true, active: nextActive });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};
