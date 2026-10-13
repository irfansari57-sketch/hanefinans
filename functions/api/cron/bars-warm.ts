/**
 * POST /api/cron/bars-warm?scope=bist100|all&offset=0&limit=40&range=3y
 *
 * Sinyal motoru Hafta 1: günlük düzeltilmiş OHLCV'yi D1 `bars_daily`'ye yazar.
 *
 * Kaynak: kendi Yahoo proxy'miz (/api/yahoo/v8/finance/chart/{SYM}.IS) — D1
 * yahoo_cache, throttle ve İş Yatırım fallback'i oradan miras alınır.
 * Düzeltme: close = adjclose; open/high/low = ham × (adjclose/raw_close).
 *
 * Artımlı: bars_meta.last_date son 45 gün içindeyse range=3mo çekilir (hızlı),
 * değilse (ilk yükleme / uzun boşluk) range=3y.
 *
 * Batch: Pages Function süre sınırı için her çağrı `limit` sembol işler; workflow
 * offset'leri sırayla çağırır. BIST100 ≈ 3 çağrı × 40.
 *
 * Auth: X-Cron-Secret.
 */

import { BIST_100_UNIVERSE, BIST_INDICES, fetchAllBistSymbols } from '../_universe';
import { fvtJson, fetchWithTimeout } from '../_fvt';

interface Env {
  DB: D1Database;
  CRON_SECRET?: string;
}

interface YahooChart {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
    error?: unknown;
  };
}

interface Bar {
  date: string; open: number; high: number; low: number; close: number; rawClose: number | null; volume: number;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

/** Yahoo epoch (UTC) → TR seans günü (UTC+3) 'YYYY-MM-DD' */
function trDate(tsSec: number): string {
  return new Date(tsSec * 1000 + 3 * 3_600_000).toISOString().slice(0, 10);
}

async function fetchBars(origin: string, symbol: string, range: string): Promise<{ bars: Bar[]; error?: string }> {
  // Endeksler (XU100.IS) proxy'de İş Yatırım'a yönlenir; adjclose gelmez → faktör 1.
  const ySym = `${symbol}.IS`;
  const url = `${origin}/api/yahoo/v8/finance/chart/${encodeURIComponent(ySym)}?range=${range}&interval=1d`;
  const r = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 15000);
  if (!r) return { bars: [], error: 'timeout' };
  if (!r.ok) return { bars: [], error: `HTTP ${r.status}` };
  let j: YahooChart;
  try { j = (await r.json()) as YahooChart; } catch { return { bars: [], error: 'bad json' }; }
  const res = j.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const q = res?.indicators?.quote?.[0];
  const adj = res?.indicators?.adjclose?.[0]?.adjclose;
  if (!ts.length || !q?.close) return { bars: [], error: 'empty' };

  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const raw = q.close[i];
    const c = adj?.[i] ?? raw;
    if (c == null || raw == null || !(c > 0) || !(raw > 0)) continue;
    const f = adj ? c / raw : 1;
    if (!Number.isFinite(f) || f <= 0) continue;
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i];
    bars.push({
      date: trDate(ts[i]),
      open: o != null ? o * f : c,
      high: h != null ? h * f : c,
      low: l != null ? l * f : c,
      close: c,
      rawClose: raw,
      volume: Math.round(q.volume?.[i] ?? 0),
    });
  }
  // Aynı gün iki bar gelirse (nadir) sonuncusu kazanır
  const byDate = new Map<string, Bar>();
  for (const b of bars) byDate.set(b.date, b);
  return { bars: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)) };
}

async function upsertBars(db: D1Database, symbol: string, bars: Bar[], now: number): Promise<void> {
  const CHUNK = 80; // D1 batch limiti
  for (let i = 0; i < bars.length; i += CHUNK) {
    const stmts = bars.slice(i, i + CHUNK).map((b) =>
      db.prepare(
        `INSERT INTO bars_daily (symbol, date, open, high, low, close, raw_close, volume, source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'yahoo', ?)
         ON CONFLICT(symbol, date) DO UPDATE SET
           open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close,
           raw_close = excluded.raw_close, volume = excluded.volume, updated_at = excluded.updated_at`,
      ).bind(symbol, b.date, b.open, b.high, b.low, b.close, b.rawClose, b.volume, now),
    );
    await db.batch(stmts);
  }
}

