/**
 * POST /api/cron/bist-warm
 *
 * BIST tam evreni (~500 hisse) için Is Yatirim StockHistoricalAll'a batch fetch,
 * D1 `bist_snapshot` tablosuna UPSERT. Snapshot endpoint bu tablodan taze
 * quote'lari okur — Yahoo previousClose bug'i tamamen elimine.
 *
 * Auth: X-Cron-Secret header = CRON_SECRET env value.
 * Tetikleyici: .github/workflows/bist-warm.yml (piyasa saatlerinde her 5dk).
 *
 * Batch stratejisi:
 *   - 20 sembol paralel fetch (Promise.all)
 *   - 200ms delay her batch arasi (Is Yatirim rate limit korumasi)
 *   - Basarili olanlar tek COMMIT ile D1'e yazilir
 *   - Basarisiz semboller D1'e YAZILMAZ, eski satirlari kalir (frontend fallback icin)
 *
 * Query params:
 *   ?scope=bist100|bist30|all|top50  (default: bist100 - hizli MVP)
 */

import { fvtJson, isFvtBistRow } from '../_fvt';
import { BIST_100_UNIVERSE } from '../_universe';

interface Env {
  DB: D1Database;
  CRON_SECRET?: string;
}

interface IsYatirimResponse {
  data?: Array<[number, number]>; // [ts_ms, close]
}

/**
 * TR saatiyle (UTC+3, DST yok) son BIST iş günü, YYYY-MM-DD.
 * Hafta sonu → Cuma. Seans açılmadan önce (TR 09:00 öncesi) → önceki iş günü.
 * Resmi tatil takvimi YOK — bilinen sınır, marketCalendar.ts ile birleştirilecek.
 */
function lastBistSessionDateTR(now = new Date()): string {
  const tr = new Date(now.getTime() + 3 * 3_600_000);
  if (tr.getUTCHours() < 9) tr.setUTCDate(tr.getUTCDate() - 1);
  while (tr.getUTCDay() === 0 || tr.getUTCDay() === 6) tr.setUTCDate(tr.getUTCDate() - 1);
  return tr.toISOString().slice(0, 10);
}

function formatTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function fetchIsYatirimStock(
  symbol: string,
): Promise<{ price: number; prev: number; changePct: number; asOf: string; updatedAt: number } | null> {
  const sym = symbol.replace(/\.IS$/i, '').toUpperCase();
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 14);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 0);

  const url = new URL(
    'https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/StockHistoricalAll',
  );
  url.searchParams.set('period', '1440');
  url.searchParams.set('from', formatTimestamp(start));
  url.searchParams.set('to', formatTimestamp(end));
  url.searchParams.set('hisse', sym);

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/default.aspx',
      },
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    if (!text || text.length < 10) return null;
    let parsed: IsYatirimResponse;
    try {
      parsed = JSON.parse(text) as IsYatirimResponse;
    } catch { return null; }
    const rows = (parsed.data ?? []).filter(
      (r) => Array.isArray(r) && r.length >= 2 && Number.isFinite(r[1]) && r[1] > 0,
    );
    if (rows.length < 2) return null;
    rows.sort((a, b) => a[0] - b[0]);
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const price = last[1];
    const prevClose = prev[1];
    const changePct = prevClose > 0 && prevClose !== price ? ((price - prevClose) / prevClose) * 100 : 0;
    return {
      price,
      prev: prevClose,
      changePct,
      asOf: new Date(last[0]).toISOString().slice(0, 10),
      updatedAt: last[0] || Date.now(),
    };
  } catch {
    return null;
  }
}

// BIST 100 sembol listesi — 13 Eki 2026: ortak modüle taşındı (_universe.ts).

