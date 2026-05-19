/**
 * POST /api/auth/signup
 * Body: { email, password, name? }
 *
 * Yeni kullanıcı oluşturur, JWT cookie set eder.
 */

import {
  type Env, type UserRow, hashPassword, signJwt, makeSessionCookie,
  publicUser, isAdminEmail, randomColor, jsonResponse,
} from './_utils';

interface SignupRequest {
  email: string;
  password: string;
  name?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding (DB) eksik — Pages Functions binding ekle' }, 503);

  let body: SignupRequest;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400); }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ ok: false, error: 'Geçerli bir e-posta gir' }, 400);
  }
  if (password.length < 6) {
    return jsonResponse({ ok: false, error: 'Şifre en az 6 karakter olmalı' }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return jsonResponse({ ok: false, error: 'Bu e-posta zaten kayıtlı. Giriş yap.' }, 409);
  }

  const passwordHash = await hashPassword(email, password);
  const now = Date.now();
  const isAdmin = isAdminEmail(email);

  const insertResult = await env.DB.prepare(`
    INSERT INTO users (email, name, password_hash, tier, email_verified, email_verified_at,
                       avatar_color, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    email,
    body.name?.trim() || null,
    passwordHash,
    isAdmin ? 'elite' : 'free',  // admin'ler otomatik elite
    isAdmin ? 1 : 0,             // admin'ler otomatik verified
    isAdmin ? now : null,
    randomColor(email),
    now,
    now,
  ).run();

  const userId = insertResult.meta.last_row_id as number;
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>();
  if (!row) return jsonResponse({ ok: false, error: 'Kayıt sonrası okuma başarısız' }, 500);

  const token = await signJwt(userId, email, env.AUTH_TOKEN_SECRET);
  return jsonResponse({ ok: true, user: publicUser(row) }, 200, {
    'Set-Cookie': makeSessionCookie(token),
  });
};
