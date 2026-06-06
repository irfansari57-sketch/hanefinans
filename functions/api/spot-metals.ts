/**
 * GET /api/spot-metals
 *
 * Spot precious metals (XAU/XAG/XPT USD) — D1-first, Stooq primary, Yahoo fallback.
 *
 * Strateji:
 *   1) D1 fresh (< 5 dk) — anında dön
 *   2) Stooq canlı çek (CSV)
 *   3) Stooq fail VEYA Stooq verisi stale (>12 saat) ise → Yahoo /chart proxy fallback
 *   4) Hepsi fail → D1 stale fallback (< 4 saat)
 *
 * Önemli: Stooq hafta sonu / piyasa kapalıyken eski intraday verisini döndürebiliyor.
 * Bu durumda Yahoo'nun `regularMarketPreviousClose` ile değişim hesabı doğru olur.
 *
 * Response'a `bundleUpdatedAt` (Unix ms) eklendi ki frontend stale tespit edebilsin.
 */

interface Env { DB?: D1Database; }

interface MetalQuote {
  value: number;
  changePct: number;
  updatedAt: string;
  source: 'stooq' | 'yahoo' | 'd1-cache';
}

interface SpotMetalsBundle {
  ok: boolean;
  /** Bundle'ın D1'e yazıldığı / freshly fetched edildiği zaman (Unix ms) */
  bundleUpdatedAt: number;
  XAU?: MetalQuote;
  XAG?: MetalQuote;
  XPT?: MetalQuote;
}

const CACHE_FRESH_MS = 5 * 60 * 1000;          // < 5 dk → fresh, hemen dön
const CACHE_STALE_MAX_MS = 4 * 60 * 60 * 1000; // 4 saat içinde stale fallback (son çare)
const STOOQ_FRESH_MAX_HOURS = 12;              // Stooq verisi 12 saat eskiden eskiyse → Yahoo'ya geç
const STOOQ_TIMEOUT_MS = 6000;
const YAHOO_TIMEOUT_MS = 6000;

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

/** Stooq quote'unun ne kadar eski olduğunu hesapla (saat cinsinden). */
function ageHours(updatedAt: string): number {
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return (Date.now() - ts) / (60 * 60 * 1000);
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

/**
 * Yahoo Finance /chart fallback — XAUUSD=X / XAGUSD=X / XPTUSD=X.
 * Avantaj: `regularMarketPreviousClose` ile gerçek günlük değişim doğru hesaplanır.
 */
async function fetchYahooMetal(yahooSym: string): Promise<MetalQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=5d`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), YAHOO_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
        Accept: 'application/json,*/*',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json() as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            previousClose?: number;
            chartPreviousClose?: number;
            regularMarketTime?: number;
          };
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: number[] }> };
        }>;
      };
    };
    const r = json?.chart?.result?.[0];
    if (!r) return null;
    const meta = r.meta ?? {};
    const closes = r.indicators?.quote?.[0]?.close ?? [];
    // En son fiyat: regularMarketPrice → son bar close
    const last = Number.isFinite(meta.regularMarketPrice as number)
      ? (meta.regularMarketPrice as number)
      : [...closes].reverse().find((c) => Number.isFinite(c)) as number | undefined;
    if (!Number.isFinite(last) || (last as number) <= 0) return null;
    // Önceki kapanış: previousClose → chartPreviousClose → son 2 close'tan birinci
    let prev = Number.isFinite(meta.previousClose as number) ? (meta.previousClose as number) : NaN;
    if (!Number.isFinite(prev)) prev = Number.isFinite(meta.chartPreviousClose as number) ? (meta.chartPreviousClose as number) : NaN;
    if (!Number.isFinite(prev)) {
      const validCloses = closes.filter((c) => Number.isFinite(c)) as number[];
      if (validCloses.length >= 2) prev = validCloses[validCloses.length - 2];
    }
    const changePct = Number.isFinite(prev) && (prev as number) > 0
      ? (((last as number) - (prev as number)) / (prev as number)) * 100
      : 0;
    const updatedAtMs = Number.isFinite(meta.regularMarketTime as number)
      ? (meta.regularMarketTime as number) * 1000
      : Date.now();
    return {
      value: last as number,
      changePct,
      updatedAt: new Date(updatedAtMs).toISOString(),
      source: 'yahoo',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Stooq sonucu fresh değilse Yahoo'ya geç. */
async function fetchMetalSmart(stooqSym: string, yahooSym: string): Promise<MetalQuote | null> {
  const s = await fetchStooq(stooqSym);
  if (s && ageHours(s.updatedAt) <= STOOQ_FRESH_MAX_HOURS) {
    return s;
  }
  // Stooq stale veya null — Yahoo dene
  const y = await fetchYahooMetal(yahooSym);
  if (y) return y;
  // Yahoo da fail → Stooq'un stale verisini son çare olarak dön (yoksa null)
  return s;
}

async function fetchAllSmart(): Promise<SpotMetalsBundle> {
  const [xau, xag, xpt] = await Promise.all([
    fetchMetalSmart('XAUUSD', 'XAUUSD=X'),
    fetchMetalSmart('XAGUSD', 'XAGUSD=X'),
    fetchMetalSmart('XPTUSD', 'XPTUSD=X'),
  ]);
  return {
    ok: !!(xau || xag || xpt),
    bundleUpdatedAt: Date.now(),
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
          // bundleUpdatedAt eski payload'larda yoksa, D1 yazma zamanını kullan
          if (!Number.isFinite(parsed.bundleUpdatedAt)) {
            parsed.bundleUpdatedAt = cached.updated_at;
          }
          return jsonResp(parsed, 200, 'D1-FRESH');
        }
      } catch { /* parse fail */ }
    }
  }

  // 2) Smart fetch — Stooq fresh ise Stooq, değilse Yahoo
  const live = await fetchAllSmart();
  if (live.ok && env.DB) {
    await writeD1(env.DB, cacheKey, JSON.stringify(live)).catch(() => null);
    return jsonResp(live, 200, 'SMART-LIVE');
  }

  // 3) Smart fetch fail → D1 stale (< 4 saat) son çare
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

  return jsonResp(live, live.ok ? 200 : 502, 'SMART-LIVE');
};
