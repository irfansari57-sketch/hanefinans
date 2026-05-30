/**
 * POST /api/auth/verify-code
 * Body: { token: string, code: string }
 *
 * Frontend send-code'dan aldığı token + kullanıcının email'inde gördüğü kodu
 * gönderir. Backend HMAC imzasını doğrular + token içindeki kod ile eşleşme
 * kontrolü yapar.
 *
 * Başarılı yanıt: { ok: true, email: string }
 * Frontend bu yanıtta gelen email ile Dexie users tablosunda emailVerified = 1 yapar.
 */

import { verifyToken, jsonResponse, corsPreflightResponse } from './_token';

interface Env {
  AUTH_TOKEN_SECRET?: string;
}

interface VerifyRequest {
  token: string;
  code: string;
}

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

  const payload = await verifyToken(body.token, env.AUTH_TOKEN_SECRET);
  if (!payload) {
    return jsonResponse({ ok: false, error: 'Token geçersiz veya süresi dolmuş — yeni kod iste' }, 401);
  }

  const inputCode = body.code.replace(/\s/g, '');
  if (inputCode !== payload.code) {
    return jsonResponse({ ok: false, error: 'Kod yanlış' }, 401);
  }

  return jsonResponse({ ok: true, email: payload.email });
};

export const onRequestOptions: PagesFunction = async () => corsPreflightResponse();
