/**
 * Hane Finans - Yahoo Finance + Stooq cache warmer.
 *
 * Cron trigger'lar (slashes escaped to avoid breaking block comment):
 *  - BIST: every 10 min, BIST acik saatleri (7-15 UTC, Mon-Fri)
 *  - Historical: 30 15 Mon-Fri (gunluk 1Y daily fetch)
 *  - Cleanup: 0 22 daily (eski rowlari sil)
 *  - Spot metals: every 3 min, Stooq XAU/XAG/XPT
 *  - Crypto: every 5 min, Yahoo BTC/ETH/XRP/DOGE
 */

import { allWarmupSymbols } from './symbols';

export interface Env {
  DB: D1Database;
}

const YAHOO_BASE = 'https://query1.finance.yahoo.com';
const STOOQ_BASE = 'https://stooq.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const CHUNK_SIZE = 50;

const CRYPTO_SYMBOLS = ['BTC-USD', 'ETH-USD', 'XRP-USD', 'DOGE-USD'] as const;

function cacheKey(symbol: string, range: string, interval: string): string {
  return `${symbol}:${range}:${interval}`;
}

async function fetchYahoo(
  symbol: string,
  range: string,
  interval: string,
  timeoutMs = 8000,
): Promise<{ ok: boolean; status: number; body: string }> {
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      signal: controller.signal,
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: JSON.stringify({ error: String(e) }) };
  } finally {
    clearTimeout(t);
  }
}

