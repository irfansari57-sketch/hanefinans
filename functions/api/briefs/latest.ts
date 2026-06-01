/**
 * GET /api/briefs/latest
 *
 * En son global brief'i doner (user_id=0).
 * MVP: Herkes ayni brief'i goruyor.
 * Auth gerekmiyor — brief icerigi public (sadece kayitli kullaniciya push gider).
 *
 * Response: { ok, brief: { date, content_md, generated_at, model_version } | null }
 */

interface Env {
  DB?: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const row = await env.DB
    .prepare(`SELECT brief_date, content_md, generated_at, model_version
              FROM briefs
              WHERE user_id=0
              ORDER BY brief_date DESC
              LIMIT 1`)
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
      // Yeni brief 07:30'da gelir; 5 dk cache + 1 saat SWR yeterli
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
};
