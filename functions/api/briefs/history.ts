/**
 * GET /api/briefs/history?limit=30
 *
 * Son N brief'i listeler (default 30, max 90). user_id=0 global.
 * Content_md DAHIL DEĞIL — sadece liste için tarih + ozet.
 *
 * Response: { ok, briefs: [{ date, generated_at, preview }] }
 */

interface Env {
  DB?: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get('limit') ?? '30', 10);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 30, 1), 90);

  const rows = await env.DB
    .prepare(`SELECT brief_date, content_md, generated_at
              FROM briefs
              WHERE user_id=0
              ORDER BY brief_date DESC
              LIMIT ?`)
    .bind(limit)
    .all<{ brief_date: string; content_md: string; generated_at: number }>();

  const briefs = (rows.results ?? []).map((r) => ({
    date: r.brief_date,
    generatedAt: r.generated_at,
    // Preview: ilk 200 char (markdown stripped)
    preview: r.content_md
      .replace(/[*_#`]/g, '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 200),
  }));

  return new Response(JSON.stringify({ ok: true, briefs, total: briefs.length }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
};
