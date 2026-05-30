/**
 * POST /api/auth/delete-user
 * Admin only — kullanıcı hesabını siler (admin hesapları korumalı).
 *
 * Body: { userId }
 */

import { type Env, type UserRow, requireAdmin, isAdminEmail, jsonResponse } from './_utils';

interface DeleteRequest {
  userId: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  let body: DeleteRequest;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400); }

  if (!body.userId) return jsonResponse({ ok: false, error: 'userId zorunlu' }, 400);

  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(body.userId).first<UserRow>();
  if (!target) return jsonResponse({ ok: false, error: 'Kullanıcı bulunamadı' }, 404);

  if (isAdminEmail(target.email)) {
    return jsonResponse({ ok: false, error: 'Admin hesapları silinemez' }, 403);
  }

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(body.userId).run();
  return jsonResponse({ ok: true });
};
