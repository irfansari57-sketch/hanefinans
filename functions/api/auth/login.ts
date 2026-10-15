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
  type Env, type UserRow, hashPassword, hashPasswordLegacy, verifyPassword, signJwt, makeSessionCookie,
  publicUser, jsonResponse, configurePbkdf2,
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

export const onRequestPost: PagesFunction<LoginEnv> = async (ctx) => {
  // 15 Eki 2026: beklenmeyen hata → Cloudflare HTML hata sayfası yerine JSON.
  try {
    return await handleLogin(ctx);
  } catch (e) {
    console.error('[auth/login] unhandled', (e as Error)?.message);
    return jsonResponse({ ok: false, error: 'Giriş sırasında beklenmeyen bir hata oluştu. Tekrar dene.' }, 500);
  }
};

async function handleLogin({ request, env, waitUntil }: { request: Request; env: LoginEnv; waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'Servis geçici olarak kullanılamıyor' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'Servis geçici olarak kullanılamıyor' }, 503);
  configurePbkdf2(env as { PBKDF2_ITERATIONS?: string });

  let body: LoginRequest;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz istek' }, 400); }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !password) return jsonResponse({ ok: false, error: GENERIC_AUTH_ERROR }, 401);

  // Turnstile (#Ö5)
  const turnstileOk = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY, getClientIp(request), request);
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

  // Timing balance (#Ö3): kullanıcı yoksa da hash hesapla (PBKDF2 maliyeti eşitlensin)
  const verdict = row
    ? await verifyPassword(email, password, row.password_hash)
    // Kullanıcı yoksa: ucuz (SHA-256) zamanlama dengesi — iki PBKDF2 turu CPU bütçesini aşıyordu (15 Eki 2026)
    : await hashPasswordLegacy(email, DUMMY_PASSWORD).then(() => ({ ok: false, needsRehash: false }));

  if (!row || !verdict.ok) {
    return jsonResponse({ ok: false, error: GENERIC_AUTH_ERROR }, 401);
  }

  const now = Date.now();
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, row.id).run();
  row.last_login_at = now;

  const token = await signJwt(row.id, row.email, env.AUTH_TOKEN_SECRET, row.token_version ?? 0);
  const response = jsonResponse({ ok: true, user: publicUser(row) }, 200, {
    'Set-Cookie': makeSessionCookie(token),
  });

  // 13 Eki 2026: legacy SHA-256 → PBKDF2 kademeli taşıma. 15 Eki: yanıtı BEKLETMEZ
  // (waitUntil) — başarısız olursa kullanıcı yine giriş yapmış olur, eski hash kalır.
  if (verdict.needsRehash) {
    const uid = row.id;
    waitUntil((async () => {
      try {
        const newHash = await hashPassword(email, password);
        await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, uid).run();
      } catch (e) {
        console.warn('[auth/login] rehash skipped', (e as Error)?.message);
      }
    })());
  }
  return response;
}