async function writeCache(
  db: D1Database,
  key: string,
  payload: string,
  status: number,
  source: 'warmer' | 'proxy' | 'spot-metals',
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO yahoo_cache (key, payload, updated_at, status, source)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at,
         status = excluded.status,
         source = excluded.source`,
    )
    .bind(key, payload, Date.now(), status, source)
    .run();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function warmBatch(
  env: Env,
  symbols: readonly string[],
  range: string,
  interval: string,
  options: { concurrency?: number; batchDelayMs?: number } = {},
): Promise<{ ok: number; fail: number; status: Record<number, number> }> {
  const concurrency = options.concurrency ?? 4;
  const batchDelayMs = options.batchDelayMs ?? 250;

  let ok = 0;
  let fail = 0;
  const status: Record<number, number> = {};

  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (sym) => {
        const res = await fetchYahoo(sym, range, interval);
        status[res.status] = (status[res.status] ?? 0) + 1;
        if (res.ok) {
          await writeCache(env.DB, cacheKey(sym, range, interval), res.body, res.status, 'warmer');
          return true;
        }
        return false;
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value === true) ok++;
      else fail++;
    }
    if (i + concurrency < symbols.length) await sleep(batchDelayMs);
  }
  return { ok, fail, status };
}

// ============= Stooq spot-metals warmer =============
interface StooqQuote { value: number; changePct: number; updatedAt: string; source: 'stooq' }

async function fetchStooq(symbol: string, timeoutMs = 6000): Promise<StooqQuote | null> {
  const url = `${STOOQ_BASE}/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv,*/*' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const cols = lines[1].split(',');
    if (cols.length < 7) return null;
    const open = parseFloat(cols[3]);
    const close = parseFloat(cols[6]);
    if (!Number.isFinite(close) || close <= 0) return null;
    const changePct = Number.isFinite(open) && open > 0 ? ((close - open) / open) * 100 : 0;
    return {
      value: close,
      changePct,
      updatedAt: `${cols[1]}T${cols[2]}Z`,
      source: 'stooq',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function warmSpotMetals(env: Env): Promise<{ ok: number; fail: number }> {
  const [xau, xag, xpt] = await Promise.all([
    fetchStooq('XAUUSD'),
    fetchStooq('XAGUSD'),
    fetchStooq('XPTUSD'),
  ]);
  const payload = {
    ok: !!(xau || xag || xpt),
    XAU: xau ?? undefined,
    XAG: xag ?? undefined,
    XPT: xpt ?? undefined,
  };
  let ok = 0, fail = 0;
  if (xau) ok++; else fail++;
  if (xag) ok++; else fail++;
  if (xpt) ok++; else fail++;
  if (payload.ok) {
    await writeCache(env.DB, 'spot-metals:bundle', JSON.stringify(payload), 200, 'spot-metals').catch(() => null);
  }
  return { ok, fail };
}

async function cleanupStale(env: Env, maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const result = await env.DB.prepare('DELETE FROM yahoo_cache WHERE updated_at < ?')
    .bind(cutoff)
    .run();
  return (result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0;
}

function pickChunk<T>(items: readonly T[], scheduledTime: number, chunkSize = CHUNK_SIZE): T[] {
  const totalChunks = Math.ceil(items.length / chunkSize);
  const bucket = Math.floor(scheduledTime / (10 * 60 * 1000));
  const idx = ((bucket % totalChunks) + totalChunks) % totalChunks;
  return items.slice(idx * chunkSize, (idx + 1) * chunkSize);
}

async function handleScheduled(event: ScheduledEvent, env: Env): Promise<void> {
  const cron = event.cron;
  const allSymbols = allWarmupSymbols();

  // Cleanup — günlük 22:00 UTC
  if (cron === '0 22 * * *') {
    const deleted = await cleanupStale(env);
    console.log(`[warmer] cleanup: deleted ${deleted} stale rows`);
    return;
  }

  // BIST historical — günde 1 kez 18:30 TR — top 200 sembol
  if (cron === '30 15 * * 1-5') {
    const popular = allSymbols.slice(0, 200);
    const result = await warmBatch(env, popular, '1y', '1d', { concurrency: 4, batchDelayMs: 250 });
    console.log(`[warmer] historical (200): ${result.ok} ok, ${result.fail} fail`, result.status);
    return;
  }

  // BIST historical — sabah 09:30 TR de bir ısıt (kullanıcı gün açılışında hazır olsun)
  if (cron === '30 6 * * 1-5') {
    const popular = allSymbols.slice(0, 200);
    const result = await warmBatch(env, popular, '1y', '1d', { concurrency: 4, batchDelayMs: 250 });
    console.log(`[warmer] historical morning (200): ${result.ok} ok, ${result.fail} fail`, result.status);
    return;
  }

  // Spot metals — her 3 dk
  if (cron === '*/3 * * * *') {
    const result = await warmSpotMetals(env);
    console.log(`[warmer] spot-metals: ${result.ok} ok, ${result.fail} fail`);
    return;
  }

  // Crypto — her 5 dk (range=5d → tatil/hafta sonu Gün % fix)
  if (cron === '*/5 * * * *') {
    const result = await warmBatch(env, CRYPTO_SYMBOLS, '5d', '1d', { concurrency: 4, batchDelayMs: 200 });
    console.log(`[warmer] crypto: ${result.ok} ok, ${result.fail} fail`, result.status);
    return;
  }

  // BIST quotes — her 10 dk (BIST açık) — chunk rotasyonu (range=5d için)
  const chunk = pickChunk(allSymbols, event.scheduledTime);
  const result = await warmBatch(env, chunk, '5d', '1d', { concurrency: 4, batchDelayMs: 250 });
  console.log(`[warmer] quotes chunk (${chunk.length} symbols): ${result.ok} ok, ${result.fail} fail`, result.status);
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(event, env));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/health' || url.pathname === '/') {
      const stats = await env.DB.prepare(
        `SELECT COUNT(*) AS total, MAX(updated_at) AS last_update, MIN(updated_at) AS oldest, SUM(CASE WHEN source='warmer' THEN 1 ELSE 0 END) AS warmer_rows, SUM(CASE WHEN source='proxy' THEN 1 ELSE 0 END) AS proxy_rows, SUM(CASE WHEN source='spot-metals' THEN 1 ELSE 0 END) AS spot_metals_rows FROM yahoo_cache`,
      ).first();
      return Response.json({ ok: true, stats });
    }

    if (url.pathname === '/warm/quotes') {
      const all = allWarmupSymbols();
      const start = parseInt(url.searchParams.get('start') ?? '', 10);
      const count = parseInt(url.searchParams.get('count') ?? '', 10);
      let chunk: readonly string[];
      if (Number.isFinite(start) && start >= 0) {
        const c = Number.isFinite(count) && count > 0 ? count : CHUNK_SIZE;
        chunk = all.slice(start, start + c);
      } else {
        chunk = pickChunk(all, Date.now());
      }
      const result = await warmBatch(env, chunk, '2d', '1d', { concurrency: 4, batchDelayMs: 250 });
      return Response.json({ success: true, chunkSize: chunk.length, totalSymbols: all.length, ...result });
    }

    if (url.pathname === '/warm/historical') {
      const popular = allWarmupSymbols().slice(0, 30);
      const result = await warmBatch(env, popular, '1y', '1d', { concurrency: 3, batchDelayMs: 300 });
      return Response.json({ success: true, ...result });
    }

    if (url.pathname === '/warm/spot-metals') {
      const result = await warmSpotMetals(env);
      return Response.json({ success: true, ...result });
    }

    if (url.pathname === '/warm/crypto') {
      const result = await warmBatch(env, CRYPTO_SYMBOLS, '2d', '1d', { concurrency: 4, batchDelayMs: 200 });
      return Response.json({ success: true, ...result });
    }

    if (url.pathname === '/cleanup') {
      const deleted = await cleanupStale(env);
      return Response.json({ ok: true, deleted });
    }

    return new Response(
      'Hane Finans warmer\n\nEndpoints:\n  GET /health\n  GET /warm/quotes (?start=N&count=M)\n  GET /warm/historical\n  GET /warm/spot-metals\n  GET /warm/crypto\n  GET /cleanup\n',
      { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  },
};
