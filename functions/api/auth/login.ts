/**
 * POST /api/auth/login
 * Body: { email, password, turnstileToken? }
 *
 * Doğrularsa JWT cookie set eder, public user info döner.
 *
 * Güvenlik:
 *  - Generic error mesajı + dummy hash (#Ö3) — email enumeration ve timing attack savunması
 *  - Per-email rate limit (#Ö4) — IP başına 10/dk + email başına 5/10dk (proxy farm savunması)
 *  - Turnstile (#Ö5) — bot/credential-stuffing savunması (secret yoksa skip)
 */

import {
  type Env, type UserRow, hashPassword, signJwt, makeSessionCookie,
  publicUser, jsonResponse,
} from './_utils';
import { rateLimitCheck, getClientIp } from '../../_rate-limit';
import { verifyTurnstile } from '../../_turnstile';

interface LoginRequest {
  email: string;
  password: string;
  turnstileToken?: string;
}

interface LoginEnv extends Env {
  TURNSTILE_SECRET_KEY?: string;
}

const GENERIC_AUTH_ERROR = 'E-posta veya şifre hatalı';
const DUMMY_PASSWORD = '\x00:::dummy-no-user-timing-balance:::';

export const onRequestPost: PagesFunction<LoginEnv> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'Servis geçici olarak kullanılamıyor' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'Servis geçici olarak kullanılamıyor' }, 503);

  let body: LoginRequest;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz istek' }, 400); }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !password) return jsonResponse({ ok: false, error: GENERIC_AUTH_ERROR }, 401);

  // Turnstile (#Ö5)
  const turnstileOk = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY, getClientIp(request));
  if (!turnstileOk) {
    return jsonResponse({ ok: false, error: 'Bot doğrulaması başarısız. Sayfayı yenileyip tekrar dene.' }, 403);
  }

  // Per-email rate limit (#Ö4) — IP rotasyonu savunması
  const emailLimit = await rateLimitCheck(env.DB, 'auth-email', email, 5, 600);
  if (!emailLimit.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Bu hesap için çok fazla başarısız giriş denemesi. Bir süre sonra tekrar dene.',
        retryAfter: emailLimit.retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Retry-After': String(emailLimit.retryAfter),
        },
      },
    );
  }

  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();

  // Timing balance (#Ö3): kullanıcı yoksa da hash hesapla
  const expectedHash = row?.password_hash ?? '\x00invalid';
  const inputHash = row
    ? await hashPassword(email, password)
    : await hashPassword(email, DUMMY_PASSWORD);

  if (!row || inputHash !== expectedHash) {
    return jsonResponse({ ok: false, error: GENERIC_AUTH_ERROR }, 401);
  }

  const now = Date.now();
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, row.id).run();
  row.last_login_at = now;

  const token = await signJwt(row.id, row.email, env.AUTH_TOKEN_SECRET);
  return jsonResponse({ ok: true, user: publicUser(row) }, 200, {
    'Set-Cookie': makeSessionCookie(token),
  });
};
