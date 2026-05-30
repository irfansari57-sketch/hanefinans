/**
 * POST /api/auth/signup
 * Body: { email, password, name? }
 *
 * Yeni kullanıcı oluşturur, JWT cookie set eder.
 */

import {
  type Env, type UserRow, hashPassword, signJwt, makeSessionCookie,
  publicUser, randomColor, jsonResponse,
} from './_utils';
import { verifyTurnstile } from '../../_turnstile';
import { getClientIp } from '../../_rate-limit';

interface SignupRequest {
  email: string;
  password: string;
  name?: string;
  turnstileToken?: string;
}

interface SignupEnv extends Env {
  TURNSTILE_SECRET_KEY?: string;
}

export const onRequestPost: PagesFunction<SignupEnv> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding (DB) eksik — Pages Functions binding ekle' }, 503);

  let body: SignupRequest;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400); }

  // Turnstile (#Ö5) — bot/spam savunması. Secret yoksa skip.
  const turnstileOk = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY, getClientIp(request));
  if (!turnstileOk) {
    return jsonResponse({ ok: false, error: 'Bot doğrulaması başarısız. Sayfayı yenileyip tekrar dene.' }, 403);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ ok: false, error: 'Geçerli bir e-posta gir' }, 400);
  }
  if (password.length < 8) {
    return jsonResponse({ ok: false, error: 'Şifre en az 8 karakter olmalı' }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return jsonResponse({ ok: false, error: 'Bu e-posta zaten kayıtlı. Giriş yap.' }, 409);
  }

  const passwordHash = await hashPassword(email, password);
  const now = Date.now();

  // Güvenlik (#Ö2): Signup hiçbir zaman otomatik admin/elite atamaz.
  // Eski davranış (isAdminEmail auto-grant) kaldırıldı — DB sıfırlanmış state'te
  // saldırgan admin email'iyle kayıt olup yetki kazanabilirdi.
  // Admin atama yalnızca elle SQL ile yapılır. Migration 002 hardcoded admin'leri işaretledi.

  const insertResult = await env.DB.prepare(`
    INSERT INTO users (email, name, password_hash, tier, email_verified, email_verified_at,
                       avatar_color, is_admin, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    email,
    body.name?.trim() || null,
    passwordHash,
    'free',                       // default tier — admin/elite SADECE manuel SQL ile
    0,                            // email_verified=0 — send-code/verify ile aktifleşir
    null,                         // email_verified_at
    randomColor(email),
    0,                            // is_admin=0 — manuel SQL gerekli
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
