/**
 * POST /api/auth/verify-code
 * Body: { token: string, code: string }
 *
 * 13 Eki 2026 (P0 güvenlik):
 *   - Token artık kodu taşımıyor; `codeHash` = HMAC(secret, email|nonce|code).
 *     Girilen kodla HMAC yeniden hesaplanır, sabit zamanlı karşılaştırılır.
 *   - Nonce başına deneme sınırı: 5 yanlış denemede token yanar (D1 rate_limits).
 *   - Başarıda, e-posta D1 `users` tablosunda varsa `email_verified=1` yazılır
 *     (önceden sunucuda hiç kalıcı olmuyordu).
 *
 * Başarılı yanıt: { ok: true, email: string, persisted: boolean }
 */

import { verifyToken, hashCode, timingSafeEqual, jsonResponse, corsPreflightResponse, type VerificationPayload } from './_token';
import { rateLimitCheck } from '../../_rate-limit';

interface Env {
  AUTH_TOKEN_SECRET?: string;
  DB?: D1Database;
}

interface VerifyRequest {
  token: string;
  code: string;
}

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_SEC = 15 * 60;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) {
    return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env tanımlı değil' }, 503);
  }

  let body: VerifyRequest;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400);
  }

  if (!body.token || !body.code) {
    return jsonResponse({ ok: false, error: 'token ve code zorunlu' }, 400);
  }

  const payload = await verifyToken<VerificationPayload>(body.token, env.AUTH_TOKEN_SECRET);
  if (!payload || !payload.codeHash || !payload.nonce) {
    return jsonResponse({ ok: false, error: 'Token geçersiz veya süresi dolmuş — yeni kod iste' }, 401);
  }

  // Nonce başına deneme sınırı (D1 varsa). D1 yoksa IP limiti (middleware) tek koruma kalır.
  if (env.DB) {
    try {
      const rl = await rateLimitCheck(env.DB, 'verify-code-attempt', payload.nonce, MAX_ATTEMPTS, ATTEMPT_WINDOW_SEC);
      if (!rl.allowed) {
        return jsonResponse({ ok: false, error: 'Çok fazla yanlış deneme — yeni kod iste' }, 429);
      }
    } catch {
      /* rate_limits tablosu yoksa devam */
    }
  }

  const inputCode = body.code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(inputCode)) {
    return jsonResponse({ ok: false, error: 'Kod 6 haneli olmalı' }, 400);
  }

  const expected = await hashCode(env.AUTH_TOKEN_SECRET, payload.email, payload.nonce, inputCode);
  if (!timingSafeEqual(expected, payload.codeHash)) {
    return jsonResponse({ ok: false, error: 'Kod yanlış' }, 401);
  }

  // Sunucu tarafında kalıcı yap (kullanıcı kaydı varsa)
  let persisted = false;
  if (env.DB) {
    try {
      const r = await env.DB.prepare(
        'UPDATE users SET email_verified = 1, email_verified_at = ? WHERE email = ? AND email_verified = 0',
      )
        .bind(Date.now(), payload.email)
        .run();
      persisted = (r.meta?.changes ?? 0) > 0;
    } catch {
      /* users tablosu / kolon yoksa sessiz */
    }
  }

  return jsonResponse({ ok: true, email: payload.email, persisted });
};

export const onRequestOptions: PagesFunction = async () => corsPreflightResponse();
