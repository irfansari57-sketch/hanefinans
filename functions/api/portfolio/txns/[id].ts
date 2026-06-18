/**
 * /api/portfolio/txns/:id
 *
 * PUT    -> tek bir islemi (txn) guncelle (executedAt, lot, price, note)
 * DELETE -> tek bir islemi sil
 *
 * NOT: Bu endpoint sadece txn kaydini etkiler. Ana pozisyonun (lot/avg_price)
 * yeniden hesaplanmasi frontend'in sorumlulugu - txn degisikligi sonrasi
 * tum txns'leri toplayip position'i PUT eder.
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

interface UpdateBody {
  executedAt?: number;
  lot?: number;
  price?: number;
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

  const executedAt = typeof body.executedAt === 'number' && body.executedAt > 0 ? body.executedAt : null;
  const lot = typeof body.lot === 'number' ? body.lot : null;
  const price = typeof body.price === 'number' ? body.price : null;
  const note = body.note != null ? String(body.note).trim().slice(0, 300) : null;

  if (lot != null && (!Number.isFinite(lot) || lot === 0 || Math.abs(lot) > 1e10)) {
    return jsonResponse({ ok: false, error: 'lot sayisal olmali (0 olamaz)' }, 400);
  }
  if (price != null && (!Number.isFinite(price) || price <= 0 || price > 1e8)) {
    return jsonResponse({ ok: false, error: 'price pozitif olmali' }, 400);
  }

  try {
    // Dinamik SET clausu — verilen alanlar
    const sets: string[] = [];
    const binds: (string | number | null)[] = [];
    if (executedAt != null) { sets.push('executed_at = ?'); binds.push(executedAt); }
    if (lot != null) { sets.push('lot = ?'); binds.push(lot); }
    if (price != null) { sets.push('price = ?'); binds.push(price); }
    if (note !== null || body.note !== undefined) { sets.push('note = ?'); binds.push(note); }
    if (sets.length === 0) return jsonResponse({ ok: false, error: 'Guncellenecek alan yok' }, 400);

    binds.push(id, auth.user.id);
    const result = await env.DB.prepare(
      `UPDATE portfolio_txns SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
    ).bind(...binds).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ ok: false, error: 'Islem bulunamadi' }, 404);
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
    const result = await env.DB.prepare(
      `DELETE FROM portfolio_txns WHERE id = ? AND user_id = ?`,
    ).bind(id, auth.user.id).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ ok: false, error: 'Islem bulunamadi' }, 404);
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};
