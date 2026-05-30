/**
 * Cloudflare Pages Function — Telemetri event'lerini D1'e yaz.
 *
 * POST /api/telemetry/event
 * Body: { events: [{ name, props?, ts, sid, path }, ...] }
 *
 * Beacon API uyumlu — sayfa kapanırken gelen batch'leri kabul eder.
 * Rate-limiting: session başına 1 dakika 100 event max (basit hafıza tabanlı).
 * Production'da bu Workers KV'ye taşınabilir, ama V1 için yeterli.
 */

interface Env {
  DB?: D1Database;
}

interface IncomingEvent {
  name: string;
  props?: Record<string, unknown>;
  ts: number;
  sid: string;
  path?: string;
}

interface IncomingPayload {
  events?: IncomingEvent[];
}

// Basit in-memory rate limit (worker reset'lerinde sıfırlanır — best-effort)
const sessionCounts = new Map<string, { count: number; windowStart: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 100;

function isRateLimited(sid: string): boolean {
  const now = Date.now();
  const entry = sessionCounts.get(sid);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    sessionCounts.set(sid, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_MAX) return true;
  return false;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // D1 bağlı değilse sessizce başarı dön — telemetri opsiyonel, app'i durdurmaz
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: true, skipped: 'D1 not bound' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: IncomingPayload;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0 || events.length > 50) {
    return new Response(JSON.stringify({ ok: false, error: 'events 1-50 olmalı' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ua = (request.headers.get('User-Agent') || '').slice(0, 250);
  const country = request.headers.get('CF-IPCountry') || '';
  const receivedAt = Date.now();

  // Batch insert
  const stmts = events.map((e) => {
    if (typeof e.name !== 'string' || e.name.length === 0 || e.name.length > 80) return null;
    if (typeof e.sid !== 'string' || e.sid.length < 4 || e.sid.length > 32) return null;
    if (typeof e.ts !== 'number') return null;
    if (isRateLimited(e.sid)) return null;
    const props = e.props ? JSON.stringify(e.props).slice(0, 500) : null;
    const path = (typeof e.path === 'string' ? e.path : '').slice(0, 200);
    return env.DB!.prepare(
      'INSERT INTO telemetry_events (name, props, ts, sid, path, ua, country, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(e.name.slice(0, 80), props, e.ts, e.sid, path, ua, country, receivedAt);
  }).filter((s): s is D1PreparedStatement => s !== null);

  if (stmts.length === 0) {
    return new Response(JSON.stringify({ ok: true, accepted: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await env.DB.batch(stmts);
  } catch {
    // D1 hatası kullanıcıya yansımasın
  }

  return new Response(JSON.stringify({ ok: true, accepted: stmts.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
