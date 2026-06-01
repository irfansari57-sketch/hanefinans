/**
 * GET /api/briefs/2026-05-31
 *
 * Belirli bir tarihteki brief'i doner. user_id=0 global.
 *
 * Response: { ok, brief: { date, content_md, generated_at } | null }
 */

interface Env {
  DB?: D1Database;
}

interface Params {
  date: string;
}

export const onRequestGet: PagesFunction<Env, 'date', Params> = async ({ env, params }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const date = (params.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid date format (YYYY-MM-DD bekleniyor)' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const row = await env.DB
    .prepare(`SELECT brief_date, content_md, generated_at, model_version
              FROM briefs
              WHERE user_id=0 AND brief_date=?`)
    .bind(date)
    .first<{ brief_date: string; content_md: string; generated_at: number; model_version: string | null }>();

  return new Response(JSON.stringify({
    ok: true,
    brief: row ? {
      date: row.brief_date,
      contentMd: row.content_md,
      generatedAt: row.generated_at,
      modelVersion: row.model_version,
    } : null,
  }), {
    headers: {
      'Content-Type': 'application/json',
      // Eski brief degismez, uzun cache
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
};
