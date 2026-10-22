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
 * Self-heal (22 Eki 2026): Yahoo BIST'te zaman zaman son seans barını atlıyor
 * (null close) ya da eski bar döndürüyor. Cron seans kapanışından sonra çalıştığı
 * için son seans gününün (lastBistSessionDateTR) barı:
 *   - Yahoo'da YOKSA → İş Yatırım günlük tablosundan (fetchIsYatirimAll; tek
 *     istek, cache'li) `price` = kapanış, `volumeLots` = hacim; tabloda yoksa
 *     İş Yatırım chart endpoint'inden (StockHistoricalAll) o günün kapanışı.
 *     O/H/L bilinmez → close ile doldurulur, bars_daily.source = 'isyatirim-close'
 *     (dürüst işaret; UI/sinyal tarafı isterse ayırabilir).
 *   - Yahoo'da VARSA ama ham kapanış İş Yatırım'dan %2'den fazla sapıyorsa
 *     (TKFEN vakası: Yahoo eski bar) İş Yatırım kapanışı tercih edilir, loglanır.
 *   - Ertesi gün Yahoo gerçek O/H/L/C getirirse ON CONFLICT DO UPDATE üzerine
 *     yazar (source dahil → 'yahoo').
 *   Korumalar: seans açıkken (tablo intraday) heal yapılmaz; dilimdeki hisselerin
 *   çoğunluğunda Yahoo barı yoksa gün tatil sayılır, heal yapılmaz (tatil günü
 *   sahte bar üretmemek için — lastBistSessionDateTR tatil takvimi bilmiyor).
 *   Endeksler (XU100…) heal dışıdır (İş Yatırım tablosunda yok).
 *
 * Auth: X-Cron-Secret.
 */

import { BIST_100_UNIVERSE, BIST_INDICES, fetchAllBistSymbols } from '../_universe';
import { fvtJson, fetchWithTimeout } from '../_fvt';
import { fetchIsYatirimAll, isBistSessionNowUtc, type IsYatirimRow } from '../_isyatirim';

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

type BarSource = 'yahoo' | 'isyatirim-close';

interface Bar {
  date: string; open: number; high: number; low: number; close: number; rawClose: number | null; volume: number;
  source: BarSource;
}

/** İş Yatırım kapanışından sapma eşiği (Yahoo eski bar tespiti) */
const MISMATCH_PCT = 2;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

/** Yahoo epoch (UTC) → TR seans günü (UTC+3) 'YYYY-MM-DD' */
function trDate(tsSec: number): string {
  return new Date(tsSec * 1000 + 3 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * TR saatiyle (UTC+3, DST yok) son BIST iş günü, YYYY-MM-DD.
 * Hafta sonu → Cuma. Seans açılmadan önce (TR 09:00 öncesi) → önceki iş günü.
 * Resmi tatil takvimi YOK — bu yüzden heal'de çoğunluk korumasını kullanıyoruz.
 */
function lastBistSessionDateTR(now = new Date()): string {
  const tr = new Date(now.getTime() + 3 * 3_600_000);
  if (tr.getUTCHours() < 9) tr.setUTCDate(tr.getUTCDate() - 1);
  while (tr.getUTCDay() === 0 || tr.getUTCDay() === 6) tr.setUTCDate(tr.getUTCDate() - 1);
  return tr.toISOString().slice(0, 10);
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
    // close null (Yahoo'nun gün atlaması) → bar düşer; aşağıda heal devreye girer
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
      source: 'yahoo',
    });
  }
  // Aynı gün iki bar gelirse (nadir) sonuncusu kazanır
  const byDate = new Map<string, Bar>();
  for (const b of bars) byDate.set(b.date, b);
  return { bars: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)) };
}

// ---------------------------------------------------------------------------
// İş Yatırım chart endpoint (StockHistoricalAll) — tabloda olmayan sembol için
// yalnız günlük kapanış serisi. snapshot.ts/bist-warm.ts'deki fetchIsYatirimStock
// ile aynı endpoint; burada tarih→kapanış haritası döner.
// ---------------------------------------------------------------------------

interface IsYatirimChartResponse { data?: Array<[number, number]> }

function fmtIyTs(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function fetchIsYatirimCloseSeries(symbol: string): Promise<Map<string, number> | null> {
  const sym = symbol.replace(/\.IS$/i, '').toUpperCase();
  const now = new Date();
  const start = new Date(now.getTime() - 14 * 86_400_000);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 0);
  const url = new URL('https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/StockHistoricalAll');
  url.searchParams.set('period', '1440');
  url.searchParams.set('from', fmtIyTs(start));
  url.searchParams.set('to', fmtIyTs(end));
  url.searchParams.set('hisse', sym);
  const r = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/default.aspx',
    },
  }, 10000);
  if (!r || !r.ok) return null;
  let parsed: IsYatirimChartResponse;
  try { parsed = (await r.json()) as IsYatirimChartResponse; } catch { return null; }
  const out = new Map<string, number>();
  for (const row of parsed.data ?? []) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const [ts, close] = row;
    if (!Number.isFinite(ts) || !Number.isFinite(close) || close <= 0) continue;
    out.set(trDate(ts / 1000), close); // ts ms (UTC gece yarısı ya da TR) → TR günü
  }
  return out.size ? out : null;
}

