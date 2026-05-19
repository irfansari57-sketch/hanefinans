/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Doğrularsa JWT cookie set eder, public user info döner.
 */

import {
  type Env, type UserRow, hashPassword, signJwt, makeSessionCookie,
  publicUser, jsonResponse,
} from './_utils';

interface LoginRequest {
  email: string;
  password: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding (DB) eksik' }, 503);

  let body: LoginRequest;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400); }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !password) return jsonResponse({ ok: false, error: 'E-posta ve şifre zorunlu' }, 400);

  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!row) return jsonResponse({ ok: false, error: 'Bu e-posta ile kayıt yok' }, 401);

  const inputHash = await hashPassword(email, password);
  if (inputHash !== row.password_hash) {
    return jsonResponse({ ok: false, error: 'Şifre yanlış' }, 401);
  }

  // last_login_at güncelle
  const now = Date.now();
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, row.id).run();
  row.last_login_at = now;

  const token = await signJwt(row.id, row.email, env.AUTH_TOKEN_SECRET);
  return jsonResponse({ ok: true, user: publicUser(row) }, 200, {
    'Set-Cookie': makeSessionCookie(token),
  });
};
