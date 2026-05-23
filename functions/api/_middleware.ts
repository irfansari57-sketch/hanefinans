/**
 * Pages Functions middleware — /api/* için rate limit ve güvenlik header'ları.
 *
 * Bu dosya `functions/api/_middleware.ts` olduğu için sadece /api/* route'larına
 * uygulanır; static asset'ler (HTML/CSS/JS) etkilenmez.
 *
 * Davranış:
 *   1. CF-Connecting-IP'den client IP'sini al
 *   2. Path'e göre bucket+limit belirle (auth=10/dk, ai=30/saat, default=60/dk)
 *   3. D1'deki rate_limits tablosuna count++ — limit aşılırsa 429 dön
 *   4. Geçtiyse next()'e ilet; response'a rate-limit header'ları ekle
 *
 * D1 binding (`DB`) yoksa rate limit devre dışı — fail-open ile request geçer.
 */

import { classifyRoute, getClientIp, rateLimitCheck } from '../_rate-limit';

interface Env {
  DB?: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;

  // D1 binding yoksa rate limit yapma — fail-open
  if (!env.DB) return next();

  // OPTIONS (CORS preflight) ve health check'i rate limit'e tabi tutma
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return next();

  const url = new URL(request.url);
  const path = url.pathname;

  // Health endpoint'ini bypass et — uptime monitorlar sık çağırır
  if (path === '/api/health' || path === '/api/health/') return next();

  const { bucket, limit, windowSec } = classifyRoute(path);
  const ip = getClientIp(request);

  const check = await rateLimitCheck(env.DB, bucket, ip, limit, windowSec);

  if (!check.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Çok fazla istek. Lütfen bir süre bekleyip tekrar deneyin.',
        retryAfter: check.retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Retry-After': String(check.retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(check.resetAt),
          'X-RateLimit-Bucket': bucket,
        },
      },
    );
  }

  // Geçti — downstream handler'a ilet, response'a kalan kotayı yansıt
  const response = await next();

  // Response immutable olabilir; yeni Response objesi ile header'ları enjekte et
  const remaining = Math.max(0, limit - check.count);
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-RateLimit-Limit', String(limit));
  newHeaders.set('X-RateLimit-Remaining', String(remaining));
  newHeaders.set('X-RateLimit-Reset', String(check.resetAt));
  newHeaders.set('X-RateLimit-Bucket', bucket);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
