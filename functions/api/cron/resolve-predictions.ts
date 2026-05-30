/**
 * POST /api/cron/resolve-predictions
 *
 * Her gün BIST kapanışı (18:00 TR / 15:00 UTC) sonrası GitHub Actions cron tetikler.
 * X-Cron-Secret header gerekir.
 *
 * Akış:
 *   1) Çözülmemiş (resolved_at IS NULL) tahminleri çek
 *   2) Her asset için bugünkü kapanışı al (XU100/XU030 yahoo_cache)
 *   3) Eğer tahmin tarihindeki gün için base_value varsa → gerçek % değişim
 *   4) Kategori belirle (strongUp / up / flat / down / strongDown)
 *   5) Tahminle gerçek arasındaki uzaklığa göre puan ver:
 *        - Aynı: +10
 *        - Komşu (1 yan): +5
 *        - 2 uzak: 0
 *        - 3+ uzak: -2
 *   6) resolved_at = now, points_earned = puan
 *
 * Idempotent: zaten resolved olanları atlar.
 */

interface Env {
  DB: D1Database;
  CRON_SECRET?: string;
}

type Bucket = 'strongUp' | 'up' | 'flat' | 'down' | 'strongDown';
const BUCKET_ORDER: Bucket[] = ['strongDown', 'down', 'flat', 'up', 'strongUp'];

interface PredRow {
  id: number;
  user_id: number;
  asset: 'BIST100' | 'BIST30';
  date: string;
  prediction: Bucket;
  base_value: number | null;
}

interface QuoteCacheRow {
  payload: string;
  updated_at: number;
}

interface YahooChartResult {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number };
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
  };
}

function bucketFromPct(pct: number): Bucket {
  if (pct >= 2) return 'strongUp';
  if (pct >= 0.5) return 'up';
  if (pct > -0.5) return 'flat';
  if (pct > -2) return 'down';
  return 'strongDown';
}

function pointsForGuess(predicted: Bucket, actual: Bucket): number {
  const pi = BUCKET_ORDER.indexOf(predicted);
  const ai = BUCKET_ORDER.indexOf(actual);
  const dist = Math.abs(pi - ai);
  if (dist === 0) return 10;
  if (dist === 1) return 5;
  if (dist === 2) return 0;
  return -2;
}

async function loadTwoLatestCloses(db: D1Database, symbol: string): Promise<{ last: number; prev: number } | null> {
  const row = await db
    .prepare(`SELECT payload FROM yahoo_cache WHERE key = ? LIMIT 1`)
    .bind(`${symbol}:5d:1d`)
    .first<QuoteCacheRow>();
  if (!row) return null;
  try {
    const j = JSON.parse(row.payload) as YahooChartResult;
    const meta = j.chart?.result?.[0]?.meta;
    const closes = j.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const valid: number[] = [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (c != null && Number.isFinite(c) && c > 0) valid.push(c as number);
      if (valid.length >= 2) break;
    }
    const price = meta?.regularMarketPrice ?? valid[0];
    if (price == null) return null;
    let prev: number;
    if (valid.length >= 2) {
      prev = Math.abs(price - valid[0]) < 0.01 ? valid[1] : valid[0];
    } else {
      return null;
    }
    return { last: price, prev };
  } catch {
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const provided = request.headers.get('X-Cron-Secret') ?? '';
  if (!env.CRON_SECRET || provided !== env.CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'Yetkisiz' }), { status: 401 });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 binding eksik' }), { status: 503 });
  }

  const stats = { resolved: 0, skipped: 0, errors: 0 };

  // Çözülmemiş tahminleri çek (son 7 gün — daha eski olanlar nadiren resolve olabilir)
  const rowsRes = await env.DB
    .prepare(
      `SELECT id, user_id, asset, date, prediction, base_value
       FROM predictions
       WHERE resolved_at IS NULL AND date <= ?
       ORDER BY date ASC
       LIMIT 500`,
    )
    .bind(new Date().toISOString().slice(0, 10))
    .all<PredRow>();
  const preds = rowsRes.results ?? [];

  if (preds.length === 0) {
    return new Response(JSON.stringify({ ok: true, stats }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Asset bazlı close fiyatları al (cache 1x)
  const bist100 = await loadTwoLatestCloses(env.DB, 'XU100.IS');
  const bist30 = await loadTwoLatestCloses(env.DB, 'XU030.IS');

  if (!bist100 && !bist30) {
    return new Response(JSON.stringify({ ok: false, error: 'Yahoo cache hazır değil — sonra tekrar dene', stats }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const today = new Date().toISOString().slice(0, 10);

  for (const p of preds) {
    try {
      const closes = p.asset === 'BIST100' ? bist100 : bist30;
      if (!closes) { stats.skipped++; continue; }

      // base_value tahminin verildiği gün yakalanmış olmalı; yoksa prev'e düş
      const base = p.base_value ?? closes.prev;
      if (!base || base <= 0) { stats.skipped++; continue; }
      const actualPct = ((closes.last - base) / base) * 100;
      const actualBucket = bucketFromPct(actualPct);
      const points = pointsForGuess(p.prediction, actualBucket);

      // Sadece tarihi geçmiş tahminleri resolve et
      if (p.date >= today) { stats.skipped++; continue; }

      await env.DB
        .prepare(
          `UPDATE predictions
           SET actual_change_pct = ?, actual_bucket = ?, points_earned = ?, resolved_at = ?, updated_at = ?
           WHERE id = ? AND resolved_at IS NULL`,
        )
        .bind(actualPct, actualBucket, points, now, now, p.id)
        .run();
      stats.resolved++;
    } catch {
      stats.errors++;
    }
  }

  return new Response(JSON.stringify({ ok: true, stats }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
