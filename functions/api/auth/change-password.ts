/**
 * POST /api/auth/change-password
 * Body: { currentPassword: string, newPassword: string }
 *
 * Authenticated kullanıcı için şifre değişikliği.
 *  1) JWT cookie'den kullanıcıyı al
 *  2) currentPassword'ü hash'leyip DB ile karşılaştır
 *  3) Eşleşirse newPassword'ü hash'leyip update et
 *  4) Aynı oturumda kal (yeni JWT vermeye gerek yok — current cookie geçerli)
 *
 * Güvenlik:
 *  - Eski şifre zorunlu — çalınmış session ile sessiz hijack engellenir.
 *  - Min 8 karakter (#Ö11).
 *  - Generic error mesajı (eski şifre yanlışsa "mevcut şifre yanlış" yine veriyoruz —
 *    kullanıcı zaten login durumda olduğu için enumeration riski yok).
 *  - Rate limit middleware'de auth bucket 10/dk.
 */

import {
  type Env, hashPassword, verifyPassword, jsonResponse, getAuthedUser, bumpTokenVersion, signJwt, makeSessionCookie,
} from './_utils';

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'Servis hazırlanıyor' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'Servis hazırlanıyor' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Oturum açık değil' }, 401);

  let body: ChangePasswordBody;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz istek' }, 400); }

  const currentPassword = body.currentPassword ?? '';
  const newPassword = body.newPassword ?? '';
  if (!currentPassword || !newPassword) {
    return jsonResponse({ ok: false, error: 'Mevcut ve yeni şifre zorunlu' }, 400);
  }
  if (newPassword.length < 8) {
    return jsonResponse({ ok: false, error: 'Yeni şifre en az 8 karakter olmalı' }, 400);
  }
  if (currentPassword === newPassword) {
    return jsonResponse({ ok: false, error: 'Yeni şifre eskisinden farklı olmalı' }, 400);
  }

  const verdict = await verifyPassword(auth.user.email, currentPassword, auth.user.password_hash);
  if (!verdict.ok) {
    return jsonResponse({ ok: false, error: 'Mevcut şifre yanlış' }, 401);
  }

  const newHash = await hashPassword(auth.user.email, newPassword);
  await env.DB
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(newHash, auth.user.id)
    .run();

  // 13 Eki 2026 (P1): diğer cihazlardaki oturumları düşür; bu cihaza yeni token ver.
  const tv = await bumpTokenVersion(env.DB, auth.user.id);
  const token = await signJwt(auth.user.id, auth.user.email, env.AUTH_TOKEN_SECRET!, tv);

  return jsonResponse({ ok: true, sessionsRevoked: true }, 200, {
    'Set-Cookie': makeSessionCookie(token),
  });
};