// ---------------------------------------------------------------------------
// Self-heal karar mantığı
// ---------------------------------------------------------------------------

type HealOutcome =
  | { kind: 'none' }
  | { kind: 'healed'; via: 'table' | 'chart'; close: number }
  | { kind: 'mismatch'; yahooRaw: number; iyClose: number; pct: number }
  | { kind: 'unavailable' };

/**
 * Son seans barını İş Yatırım ile tamamlar/düzeltir. `bars` yerinde değiştirilir.
 * Düzeltme faktörü: Yahoo'nun en son barının close/rawClose oranı (bugün temettü
 * yoksa 1). İş Yatırım fiyatı ham kapanış olduğu için bu faktörle ölçeklenir.
 */
function healLastBar(
  bars: Bar[],
  sessionDate: string,
  iyRow: IsYatirimRow | undefined,
  via: 'table' | 'chart',
): HealOutcome {
  const idx = bars.findIndex((b) => b.date === sessionDate);
  const lastYahoo = bars.length ? bars[bars.length - 1] : null;
  const factor = lastYahoo && lastYahoo.rawClose && lastYahoo.rawClose > 0 ? lastYahoo.close / lastYahoo.rawClose : 1;
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;

  const makeBar = (rawClose: number, volume: number): Bar => {
    const c = rawClose * f;
    return { date: sessionDate, open: c, high: c, low: c, close: c, rawClose, volume: Math.max(0, Math.round(volume)), source: 'isyatirim-close' };
  };

  if (idx >= 0) {
    // Bar var → İş Yatırım ile tutarlılık kontrolü (eski bar tespiti)
    const b = bars[idx];
    if (!iyRow || b.rawClose == null || !(b.rawClose > 0)) return { kind: 'none' };
    const pct = Math.abs(b.rawClose - iyRow.price) / iyRow.price * 100;
    if (pct <= MISMATCH_PCT) return { kind: 'none' };
    const vol = iyRow.volumeLots != null && iyRow.volumeLots > 0 ? iyRow.volumeLots : b.volume;
    bars[idx] = makeBar(iyRow.price, vol);
    return { kind: 'mismatch', yahooRaw: b.rawClose, iyClose: iyRow.price, pct };
  }

  // Bar yok → İş Yatırım kapanışı (tablo: price+volumeLots; chart: yalnız close, hacim 0)
  if (iyRow) {
    bars.push(makeBar(iyRow.price, iyRow.volumeLots ?? 0));
    bars.sort((a, b) => a.date.localeCompare(b.date));
    return { kind: 'healed', via, close: iyRow.price };
  }
  return { kind: 'unavailable' };
}

