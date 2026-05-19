/**
 * POST /api/auth/update-user
 * Admin only — kullanıcının tier'ını / expiry'sini / email_verified'ini değiştirir.
 *
 * Body: { userId, tier?, tierExpiresAt? (ms), emailVerified? (boolean) }
 */

import { type Env, type UserRow, requireAdmin, publicUser, jsonResponse } from './_utils';

interface UpdateRequest {
  userId: number;
  tier?: 'free' | 'pro' | 'elite';
  tierExpiresAt?: number | null;
  emailVerified?: boolean;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  let body: UpdateRequest;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400); }

  if (!body.userId) return jsonResponse({ ok: false, error: 'userId zorunlu' }, 400);

  // Mevcut user
  const existing = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(body.userId).first<UserRow>();
  if (!existing) return jsonResponse({ ok: false, error: 'Kullanıcı bulunamadı' }, 404);

  // Update statement dinamik
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (body.tier !== undefined) {
    if (!['free', 'pro', 'elite'].includes(body.tier)) {
      return jsonResponse({ ok: false, error: 'Geçersiz tier' }, 400);
    }
    updates.push('tier = ?');
    params.push(body.tier);
    // tier free olunca expiry temizle
    if (body.tier === 'free') {
      updates.push('tier_expires_at = NULL');
    }
  }
  if (body.tierExpiresAt !== undefined) {
    updates.push('tier_expires_at = ?');
    params.push(body.tierExpiresAt);
  }
  if (body.emailVerified !== undefined) {
    updates.push('email_verified = ?');
    params.push(body.emailVerified ? 1 : 0);
    updates.push('email_verified_at = ?');
    params.push(body.emailVerified ? Date.now() : null);
  }

  if (updates.length === 0) {
    return jsonResponse({ ok: false, error: 'Güncellenecek alan yok' }, 400);
  }

  params.push(body.userId);
  await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(body.userId).first<UserRow>();
  if (!updated) return jsonResponse({ ok: false, error: 'Update sonrası okuma başarısız' }, 500);

  return jsonResponse({ ok: true, user: publicUser(updated) });
};
