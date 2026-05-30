/**
 * Pages Functions middleware — /api/* için rate limit, body size limit, security headers.
 *
 * Davranış:
 *   1. JSON body size kontrolü (#Ö10) — Content-Length > 64KB → 413
 *   2. CF-Connecting-IP'den client IP'sini al
 *   3. Path'e göre bucket+limit belirle (auth=10/dk, ai=30/saat, default=60/dk)
 *   4. D1'deki rate_limits tablosuna count++ — limit aşılırsa 429
 *   5. Response'a rate-limit + güvenlik header'ları ekle (#Ö8)
 *
 * Güvenlik (#K5): D1 binding yoksa production'da fail-closed (503), preview/dev'de fail-open.
 */

import { classifyRoute, getClientIp, rateLimitCheck } from '../_rate-limit';

interface Env {
  DB?: D1Database;
  ENVIRONMENT?: string;
}

const MAX_BODY_BYTES = 64 * 1024;

const API_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;

  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return next();

  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/health' || path === '/api/health/') return next();

  // Body size limit (#Ö10) — DoS savunması
  if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
    const lenHeader = request.headers.get('content-length');
    if (lenHeader !== null) {
      const len = parseInt(lenHeader, 10);
      if (!Number.isFinite(len) || len < 0) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Geçersiz Content-Length' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
        );
      }
      if (len > MAX_BODY_BYTES) {
        return new Response(
          JSON.stringify({ ok: false, error: 'İstek gövdesi çok büyük (max 64 KB)' }),
          { status: 413, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
        );
      }
    }
  }

  // D1 binding yoksa: production'da fail-closed (#K5)
  if (!env.DB) {
    const envName = env.ENVIRONMENT ?? 'production';
    if (envName === 'production') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Servis hazırlanıyor' }),
        { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
      );
    }
    return withSecurityHeaders(await next());
  }

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

  const response = await next();

  const remaining = Math.max(0, limit - check.count);
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-RateLimit-Limit', String(limit));
  newHeaders.set('X-RateLimit-Remaining', String(remaining));
  newHeaders.set('X-RateLimit-Reset', String(check.resetAt));
  newHeaders.set('X-RateLimit-Bucket', bucket);
  for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) {
    newHeaders.set(k, v);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};

function withSecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) {
    newHeaders.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
