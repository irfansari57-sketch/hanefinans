/**
 * /api/portfolio/snapshots
 *
 * GET  → kullanıcının son 1 yıllık (varsayılan) günlük snapshot serisi
 *          → ?days=30 ile son N gün
 * POST → yeni snapshot yaz (client gün sonu manuel tetikleyebilir veya cron)
 *
 * Body (POST):
 *   {
 *     asOf?: string,               // YYYY-MM-DD, default bugün
 *     totalValue: number,
 *     totalCost: number,
 *     totalPnl: number,
 *     totalPnlPct: number,
 *     positionCount?: number,
 *     positions?: Array<{symbol, lot, avgPrice, currentPrice, marketValue}>
 *   }
 *
 * Auth zorunlu.
 * (user_id, as_of) UNIQUE — aynı gün için UPDATE.
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

interface SnapshotRow {
  id: number;
  user_id: string;
  as_of: string;
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_pct: number;
  position_count: number;
  positions_json: string | null;
  created_at: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================================
// GET — history serisi
// ============================================================================
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '365', 10) || 365, 1), 1825);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  try {
    const result = await env.DB
      .prepare(
        `SELECT id, user_id, as_of, total_value, total_cost, total_pnl,
                total_pnl_pct, position_count, positions_json, created_at
         FROM portfolio_snapshots
         WHERE user_id = ? AND as_of >= ?
         ORDER BY as_of ASC
         LIMIT 500`,
      )
      .bind(String(auth.user.id), cutoffISO)
      .all<SnapshotRow>();

    const snapshots = (result.results ?? []).map((r) => ({
      asOf: r.as_of,
      totalValue: r.total_value,
      totalCost: r.total_cost,
      totalPnl: r.total_pnl,
      totalPnlPct: r.total_pnl_pct,
      positionCount: r.position_count,
      createdAt: r.created_at,
    }));

    return jsonResponse({ ok: true, days, count: snapshots.length, snapshots });
  } catch (e) {
    return jsonResponse({
      ok: false,
      error: 'Snapshot okuma hatası',
      detail: (e as Error).message,
    }, 500);
  }
};

// ============================================================================
// POST — snapshot yaz (aynı gün için UPSERT)
// ============================================================================
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  let body: {
    asOf?: string;
    totalValue?: number;
    totalCost?: number;
    totalPnl?: number;
    totalPnlPct?: number;
    positionCount?: number;
    positions?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const asOf = (body.asOf ?? todayISO()).slice(0, 10);
  const totalValue = Number(body.totalValue);
  const totalCost = Number(body.totalCost);
  const totalPnl = Number(body.totalPnl);
  const totalPnlPct = Number(body.totalPnlPct);
  const positionCount = Number(body.positionCount ?? 0);
  const positionsJson = body.positions ? JSON.stringify(body.positions).slice(0, 50_000) : null;

  if (!Number.isFinite(totalValue) || !Number.isFinite(totalCost)) {
    return jsonResponse({ ok: false, error: 'totalValue ve totalCost sayı olmalı' }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return jsonResponse({ ok: false, error: 'asOf formatı YYYY-MM-DD olmalı' }, 400);
  }

  try {
    const now = Date.now();
    // UPSERT: aynı gün için varsa güncelle
    await env.DB
      .prepare(
        `INSERT INTO portfolio_snapshots
           (user_id, as_of, total_value, total_cost, total_pnl, total_pnl_pct,
            position_count, positions_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, as_of) DO UPDATE SET
           total_value = excluded.total_value,
           total_cost = excluded.total_cost,
           total_pnl = excluded.total_pnl,
           total_pnl_pct = excluded.total_pnl_pct,
           position_count = excluded.position_count,
           positions_json = excluded.positions_json,
           created_at = excluded.created_at`,
      )
      .bind(
        String(auth.user.id),
        asOf,
        totalValue,
        totalCost,
        Number.isFinite(totalPnl) ? totalPnl : 0,
        Number.isFinite(totalPnlPct) ? totalPnlPct : 0,
        positionCount,
        positionsJson,
        now,
      )
      .run();

    return jsonResponse({ ok: true, asOf, savedAt: now });
  } catch (e) {
    return jsonResponse({
      ok: false,
      error: 'Snapshot yazma hatası',
      detail: (e as Error).message,
    }, 500);
  }
};
