/**
 * /api/watchlist
 *
 * GET    → kullanicinin izleme listesi (siralamaya gore)
 * POST   → tek sembol ekle veya toplu replace (?mode=replace)
 * DELETE → tek sembol sil (?symbol=THYAO) veya tumunu sil (?mode=all)
 *
 * Auth zorunlu — anonim 401.
 * localStorage'daki liste ilk login'de POST ?mode=replace ile migre edilir.
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

interface WatchRow {
  id: number;
  user_id: number;
  symbol: string;
  kind: 'stock' | 'fund' | 'crypto';
  note: string | null;
  added_at: number;
  position: number;
}

interface PostBody {
  /** Tek sembol ekleme icin */
  symbol?: string;
  kind?: 'stock' | 'fund' | 'crypto';
  note?: string;
  /** Toplu replace icin (localStorage -> cloud migrasyon) */
  symbols?: Array<string | { symbol: string; kind?: string }>;
}

// ==================== GET — list ====================
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  try {
    const rs = await env.DB.prepare(
      `SELECT id, user_id, symbol, kind, note, added_at, position
       FROM user_watchlist
       WHERE user_id = ?
       ORDER BY position ASC, added_at ASC
       LIMIT 500`,
    ).bind(auth.user.id).all<WatchRow>();

    return jsonResponse({ ok: true, items: rs.results ?? [] });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};

// ==================== POST — add / replace ====================
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz - once giris yap' }, 401);

  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Gecersiz JSON' }, 400);
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const now = Date.now();

  // ---- Toplu replace ----
  if (mode === 'replace' && Array.isArray(body.symbols)) {
    const items = body.symbols
      .map((s, i) => {
        if (typeof s === 'string') return { symbol: s.trim().toUpperCase(), kind: 'stock' as const, pos: i };
        const sym = (s.symbol ?? '').trim().toUpperCase();
        const kind = (s.kind === 'fund' || s.kind === 'crypto' ? s.kind : 'stock') as 'stock' | 'fund' | 'crypto';
        return { symbol: sym, kind, pos: i };
      })
      .filter((x) => x.symbol && x.symbol.length <= 20);

    if (items.length > 500) {
      return jsonResponse({ ok: false, error: 'Maks 500 sembol' }, 400);
    }

    try {
      // Once mevcut kayitlari sil, sonra bulk insert
      await env.DB.prepare(`DELETE FROM user_watchlist WHERE user_id = ?`).bind(auth.user.id).run();
      if (items.length === 0) {
        return jsonResponse({ ok: true, count: 0, mode: 'replace' });
      }
      // Batch insert — D1 batch API
      const stmts = items.map((it) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO user_watchlist (user_id, symbol, kind, added_at, position)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(auth.user.id, it.symbol, it.kind, now, it.pos),
      );
      await env.DB.batch(stmts);
      return jsonResponse({ ok: true, count: items.length, mode: 'replace' });
    } catch (e) {
      return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
    }
  }

  // ---- Tek sembol ekle ----
  const symbol = (body.symbol ?? '').trim().toUpperCase();
  const kind = body.kind === 'fund' || body.kind === 'crypto' ? body.kind : 'stock';
  const note = body.note ? body.note.trim().slice(0, 300) : null;

  if (!symbol || symbol.length > 20) {
    return jsonResponse({ ok: false, error: 'symbol zorunlu (max 20 karakter)' }, 400);
  }

  try {
    // Max position + 1 al (yeni sembol sona eklensin)
    const row = await env.DB.prepare(
      `SELECT MAX(position) as maxpos FROM user_watchlist WHERE user_id = ?`,
    ).bind(auth.user.id).first<{ maxpos: number | null }>();
    const nextPos = ((row?.maxpos ?? -1) + 1) | 0;

    await env.DB.prepare(
      `INSERT OR IGNORE INTO user_watchlist (user_id, symbol, kind, note, added_at, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(auth.user.id, symbol, kind, note, now, nextPos).run();

    return jsonResponse({ ok: true, symbol, kind });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};

// ==================== DELETE — remove / all ====================
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const symbol = (url.searchParams.get('symbol') ?? '').trim().toUpperCase();

  try {
    if (mode === 'all') {
      await env.DB.prepare(`DELETE FROM user_watchlist WHERE user_id = ?`).bind(auth.user.id).run();
      return jsonResponse({ ok: true, mode: 'all' });
    }
    if (!symbol) return jsonResponse({ ok: false, error: 'symbol query param zorunlu' }, 400);
    await env.DB.prepare(
      `DELETE FROM user_watchlist WHERE user_id = ? AND symbol = ?`,
    ).bind(auth.user.id, symbol).run();
    return jsonResponse({ ok: true, symbol });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};
