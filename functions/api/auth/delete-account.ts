/**
 * POST /api/auth/delete-account
 * Body: { password }
 *
 * Kullanıcı kendi hesabını siler. Şifre doğrulaması yapılır (admin token bypass yok —
 * kendisi onaylamalı). Admin hesapları silinmez.
 * Başarıyla silinirse session cookie de temizlenir.
 */

import {
  type Env, type UserRow, getAuthedUser, hashPassword, isAdminEmail,
  clearSessionCookie, jsonResponse,
} from './_utils';

interface DeleteAccountRequest {
  password: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  let body: DeleteAccountRequest;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400); }

  if (!body.password) return jsonResponse({ ok: false, error: 'Şifre zorunlu' }, 400);

  // Admin hesapları self-delete edemez (data integrity)
  if (isAdminEmail(auth.user.email)) {
    return jsonResponse({ ok: false, error: 'Admin hesapları silinemez' }, 403);
  }

  // Şifre doğrulama
  const inputHash = await hashPassword(auth.user.email, body.password);
  if (inputHash !== auth.user.password_hash) {
    return jsonResponse({ ok: false, error: 'Şifre yanlış' }, 401);
  }

  // Sil
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(auth.user.id).run();

  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': clearSessionCookie(),
  });
};
