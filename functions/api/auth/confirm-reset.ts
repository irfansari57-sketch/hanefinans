/**
 * POST /api/auth/confirm-reset
 * Body: { token: string, newPassword: string }
 *
 * Şifre sıfırlama akışı — adım 2.
 *  1) Token verify (HMAC, exp, purpose='reset-password')
 *  2) Yeni şifreyi hash'le ve DB'ye yaz
 *  3) JWT cookie set et — kullanıcı otomatik login
 *
 * Güvenlik (13 Eki 2026 güncellemesi):
 *  - Token tek kullanımlık: nonce başına 1 hak (rate_limits, 30 dk) → replay yok.
 *  - Şifre kuralı: min 8 karakter (#Ö11)
 *  - Hash: PBKDF2-HMAC-SHA256 (210k iter, salt) — bkz. _utils.hashPassword
 *  - token_version artar → diğer cihazlardaki oturumlar düşer.
 */

import { verifyToken, corsPreflightResponse, type ResetPayload } from './_token';
import {
  type Env, type UserRow, hashPassword, signJwt, makeSessionCookie, publicUser, jsonResponse, bumpTokenVersion,
} from './_utils';
import { rateLimitCheck } from '../../_rate-limit';

interface ConfirmResetBody {
  token: string;
  newPassword: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'Servis hazırlanıyor' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'Servis hazırlanıyor' }, 503);

  let body: ConfirmResetBody;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz istek' }, 400); }

  const token = (body.token ?? '').trim();
  const newPassword = body.newPassword ?? '';
  if (!token) return jsonResponse({ ok: false, error: 'Token eksik' }, 400);
  if (newPassword.length < 8) {
    return jsonResponse({ ok: false, error: 'Şifre en az 8 karakter olmalı' }, 400);
  }

  const payload = await verifyToken<ResetPayload>(token, env.AUTH_TOKEN_SECRET);
  if (!payload) {
    return jsonResponse({ ok: false, error: 'Bağlantı geçersiz veya süresi dolmuş' }, 401);
  }
  // Purpose zorunlu — email-verify token'ı buraya gönderilirse reject
  if (payload.purpose !== 'reset-password') {
    return jsonResponse({ ok: false, error: 'Bağlantı geçersiz' }, 401);
  }

  const email = payload.email.trim().toLowerCase();
  const row = await env.DB
    .prepare('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>();

  if (!row) {
    // Token geçerli ama kullanıcı silindi → 410 Gone
    return jsonResponse({ ok: false, error: 'Hesap bulunamadı' }, 410);
  }

  // 13 Eki 2026 (P1): tek kullanımlık token — nonce başına 1 hak (rate_limits tablosu, 30 dk pencere).
  // Replay: aynı bağlantı ikinci kez kullanılırsa reddedilir.
  try {
    const once = await rateLimitCheck(env.DB, 'reset-token-use', payload.nonce, 1, 30 * 60);
    if (!once.allowed) {
      return jsonResponse({ ok: false, error: 'Bu bağlantı zaten kullanıldı — yeni sıfırlama iste' }, 401);
    }
  } catch { /* rate_limits yoksa devam */ }

  const newHash = await hashPassword(email, newPassword);
  const now = Date.now();
  await env.DB
    .prepare('UPDATE users SET password_hash = ?, last_login_at = ? WHERE id = ?')
    .bind(newHash, now, row.id)
    .run();

  // Tüm mevcut oturumları düşür (şifre sıfırlandı), bu cihaza yeni token ver.
  const tv = await bumpTokenVersion(env.DB, row.id);

  // Otomatik login — yeni JWT cookie
  row.password_hash = newHash;
  row.last_login_at = now;
  const jwt = await signJwt(row.id, row.email, env.AUTH_TOKEN_SECRET, tv);

  return jsonResponse({ ok: true, user: publicUser(row) }, 200, {
    'Set-Cookie': makeSessionCookie(jwt),
  });
};

export const onRequestOptions: PagesFunction = async () => corsPreflightResponse();
