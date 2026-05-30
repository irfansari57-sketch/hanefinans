/**
 * /api/alerts
 *
 * GET  → kullanıcının tüm alarmları (active + triggered hepsi)
 * POST → yeni alarm oluştur (auth + body validation)
 *
 * Body (POST):
 *   {
 *     symbol: string,
 *     assetType: 'stock' | 'fund' | 'crypto' | 'fx',
 *     direction: 'above' | 'below',
 *     threshold: number,
 *     note?: string
 *   }
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

interface AlertRow {
  id: number;
  user_id: number;
  symbol: string;
  asset_type: 'stock' | 'fund' | 'crypto' | 'fx';
  direction: 'above' | 'below';
  threshold: number;
  note: string | null;
  active: 0 | 1;
  triggered_at: number | null;
  trigger_price: number | null;
  last_price: number | null;
  last_checked_at: number | null;
  created_at: number;
}

/**
 * Tier-based alarm kotası — kullanıcı tier'ına göre aktif alarm sayısı sınırı.
 *
 *   free  → 5 aktif alarm (engagement hook — Pro'ya yönlendirir)
 *   pro   → 30 aktif alarm (orta yatırımcı için yeterli)
 *   elite → 100 aktif alarm (profesyonel tarayıcı kullanım)
 *
 * Anon (auth yok) zaten 401 dönüyor → endpoint'e ulaşamıyor.
 */
const TIER_LIMITS = {
  free: 5,
  pro: 30,
  elite: 100,
} as const;

const VALID_ASSET_TYPES = ['stock', 'fund', 'crypto', 'fx'] as const;
const VALID_DIRECTIONS = ['above', 'below'] as const;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  try {
    const rows = await env.DB
      .prepare(
        `SELECT id, user_id, symbol, asset_type, direction, threshold, note, active,
                triggered_at, trigger_price, last_price, last_checked_at, created_at
         FROM price_alerts
         WHERE user_id = ?
         ORDER BY active DESC, created_at DESC
         LIMIT 200`,
      )
      .bind(auth.user.id)
      .all<AlertRow>();

    return jsonResponse({
      ok: true,
      alerts: rows.results ?? [],
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};

interface CreateBody {
  symbol?: string;
  assetType?: string;
  direction?: string;
  threshold?: number;
  note?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz — önce giriş yap' }, 401);

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400);
  }

  const symbol = (body.symbol ?? '').trim().toUpperCase();
  const assetType = (body.assetType ?? '').trim();
  const direction = (body.direction ?? '').trim();
  const threshold = typeof body.threshold === 'number' ? body.threshold : NaN;
  const note = body.note ? body.note.trim().slice(0, 200) : null;

  // Validation
  if (!symbol || symbol.length > 20) {
    return jsonResponse({ ok: false, error: 'symbol zorunlu (max 20 karakter)' }, 400);
  }
  if (!VALID_ASSET_TYPES.includes(assetType as typeof VALID_ASSET_TYPES[number])) {
    return jsonResponse({ ok: false, error: `assetType ${VALID_ASSET_TYPES.join('|')} olmalı` }, 400);
  }
  if (!VALID_DIRECTIONS.includes(direction as typeof VALID_DIRECTIONS[number])) {
    return jsonResponse({ ok: false, error: 'direction "above" veya "below" olmalı' }, 400);
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100_000_000) {
    return jsonResponse({ ok: false, error: 'threshold pozitif sayı olmalı' }, 400);
  }

  // Tier-aware quota check — kullanıcının paketi kadar aktif alarm
  const tier = auth.user.tier ?? 'free';
  const tierLimit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) as c FROM price_alerts WHERE user_id = ? AND active = 1')
    .bind(auth.user.id)
    .first<{ c: number }>();
  const activeCount = countRow?.c ?? 0;
  if (activeCount >= tierLimit) {
    const upgradeMsg =
      tier === 'free'
        ? `Ücretsiz üyelikte max ${tierLimit} aktif alarm. Pro'ya geç, ${TIER_LIMITS.pro} alarm kur.`
        : tier === 'pro'
        ? `Pro üyelikte max ${tierLimit} aktif alarm. Elite'a geç, ${TIER_LIMITS.elite} alarm kur.`
        : `Elite üyelikte max ${tierLimit} aktif alarm. Eski alarmlarını sil.`;
    return jsonResponse({
      ok: false,
      error: upgradeMsg,
      code: 'TIER_QUOTA_EXCEEDED',
      tier,
      limit: tierLimit,
      used: activeCount,
    }, 400);
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    const result = await env.DB
      .prepare(
        `INSERT INTO price_alerts (user_id, symbol, asset_type, direction, threshold, note, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)
         RETURNING id`,
      )
      .bind(auth.user.id, symbol, assetType, direction, threshold, note, now)
      .first<{ id: number }>();

    return jsonResponse({ ok: true, id: result?.id });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};