async function upsertBatch(
  db: D1Database,
  rows: Array<{ symbol: string; price: number; prev: number; changePct: number; asOf: string; updatedAt: number }>,
): Promise<void> {
  if (rows.length === 0) return;
  // D1 batch: array of Prepared statements
  const stmts = rows.map((r) =>
    db.prepare(
      `INSERT INTO bist_snapshot (symbol, price, prev, change_pct, as_of, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
         price = excluded.price,
         prev = excluded.prev,
         change_pct = excluded.change_pct,
         as_of = excluded.as_of,
         updated_at = excluded.updated_at`,
    ).bind(r.symbol, r.price, r.prev, r.changePct, r.asOf, r.updatedAt),
  );
  await db.batch(stmts);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Auth
  const secret = request.headers.get('x-cron-secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();
  const symbols = Array.from(new Set(BIST_100_UNIVERSE));

  const results: Array<{ symbol: string; price: number; prev: number; changePct: number; asOf: string; updatedAt: number }> = [];
  let success = 0;
  let fail = 0;
  let primarySource = 'isyatirim';

  // STRATEJI (11 Eki 2026 revizyon):
  // 1. FVT batch endpoint deneme (tek fetch, 500+ hisse, hizli + guvenilir)
  // 2. Fail olursa Is Yatirim per-symbol fallback (eski davranis)
  // Boylece 9 Eki Cuma gibi Is Yatirim CF'den bloklanirsa snapshot yine guncellenir.
  try {
    // 13 Eki 2026: ortak header + 8sn timeout (_fvt.ts)
    const fvtData = await fvtJson<{ data?: Array<Record<string, unknown>> }>(
      'https://fvt.com.tr/api/stocks?limit=5000&hissePazar=2',
      12000,
    );
    const items = fvtData?.data ?? [];
    if (items.length > 0) {
      primarySource = 'fvt';
      const now = Date.now();
      // asOf = seans tarihi. UTC "bugün" DEĞİL: FVT satırındaki `tarih` alanı varsa o,
      // yoksa TR saatiyle son iş günü (hafta sonu → Cuma). Tatil takvimi yok (bilinen sınır).
      const fallbackSession = lastBistSessionDateTR();
      for (const row of items) {
        if (!isFvtBistRow(row)) continue;
        const symbol = (row.hisseKodu as string)?.toUpperCase();
        if (!symbol || !symbols.includes(symbol)) continue;
        const son = parseFloat(String(row.gunlukKapanis ?? ''));
        const dun = parseFloat(String(row.dunkuKapanis ?? ''));
        if (!Number.isFinite(son) || !Number.isFinite(dun) || son <= 0 || dun <= 0) continue;
        const changePct = ((son - dun) / dun) * 100;
        if (Math.abs(changePct) > 15) continue; // outlier (BIST ±%10 limit + marj)
        const rowDate = typeof row.tarih === 'string' ? row.tarih.slice(0, 10) : '';
        const asOf = /^\d{4}-\d{2}-\d{2}$/.test(rowDate) ? rowDate : fallbackSession;
        results.push({ symbol, price: son, prev: dun, changePct, asOf, updatedAt: now });
        success++;
      }
    }
  } catch { /* FVT fail — fallback'e dus */ }

  // FVT yetersizse veya fail oluysa — Is Yatirim per-symbol fallback
  if (results.length < symbols.length / 2) {
    primarySource = results.length > 0 ? 'fvt+isyatirim' : 'isyatirim';
    const missing = symbols.filter((s) => !results.find((r) => r.symbol === s));
    const BATCH_SIZE = 20;
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (sym) => {
        const data = await fetchIsYatirimStock(sym);
        return { symbol: sym, data };
      }));
      for (const { symbol, data } of batchResults) {
        if (data) {
          results.push({ symbol, ...data });
          success++;
        } else {
          fail++;
        }
      }
      if (i + BATCH_SIZE < missing.length) await new Promise((r) => setTimeout(r, 200));
    }
  }

  // D1 batch upsert
  try {
    // D1 batch limit ~100 stmts, chunk edelim
    const CHUNK = 50;
    for (let i = 0; i < results.length; i += CHUNK) {
      await upsertBatch(env.DB, results.slice(i, i + CHUNK));
    }
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    // 13 Eki 2026: en sık neden tablo yokluğu (016 migration yanlış DB'ye uygulanmış).
    const hint = /no such table/i.test(msg)
      ? 'bist_snapshot tablosu yok → npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/016_bist_snapshot.sql'
      : undefined;
    return new Response(JSON.stringify({
      ok: false,
      error: `D1 batch write failed: ${msg}`,
      hint,
      success, fail, totalTried: symbols.length, primarySource,
    }), { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }

  // 13 Eki 2026: sıfır başarı = hata (önceden ok:true/200 dönüyordu, cron sessiz kalıyordu).
  const zero = success === 0;
  return new Response(JSON.stringify({
    ok: !zero,
    error: zero ? 'Hiçbir sembol güncellenemedi (FVT + İş Yatırım düşmüş olabilir)' : undefined,
    success,
    fail,
    totalTried: symbols.length,
    primarySource,
    elapsedMs: Date.now() - startTime,
  }), {
    status: zero ? 502 : 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
