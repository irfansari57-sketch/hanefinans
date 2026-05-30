/**
 * GET /api/predictions/today
 *
 * Bugün için açık tahmin slotlarını + kullanıcının önceki tahminlerini döner.
 *   - Açık slotlar: BIST 100, BIST 30 (bugünün tarihi)
 *   - Kullanıcının bugün verdiği tahminler
 *   - Son 30 günkü kullanıcı tahminleri (geçmiş + sonuç)
 *
 * Anonim → ok:true ama userPredictions boş
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

interface PredRow {
  id: number;
  asset: 'BIST100' | 'BIST30';
  date: string;
  prediction: 'strongUp' | 'up' | 'flat' | 'down' | 'strongDown';
  base_value: number | null;
  actual_change_pct: number | null;
  actual_bucket: string | null;
  points_earned: number | null;
  resolved_at: number | null;
}

function todayInIstanbul(): string {
  const nowMs = Date.now();
  const istMs = nowMs + 3 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const today = todayInIstanbul();
  const auth = await getAuthedUser(request, env).catch(() => null);

  const slots = [
    { asset: 'BIST100' as const, date: today, label: 'BIST 100' },
    { asset: 'BIST30' as const, date: today, label: 'BIST 30' },
  ];

  if (!auth) {
    return jsonResponse({
      ok: true,
      slots,
      userPredictions: [],
      userStats: { totalPoints: 0, correctCount: 0, totalCount: 0 },
      anon: true,
    });
  }

  try {
    const rows = await env.DB
      .prepare(
        `SELECT id, asset, date, prediction, base_value, actual_change_pct, actual_bucket, points_earned, resolved_at
         FROM predictions
         WHERE user_id = ?
         ORDER BY date DESC, id DESC
         LIMIT 60`,
      )
      .bind(auth.user.id)
      .all<PredRow>();

    const preds = rows.results ?? [];

    // Toplam istatistikler
    let totalPoints = 0;
    let correctCount = 0;
    let totalCount = 0;
    for (const p of preds) {
      if (p.resolved_at != null) {
        totalCount++;
        totalPoints += p.points_earned ?? 0;
        if ((p.points_earned ?? 0) >= 10) correctCount++;
      }
    }

    return jsonResponse({
      ok: true,
      slots,
      userPredictions: preds,
      userStats: { totalPoints, correctCount, totalCount },
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};
