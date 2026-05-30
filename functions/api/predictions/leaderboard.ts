/**
 * GET /api/predictions/leaderboard?period=week|month|all
 *
 * En çok puan kazanan kullanıcıları döner (top 20).
 * Period:
 *   - week: son 7 günlük puanlar
 *   - month: son 30 günlük puanlar
 *   - all: tüm zamanlar (default)
 *
 * Anonymous-friendly — auth gerekmez (public leaderboard).
 * Email anonymize edilir: "İ. S. (irfan***@gmail.com)" yerine sadece name + maskeli email.
 */

interface Env {
  DB: D1Database;
}

interface LeaderRow {
  user_id: number;
  email: string;
  name: string | null;
  tier: 'free' | 'pro' | 'elite';
  total_points: number;
  correct_count: number;
  total_count: number;
}

function maskName(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0].toUpperCase()}. ${parts[parts.length - 1]}`;
    }
    return parts[0];
  }
  // Email'den fallback: "irfansari57@gmail.com" → "irfan***"
  const at = email.indexOf('@');
  if (at < 0) return 'Anonim';
  const u = email.slice(0, at);
  if (u.length <= 4) return `${u[0]}***`;
  return `${u.slice(0, 4)}***`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 binding eksik' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  const url = new URL(request.url);
  const period = (url.searchParams.get('period') ?? 'all') as 'week' | 'month' | 'all';

  let dateFilter = '';
  let bindArgs: unknown[] = [];

  if (period === 'week' || period === 'month') {
    const days = period === 'week' ? 7 : 30;
    const cutoffMs = Date.now() - days * 86_400_000;
    const cutoffStr = new Date(cutoffMs).toISOString().slice(0, 10);
    dateFilter = 'AND p.date >= ?';
    bindArgs = [cutoffStr];
  }

  try {
    const stmt = `
      SELECT
        u.id AS user_id,
        u.email,
        u.name,
        u.tier,
        COALESCE(SUM(p.points_earned), 0) AS total_points,
        COUNT(CASE WHEN p.points_earned >= 10 THEN 1 END) AS correct_count,
        COUNT(p.id) AS total_count
      FROM users u
      JOIN predictions p ON p.user_id = u.id
      WHERE p.resolved_at IS NOT NULL ${dateFilter}
      GROUP BY u.id
      HAVING total_points != 0 OR total_count > 0
      ORDER BY total_points DESC, total_count ASC
      LIMIT 20
    `;
    const rows = await env.DB.prepare(stmt).bind(...bindArgs).all<LeaderRow>();
    const list = (rows.results ?? []).map((r, i) => ({
      rank: i + 1,
      name: maskName(r.name, r.email),
      tier: r.tier,
      totalPoints: r.total_points,
      correctCount: r.correct_count,
      totalCount: r.total_count,
      accuracy: r.total_count > 0 ? Math.round((r.correct_count / r.total_count) * 100) : 0,
    }));
    return new Response(JSON.stringify({ ok: true, period, list }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
