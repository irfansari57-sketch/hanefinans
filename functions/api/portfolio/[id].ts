/**
 * /api/portfolio/positions/:id
 *
 * PUT    → pozisyon güncelle (lot, avgPrice, note)
 * DELETE → pozisyon sil (CASCADE: işlem geçmişi de silinir)
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

interface UpdateBody {
  lot?: number;
  avgPrice?: number;
  note?: string;
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  const id = parseInt(String(params.id), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonResponse({ ok: false, error: 'Gecersiz id' }, 400);
  }

  let body: UpdateBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Gecersiz JSON' }, 400);
  }

  const lot = typeof body.lot === 'number' ? body.lot : NaN;
  const avgPrice = typeof body.avgPrice === 'number' ? body.avgPrice : NaN;
  const note = body.note != null ? String(body.note).trim().slice(0, 300) : null;

  if (!Number.isFinite(lot) || lot <= 0 || lot > 1e10) {
    return jsonResponse({ ok: false, error: 'lot pozitif sayi olmali' }, 400);
  }
  if (!Number.isFinite(avgPrice) || avgPrice <= 0 || avgPrice > 1e8) {
    return jsonResponse({ ok: false, error: 'avgPrice pozitif sayi olmali' }, 400);
  }

  try {
    const result = await env.DB.prepare(
      `UPDATE portfolio_positions SET lot = ?, avg_price = ?, note = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).bind(lot, avgPrice, note, Date.now(), id, auth.user.id).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ ok: false, error: 'Pozisyon bulunamadi' }, 404);
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  const id = parseInt(String(params.id), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonResponse({ ok: false, error: 'Gecersiz id' }, 400);
  }

  try {
    // CASCADE delete (txns FK ile silinir)
    const result = await env.DB.prepare(
      `DELETE FROM portfolio_positions WHERE id = ? AND user_id = ?`,
    ).bind(id, auth.user.id).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ ok: false, error: 'Pozisyon bulunamadi' }, 404);
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};