async function upsertBars(db: D1Database, symbol: string, bars: Bar[], now: number): Promise<void> {
  const CHUNK = 80; // D1 batch limiti
  for (let i = 0; i < bars.length; i += CHUNK) {
    const stmts = bars.slice(i, i + CHUNK).map((b) =>
      db.prepare(
        `INSERT INTO bars_daily (symbol, date, open, high, low, close, raw_close, volume, source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(symbol, date) DO UPDATE SET
           open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close,
           raw_close = excluded.raw_close, volume = excluded.volume, source = excluded.source,
           updated_at = excluded.updated_at`,
      ).bind(symbol, b.date, b.open, b.high, b.low, b.close, b.rawClose, b.volume, b.source, now),
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

/** Migration 023 uygulanmamışsa (kolon yok) sessizce atlar. */
async function markHealed(db: D1Database, symbol: string, now: number): Promise<void> {
  await db.prepare(
    'UPDATE bars_meta SET healed_count = COALESCE(healed_count, 0) + 1, last_heal_at = ? WHERE symbol = ?',
  ).bind(now, symbol).run().catch(() => { /* kolon yok → migration 023 bekleniyor */ });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const secret = request.headers.get('x-cron-secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'D1 not bound' }, 503);

  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') ?? 'bist100';
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get('limit') ?? '40', 10) || 40));
  const forceRange = url.searchParams.get('range'); // '3y' zorlamak için
  const noHeal = url.searchParams.get('heal') === '0'; // tanı için kapatma anahtarı

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
  const sessionDate = lastBistSessionDateTR(new Date(now));

  // Artımlı karar için meta
  const metaRows = await env.DB.prepare(
    `SELECT symbol, last_date FROM bars_meta WHERE symbol IN (${slice.map(() => '?').join(',')})`,
  ).bind(...slice).all<{ symbol: string; last_date: string | null }>().catch(() => ({ results: [] as Array<{ symbol: string; last_date: string | null }> }));
  const lastDate = new Map((metaRows.results ?? []).map((r) => [r.symbol, r.last_date]));
  const cutoff = new Date(now - 45 * 86_400_000).toISOString().slice(0, 10);

  // --- Faz 1: Yahoo (4'lü paralel — proxy throttle'ı var; daha fazlası 429 üretir)
  // İş Yatırım tablosu paralelde (tek istek, cache'li). Seans açıkken tablo intraday → heal yok.
  const sessionOpen = isBistSessionNowUtc(new Date(now));
  const iyAllP = noHeal || sessionOpen ? Promise.resolve(null) : fetchIsYatirimAll(waitUntil).catch(() => null);

  const fetched = new Map<string, { bars: Bar[]; error?: string }>();
  const PAR = 4;
  for (let i = 0; i < slice.length; i += PAR) {
    await Promise.all(slice.slice(i, i + PAR).map(async (sym) => {
      const ld = lastDate.get(sym);
      const range = forceRange ?? (ld && ld >= cutoff ? '3mo' : '3y');
      fetched.set(sym, await fetchBars(origin, sym, range));
    }));
  }

  // --- Faz 2: heal kararı (tatil koruması: dilimdeki hisselerin çoğunda Yahoo barı var mı?)
  const iyAll = await iyAllP;
  const iyBySym = new Map<string, IsYatirimRow>();
  for (const r of iyAll?.rows ?? []) iyBySym.set(r.symbol.replace(/\.IS$/i, '').toUpperCase(), r);

  const stockSyms = slice.filter((s) => !BIST_INDICES.includes(s) && (fetched.get(s)?.bars.length ?? 0) > 0);
  const withSession = stockSyms.filter((s) => fetched.get(s)!.bars.some((b) => b.date === sessionDate)).length;
  let healSkipped: string | undefined;
  if (noHeal) healSkipped = 'heal=0';
  else if (sessionOpen) healSkipped = 'session-open';
  else if (!iyAll) healSkipped = 'isyatirim-unavailable';
  else if (stockSyms.length === 0) healSkipped = 'no-stocks';
  else if (withSession * 2 < stockSyms.length) healSkipped = `holiday-guard (${withSession}/${stockSyms.length} Yahoo barı ${sessionDate})`;
  const healEnabled = !healSkipped;

  let ok = 0, fail = 0, barsWritten = 0;
  const errors: Record<string, string> = {};
  const healedSymbols: string[] = [];
  const healUnavailable: string[] = [];
  const mismatchFixed: Array<{ symbol: string; yahooRaw: number; iyClose: number; pct: number }> = [];

  // --- Faz 3: heal + upsert
  for (let i = 0; i < slice.length; i += PAR) {
    await Promise.all(slice.slice(i, i + PAR).map(async (sym) => {
      const { bars, error } = fetched.get(sym) ?? { bars: [], error: 'empty' };
      if (error || bars.length === 0) {
        fail++;
        errors[sym] = error ?? 'empty';
        await writeMeta(env.DB, sym, now, error ?? 'empty').catch(() => {});
        return;
      }
      let healed = false;
      if (healEnabled && !BIST_INDICES.includes(sym)) {
        const iyRow = iyBySym.get(sym);
        let outcome = healLastBar(bars, sessionDate, iyRow, 'table');
        if (outcome.kind === 'unavailable') {
          // Tabloda yok → chart endpoint'ten o günün kapanışı (tarih eşleşmeli; eski kapanış yazılmaz)
          const series = await fetchIsYatirimCloseSeries(sym).catch(() => null);
          const close = series?.get(sessionDate);
          if (close != null && close > 0) {
            outcome = healLastBar(bars, sessionDate, { symbol: sym, price: close, changePct: 0, changeTl: null, volumeTl: null, volumeLots: null }, 'chart');
          }
        }
        if (outcome.kind === 'healed') { healed = true; healedSymbols.push(sym); }
        else if (outcome.kind === 'mismatch') {
          healed = true;
          mismatchFixed.push({ symbol: sym, yahooRaw: outcome.yahooRaw, iyClose: outcome.iyClose, pct: Math.round(outcome.pct * 100) / 100 });
          console.warn(`[bars-warm] ${sym} ${sessionDate}: Yahoo ham kapanış ${outcome.yahooRaw} vs İş Yatırım ${outcome.iyClose} (%${outcome.pct.toFixed(2)}) → İş Yatırım yazıldı`);
        } else if (outcome.kind === 'unavailable') healUnavailable.push(sym);
      }
      try {
        await upsertBars(env.DB, sym, bars, now);
        await writeMeta(env.DB, sym, now, null);
        if (healed) await markHealed(env.DB, sym, now);
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
    sessionDate,
    healed: healedSymbols.length,
    healedSymbols: healedSymbols.slice(0, 20),
    mismatchFixed: mismatchFixed.length,
    mismatchFixedSymbols: mismatchFixed.slice(0, 20),
    healUnavailable: healUnavailable.length ? healUnavailable.slice(0, 20) : undefined,
    healSkipped,
    errors: Object.keys(errors).length ? errors : undefined,
    elapsedMs: Date.now() - started,
  }, zero ? 503 : 200); // 503: Cloudflare 502'yi HTML sayfayla değiştiriyor
};
