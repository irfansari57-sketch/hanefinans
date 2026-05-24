/**
 * POST /api/csp-report
 *
 * Browser, CSP ihlali olduğunda buraya JSON gönderir.
 * Cloudflare Pages Functions logs'a düşer (`wrangler pages deployment tail`),
 * üretimde Sentry'ye de iletebiliriz (opsiyonel SENTRY_DSN env'i ile).
 *
 * Boyut limit'i middleware'de zaten 64 KB (#Ö10); rate limit "default" bucket'ta
 * 60/dk — CSP report'lar genelde tek tek gelir, kapasiteyi aşmaz.
 *
 * Body format'ı iki çeşit olabilir:
 *   - "report-uri" eski format: { "csp-report": { ... } } (application/csp-report)
 *   - "report-to" yeni format:  [{ "type": "csp-violation", "body": { ... } }] (application/reports+json)
 *
 * Her ikisini de loga yazar.
 */

interface Env {
  ENVIRONMENT?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    // Bazı browser'lar text/plain ile gönderir — hata verme, sessizce kabul et
    payload = { raw: await request.text().catch(() => '') };
  }

  // Üretimde structured log — Cloudflare dashboard'dan filtrelenebilir
  const env_name = env.ENVIRONMENT ?? 'unknown';
  console.warn(JSON.stringify({
    type: 'csp-violation',
    env: env_name,
    ts: new Date().toISOString(),
    ua: request.headers.get('user-agent')?.slice(0, 200),
    referer: request.headers.get('referer')?.slice(0, 200),
    payload,
  }));

  // 204 No Content — browser zaten response body okumaz
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
};

/** OPTIONS bypass — bazı browser'lar preflight gönderir */
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
