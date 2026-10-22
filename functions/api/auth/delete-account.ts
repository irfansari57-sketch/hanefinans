/**
 * POST /api/auth/delete-account
 * Body: { password }
 *
 * Kullanıcı kendi hesabını siler. Şifre doğrulaması yapılır (admin token bypass yok —
 * kendisi onaylamalı). Admin hesapları silinmez.
 * Başarıyla silinirse session cookie de temizlenir.
 */

import {
  type Env, getAuthedUser, verifyPassword, isAdminEmail,
  clearSessionCookie, jsonResponse,
} from './_utils';

interface DeleteAccountRequest {
  password?: string;
  /** OAuth (şifresiz) hesaplar için onay kelimesi: "SIL" */
  confirm?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  let body: DeleteAccountRequest;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400); }

  if (!body.password && !body.confirm) return jsonResponse({ ok: false, error: 'Şifre (veya OAuth için confirm) zorunlu' }, 400);

  // Admin hesapları self-delete edemez (data integrity)
  if (isAdminEmail(auth.user.email)) {
    return jsonResponse({ ok: false, error: 'Admin hesapları silinemez' }, 403);
  }

  // Şifre doğrulama. OAuth kullanıcısının (password_hash='') şifresi yok →
  // body.confirm === 'SIL' ile onay (13 Eki 2026: OAuth hesapları silinemiyordu, KVKK m.7).
  const isOAuthUser = !auth.user.password_hash;
  if (isOAuthUser) {
    if (body.confirm !== 'SIL') {
      return jsonResponse({ ok: false, error: 'Onay için confirm alanına "SIL" yaz', code: 'OAUTH_CONFIRM_REQUIRED' }, 400);
    }
  } else {
    const verdict = await verifyPassword(auth.user.email, body.password, auth.user.password_hash);
    if (!verdict.ok) {
      return jsonResponse({ ok: false, error: 'Şifre yanlış' }, 401);
    }
  }

  // 13 Eki 2026 (P1, KVKK m.7): users dışındaki tüm kişisel veri tabloları da silinir.
  // users'a FK yok → elle. Tablo yoksa (migration eksik) o satır atlanır.
  const uid = auth.user.id;
  const tables = [
    'portfolio_txns',          // positions'tan önce (FK CASCADE var ama garanti)
    'portfolio_positions',
    'portfolio_snapshots',
    'portfolio_health_scores',
    'price_alerts',
    'rule_alerts',             // 22 Eki 2026: kural alarmları (denetim bulgusu)
    'push_subscriptions',
    'predictions',
    'user_watchlist',
    'user_streaks',
    'deep_analyses',
    'telemetry_events',
  ];
  const deleted: Record<string, number> = {};
  for (const t of tables) {
    try {
      const r = await env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(uid).run();
      deleted[t] = r.meta?.changes ?? 0;
    } catch { /* tablo/kolon yok */ }
  }
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid).run();
  deleted.users = 1;

  return jsonResponse({ ok: true, deleted }, 200, {
    'Set-Cookie': clearSessionCookie(),
  });
};