async function writeMeta(db: D1Database, symbol: string, now: number, error: string | null): Promise<void> {
  const agg = await db.prepare('SELECT MIN(date) AS f, MAX(date) AS l, COUNT(*) AS n FROM bars_daily WHERE symbol = ?')
    .bind(symbol).first<{ f: string | null; l: string | null; n: number }>();
  await db.prepare(
    `INSERT INTO bars_meta (symbol, first_date, last_date, bar_count, last_run_at, last_error)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET first_date = excluded.first_date, last_date = excluded.last_date,
       bar_count = excluded.bar_count, last_run_at = excluded.last_run_at, last_error = excluded.last_error`,
  ).bind(symbol, agg?.f ?? null, agg?.l ?? null, agg?.n ?? 0, now, error).run();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = request.headers.get('x-cron-secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'D1 not bound' }, 503);

  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') ?? 'bist100';
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get('limit') ?? '40', 10) || 40));
  const forceRange = url.searchParams.get('range'); // '3y' zorlamak için

  let universe: string[];
  if (scope === 'all') universe = await fetchAllBistSymbols(fvtJson);
  else if (scope === 'indices') universe = BIST_INDICES;
  else universe = BIST_100_UNIVERSE;
  // Endeksler her koşuda dahil (küçük, kritik)
  if (scope !== 'indices' && offset === 0) universe = [...BIST_INDICES, ...universe.filter((s) => !BIST_INDICES.includes(s))];

  const slice = universe.slice(offset, offset + limit);
  const origin = url.origin;
  const now = Date.now();
  const started = now;

  // Artımlı karar için meta
  const metaRows = await env.DB.prepare(
    `SELECT symbol, last_date FROM bars_meta WHERE symbol IN (${slice.map(() => '?').join(',')})`,
  ).bind(...slice).all<{ symbol: string; last_date: string | null }>().catch(() => ({ results: [] as Array<{ symbol: string; last_date: string | null }> }));
  const lastDate = new Map((metaRows.results ?? []).map((r) => [r.symbol, r.last_date]));
  const cutoff = new Date(now - 45 * 86_400_000).toISOString().slice(0, 10);

  let ok = 0, fail = 0, barsWritten = 0;
  const errors: Record<string, string> = {};

  // 4'lü paralel — Yahoo proxy throttle'ı var; daha fazlası 429 üretir
  const PAR = 4;
  for (let i = 0; i < slice.length; i += PAR) {
    await Promise.all(slice.slice(i, i + PAR).map(async (sym) => {
      const ld = lastDate.get(sym);
      const range = forceRange ?? (ld && ld >= cutoff ? '3mo' : '3y');
      const { bars, error } = await fetchBars(origin, sym, range);
      if (error || bars.length === 0) {
        fail++;
        errors[sym] = error ?? 'empty';
        await writeMeta(env.DB, sym, now, error ?? 'empty').catch(() => {});
        return;
      }
      try {
        await upsertBars(env.DB, sym, bars, now);
        await writeMeta(env.DB, sym, now, null);
        ok++;
        barsWritten += bars.length;
      } catch (e) {
        fail++;
        errors[sym] = `D1: ${(e as Error).message.slice(0, 80)}`;
      }
    }));
  }

  const nextOffset = offset + limit < universe.length ? offset + limit : null;
  const zero = ok === 0;
  return json({
    ok: !zero,
    error: zero ? 'Hiçbir sembol yazılamadı' : undefined,
    scope, offset, limit, universeSize: universe.length, nextOffset,
    success: ok, fail, barsWritten,
    errors: Object.keys(errors).length ? errors : undefined,
    elapsedMs: Date.now() - started,
  }, zero ? 502 : 200);
};
