/**
 * GET /api/auth/users
 * Admin only — tüm kullanıcıları listeler.
 */

import { type Env, type UserRow, requireAdmin, publicUser, jsonResponse } from './_utils';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  const result = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all<UserRow>();
  const users = (result.results ?? []).map(publicUser);

  return jsonResponse({ ok: true, users, count: users.length });
};
