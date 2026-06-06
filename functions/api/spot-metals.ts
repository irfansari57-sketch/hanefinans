/**
 * GET /api/spot-metals
 *
 * D1-first spot precious metals (XAU/XAG/XPT USD).
 * Warmer cron her 3 dk D1'i tazeler; bu endpoint sadece D1'den okur.
 * On-demand fallback olarak Stooq'a doğrudan da gider (warmer çalışmazsa).
 */

interface Env { DB?: D1Database; }

interface MetalQuote {
  value: number;
  changePct: number;
  updatedAt: string;
  source: 'stooq' | 'd1-cache';
}

interface SpotMetalsBundle {
  ok: boolean;
  /** Bundle'ın freshly fetched edildiği zaman (Unix ms) — frontend stale tespit için */
  bundleUpdatedAt?: number;
  XAU?: MetalQuote;
  XAG?: MetalQuote;
  XPT?: MetalQuote;
}

const CACHE_FRESH_MS = 5 * 60 * 1000;          // < 5 dk → fresh, hemen dön
const CACHE_STALE_MAX_MS = 30 * 60 * 1000;     // 30 dk içinde ise stale-while-revalidate
const STOOQ_TIMEOUT_MS = 6000;

interface CacheRow { payload: string; updated_at: number; }

async function readD1(db: D1Database, key: string): Promise<CacheRow | null> {
  return db.prepare('SELECT payload, updated_at FROM yahoo_cache WHERE key = ?').bind(key).first<CacheRow>();
}

async function writeD1(db: D1Database, key: string, payload: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO yahoo_cache (key, payload, updated_at, status, source)
       VALUES (?, ?, ?, 200, 'spot-metals')
       ON CONFLICT(key) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at,
         status = 200,
         source = 'spot-metals'`,
    )
    .bind(key, payload, Date.now())
    .run();
}

async function fetchStooq(symbol: string): Promise<MetalQuote | null> {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), STOOQ_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
        Accept: 'text/csv,*/*',
      },
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

async function fetchAllFromStooq(): Promise<SpotMetalsBundle> {
  const [xau, xag, xpt] = await Promise.all([
    fetchStooq('XAUUSD'),
    fetchStooq('XAGUSD'),
    fetchStooq('XPTUSD'),
  ]);

  // KRİTİK: bundleUpdatedAt fetch zamanı DEĞİL, en eski metalın updatedAt'i olmalı.
  // Aksi halde Stooq stale veri dönse bile frontend "şu an çekildi, fresh" sanır ve
  // fallback chain (TD/Yahoo direct/Futures) hiç devreye girmez.
  const metalTimes = [xau, xag, xpt]
    .filter((m): m is MetalQuote => m != null)
    .map((m) => Date.parse(m.updatedAt))
    .filter((t) => Number.isFinite(t));
  const oldestMetalTime = metalTimes.length > 0 ? Math.min(...metalTimes) : Date.now();

  return {
    ok: !!(xau || xag || xpt),
    bundleUpdatedAt: oldestMetalTime,
    XAU: xau ?? undefined,
    XAG: xag ?? undefined,
    XPT: xpt ?? undefined,
  };
}

function jsonResp(payload: unknown, status: number, source: string): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
      'X-Source': source,
    },
  });
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const cacheKey = 'spot-metals:bundle';

  // 1) D1 fresh hit (< 5 dk) — anında dön
  if (env.DB) {
    const cached = await readD1(env.DB, cacheKey);
    if (cached) {
      const age = Date.now() - cached.updated_at;
      try {
        const parsed = JSON.parse(cached.payload) as SpotMetalsBundle;
        if (age < CACHE_FRESH_MS && parsed.ok) {
          if (!Number.isFinite(parsed.bundleUpdatedAt)) {
            parsed.bundleUpdatedAt = cached.updated_at;
          }
          return jsonResp(parsed, 200, 'D1-FRESH');
        }
      } catch { /* parse fail */ }
    }
  }

  // 2) D1 stale (>5dk) veya boş — Stooq'tan canlı çek
  const live = await fetchAllFromStooq();
  if (live.ok && env.DB) {
    await writeD1(env.DB, cacheKey, JSON.stringify(live)).catch(() => null);
    return jsonResp(live, 200, 'STOOQ-LIVE');
  }

  // 3) Stooq da başarısız → eski D1 son çare
  if (env.DB) {
    const cached = await readD1(env.DB, cacheKey);
    if (cached && Date.now() - cached.updated_at < CACHE_STALE_MAX_MS) {
      try {
        const parsed = JSON.parse(cached.payload) as SpotMetalsBundle;
        if (parsed.ok) {
          if (!Number.isFinite(parsed.bundleUpdatedAt)) {
            parsed.bundleUpdatedAt = cached.updated_at;
          }
          return jsonResp(parsed, 200, 'D1-STALE-FALLBACK');
        }
      } catch { /* */ }
    }
  }

  return jsonResp(live, live.ok ? 200 : 502, 'STOOQ-LIVE');
};
