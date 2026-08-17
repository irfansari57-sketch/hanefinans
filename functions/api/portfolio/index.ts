/**
 * /api/portfolio/positions
 *
 * GET  → kullanıcının tüm pozisyonları + işlem geçmişi
 * POST → yeni pozisyon ekle (veya mevcut sembol varsa ağırlıklı ortalama ile güncelle)
 *
 * Body (POST):
 *   {
 *     kind: 'stock' | 'fund',
 *     symbol: string,
 *     lot: number,
 *     avgPrice: number,
 *     note?: string,
 *     executedAt?: number  // İslem tarihi (timestamp), default now
 *   }
 *
 * Auth zorunlu. Anon kullanıcı 401 alır → frontend Dexie'ye düşer.
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

interface PositionRow {
  id: number;
  user_id: number;
  kind: 'stock' | 'fund';
  symbol: string;
  lot: number;
  avg_price: number;
  note: string | null;
  added_at: number;
  updated_at: number;
}

interface TxnRow {
  id: number;
  position_id: number;
  user_id: number;
  kind: 'stock' | 'fund';
  symbol: string;
  lot: number;
  price: number;
  executed_at: number;
  note: string | null;
  created_at: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  try {
    const [positions, txns] = await Promise.all([
      env.DB.prepare(
        `SELECT id, user_id, kind, symbol, lot, avg_price, note, added_at, updated_at
         FROM portfolio_positions
         WHERE user_id = ?
         ORDER BY added_at DESC
         LIMIT 500`,
      ).bind(auth.user.id).all<PositionRow>(),
      env.DB.prepare(
        `SELECT id, position_id, user_id, kind, symbol, lot, price, executed_at, note, created_at
         FROM portfolio_txns
         WHERE user_id = ?
         ORDER BY executed_at DESC
         LIMIT 2000`,
      ).bind(auth.user.id).all<TxnRow>(),
    ]);

    return jsonResponse({
      ok: true,
      positions: positions.results ?? [],
      txns: txns.results ?? [],
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};

interface CreateBody {
  kind?: string;
  symbol?: string;
  lot?: number;
  avgPrice?: number;
  note?: string;
  executedAt?: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz - once giris yap' }, 401);

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Gecersiz JSON' }, 400);
  }

  const kind = (body.kind ?? '').trim();
  const symbol = (body.symbol ?? '').trim().toUpperCase();
  const lot = typeof body.lot === 'number' ? body.lot : NaN;
  const avgPrice = typeof body.avgPrice === 'number' ? body.avgPrice : NaN;
  const note = body.note ? body.note.trim().slice(0, 300) : null;
  const executedAt = typeof body.executedAt === 'number' && body.executedAt > 0
    ? body.executedAt
    : Date.now();

  if (kind !== 'stock' && kind !== 'fund') {
    return jsonResponse({ ok: false, error: "kind 'stock' veya 'fund' olmalı" }, 400);
  }
  if (!symbol || symbol.length > 20) {
    return jsonResponse({ ok: false, error: 'symbol zorunlu (max 20 karakter)' }, 400);
  }
  if (!Number.isFinite(lot) || lot <= 0 || lot > 1e10) {
    return jsonResponse({ ok: false, error: 'lot pozitif sayi olmali' }, 400);
  }
  if (!Number.isFinite(avgPrice) || avgPrice <= 0 || avgPrice > 1e8) {
    return jsonResponse({ ok: false, error: 'avgPrice pozitif sayi olmali' }, 400);
  }

  const now = Date.now();
  try {
    // Mevcut pozisyon varsa: agirlikli ortalama
    const existing = await env.DB.prepare(
      `SELECT id, lot, avg_price FROM portfolio_positions WHERE user_id = ? AND kind = ? AND symbol = ? LIMIT 1`,
    ).bind(auth.user.id, kind, symbol).first<{ id: number; lot: number; avg_price: number }>();

    let positionId: number;
    if (existing) {
      const totalLot = existing.lot + lot;
      const weightedAvg = (existing.lot * existing.avg_price + lot * avgPrice) / totalLot;
      await env.DB.prepare(
        `UPDATE portfolio_positions SET lot = ?, avg_price = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?`,
      ).bind(totalLot, weightedAvg, note, now, existing.id).run();
      positionId = existing.id;
    } else {
      const inserted = await env.DB.prepare(
        `INSERT INTO portfolio_positions (user_id, kind, symbol, lot, avg_price, note, added_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
      ).bind(auth.user.id, kind, symbol, lot, avgPrice, note, now, now).first<{ id: number }>();
      if (!inserted) throw new Error('Insert basarisiz');
      positionId = inserted.id;
    }

    // Transaction kaydet (gecmis icin)
    await env.DB.prepare(
      `INSERT INTO portfolio_txns (position_id, user_id, kind, symbol, lot, price, executed_at, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(positionId, auth.user.id, kind, symbol, lot, avgPrice, executedAt, note, now).run();

    return jsonResponse({ ok: true, positionId });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};
