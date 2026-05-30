/**
 * POST /api/predictions/submit
 *
 * Body: { asset: 'BIST100'|'BIST30', prediction: 'strongUp'|'up'|'flat'|'down'|'strongDown' }
 *
 * Bugün için tahmin gönder. Aynı asset için zaten tahmin varsa GÜNCELLER
 * (gün içinde fikir değiştirebilir — gün sonuna kadar). Saat 18:00 (BIST kapanış)
 * sonrası kilitlenir.
 *
 * Otomatik base_value yakalanır (snapshot cache'inden, varsa).
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

const VALID_ASSETS = ['BIST100', 'BIST30'] as const;
const VALID_PREDICTIONS = ['strongUp', 'up', 'flat', 'down', 'strongDown'] as const;

function todayInIstanbul(): string {
  const nowMs = Date.now();
  const istMs = nowMs + 3 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

function istHour(): number {
  const istMs = Date.now() + 3 * 60 * 60 * 1000;
  return new Date(istMs).getUTCHours();
}

interface QuoteCacheRow {
  payload: string;
}

interface YahooChartResult {
  chart?: {
    result?: Array<{ meta?: { regularMarketPrice?: number } }>;
  };
}

async function loadBaseValue(db: D1Database, asset: 'BIST100' | 'BIST30'): Promise<number | null> {
  const symbol = asset === 'BIST100' ? 'XU100.IS' : 'XU030.IS';
  const row = await db
    .prepare(`SELECT payload FROM yahoo_cache WHERE key = ? LIMIT 1`)
    .bind(`${symbol}:5d:1d`)
    .first<QuoteCacheRow>();
  if (!row) return null;
  try {
    const j = JSON.parse(row.payload) as YahooChartResult;
    const price = j.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Tahmin için giriş yap' }, 401);

  let body: { asset?: string; prediction?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400);
  }

  const asset = (body.asset ?? '').trim() as typeof VALID_ASSETS[number];
  const prediction = (body.prediction ?? '').trim() as typeof VALID_PREDICTIONS[number];

  if (!VALID_ASSETS.includes(asset)) {
    return jsonResponse({ ok: false, error: `asset ${VALID_ASSETS.join('|')} olmalı` }, 400);
  }
  if (!VALID_PREDICTIONS.includes(prediction)) {
    return jsonResponse({ ok: false, error: `prediction ${VALID_PREDICTIONS.join('|')} olmalı` }, 400);
  }

  // Saat 18:00 TR sonrası kilitli — değişim BIST kapanışı geçtiği için anlamsız
  if (istHour() >= 18) {
    return jsonResponse({ ok: false, error: 'Bugünkü tahmin süresi doldu (18:00 TR sonrası). Yarın için tekrar gel.' }, 400);
  }

  const today = todayInIstanbul();
  const now = Math.floor(Date.now() / 1000);
  const baseValue = await loadBaseValue(env.DB, asset);

  try {
    // Upsert (user, asset, date)
    await env.DB
      .prepare(
        `INSERT INTO predictions (user_id, asset, date, prediction, base_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, asset, date) DO UPDATE SET
           prediction = excluded.prediction,
           base_value = COALESCE(predictions.base_value, excluded.base_value),
           updated_at = excluded.updated_at`,
      )
      .bind(auth.user.id, asset, today, prediction, baseValue, now, now)
      .run();
    return jsonResponse({ ok: true, asset, prediction, baseValue });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};
