/**
 * Agent endpoint'leri için ortak koruma + D1 cache.
 *
 * 13 Eki 2026 güvenlik denetimi (P0): sentiment/news/macro agent'ları oturumsuz
 * POST ile her seferinde Anthropic'i çağırıyordu (tek sınır IP başına 60/dk).
 * Bu modül:
 *   1) guardAgent()     — oturum + AI gate (ai/_gate ile aynı politika: AI_FOR_ALL_USERS
 *                         false iken sadece admin). AUTH_TOKEN_SECRET yoksa fail-closed.
 *   2) withAgentCache() — D1 `agent_cache` tablosunda key→body, TTL'li. Aynı girdi
 *                         için TTL süresince Anthropic çağrısı yapılmaz. DB yoksa
 *                         cache atlanır (davranış bozulmaz).
 *
 * Migration: functions/migrations/017_agent_cache.sql
 */

import { getAuthedUser, jsonResponse, type Env as AuthEnv } from '../auth/_utils';
import { checkAiGate } from '../ai/_gate';

export interface AgentEnv extends AuthEnv {
  ANTHROPIC_API_KEY?: string;
}

/** Oturum + gate. İzin yoksa hazır Response döner; izin varsa null. */
export async function guardAgent(request: Request, env: AgentEnv): Promise<Response | null> {
  if (!env.AUTH_TOKEN_SECRET || !env.DB) {
    // Prod'da secret/DB yoksa açık bırakma — fail-closed.
    return jsonResponse({ ok: false, error: 'Auth yapılandırması eksik', code: 'AI_AUTH_REQUIRED' }, 503);
  }
  const auth = await getAuthedUser(request, env);
  const gate = checkAiGate(auth);
  if (!gate.allowed) {
    return jsonResponse({ ok: false, ...gate.errorBody }, 403);
  }
  return null;
}

/** Deterministik, kısa cache anahtarı (SHA-256 hex, ilk 32 karakter). */
export async function cacheKey(ns: string, input: unknown): Promise<string> {
  const raw = `${ns}:${JSON.stringify(input)}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${ns}:${hex.slice(0, 32)}`;
}

interface CacheRow {
  body: string;
  expires_at: number;
}

/**
 * D1-backed cache. compute() sadece cache miss'te çalışır; ok:false sonuçlar
 * cache'lenmez (hata zehirlenmesi olmasın).
 */
export async function withAgentCache<T extends { ok: boolean }>(
  env: AgentEnv,
  key: string,
  ttlSec: number,
  compute: () => Promise<T>,
): Promise<{ data: T; cached: boolean }> {
  const now = Date.now();
  if (env.DB) {
    try {
      const row = await env.DB.prepare('SELECT body, expires_at FROM agent_cache WHERE key = ? LIMIT 1')
        .bind(key)
        .first<CacheRow>();
      if (row && row.expires_at > now) {
        return { data: JSON.parse(row.body) as T, cached: true };
      }
    } catch {
      /* tablo yoksa / D1 hatası — cache'siz devam */
    }
  }

  const data = await compute();

  if (env.DB && data && data.ok) {
    try {
      await env.DB.prepare(
        `INSERT INTO agent_cache (key, body, expires_at, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET body = excluded.body, expires_at = excluded.expires_at, created_at = excluded.created_at`,
      )
        .bind(key, JSON.stringify(data), now + ttlSec * 1000, now)
        .run();
    } catch {
      /* noop */
    }
  }
  return { data, cached: false };
}

/** Agent yanıtı — ACAO:* yok (same-origin), cache'siz. */
export function agentJson(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}
