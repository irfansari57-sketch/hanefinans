/**
 * /api/alerts/rules/[id]
 *
 * DELETE → kullanıcı kendi kural alarmını siler
 * PATCH  → { active: boolean } — duraklat / devam ettir
 *
 * Auth zorunlu; başkasının kaydı → 404 (varlık sızdırılmaz).
 * Not: /api/alerts/[id] (fiyat alarmı) ile çakışmaz — Pages statik segment 'rules'
 * dinamik [id]'den önceliklidir.
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

const MIGRATION_HINT = 'rule_alerts tablosu yok → npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/021_rule_alerts.sql';

function dbError(e: unknown): Response {
  const msg = (e as Error).message ?? String(e);
  if (/no such table/i.test(msg)) {
    return jsonResponse({ ok: false, error: 'Kural alarmları tablosu henüz kurulmadı', hint: MIGRATION_HINT }, 503);
  }
  return jsonResponse({ ok: false, error: `DB: ${msg.slice(0, 100)}` }, 500);
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
  if (!id) return jsonResponse({ ok: false, error: 'Geçersiz id' }, 400);

  try {
    const result = await env.DB
      .prepare('DELETE FROM rule_alerts WHERE id = ? AND user_id = ?')
      .bind(id, auth.user.id)
      .run();
    if ((result.meta?.changes ?? 0) === 0) return jsonResponse({ ok: false, error: 'Kural alarmı bulunamadı' }, 404);
    return jsonResponse({ ok: true });
  } catch (e) {
    return dbError(e);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);
  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);
  const id = parseId(params as Record<string, string | string[]>);
  if (!id) return jsonResponse({ ok: false, error: 'Geçersiz id' }, 400);

  let body: { active?: unknown } = {};
  try { body = await request.json(); } catch { /* boş body → toggle */ }

  try {
    const row = await env.DB
      .prepare('SELECT active FROM rule_alerts WHERE id = ? AND user_id = ?')
      .bind(id, auth.user.id)
      .first<{ active: 0 | 1 }>();
    if (!row) return jsonResponse({ ok: false, error: 'Kural alarmı bulunamadı' }, 404);

    const nextActive: 0 | 1 = typeof body.active === 'boolean' ? (body.active ? 1 : 0) : row.active === 1 ? 0 : 1;
    await env.DB
      .prepare('UPDATE rule_alerts SET active = ? WHERE id = ? AND user_id = ?')
      .bind(nextActive, id, auth.user.id)
      .run();
    return jsonResponse({ ok: true, active: nextActive });
  } catch (e) {
    return dbError(e);
  }
};
