/**
 * GET /api/bars/:symbol?days=750
 *
 * D1 `bars_daily`'den düzeltilmiş günlük OHLCV (eski → yeni). Sinyal motoru,
 * risk raporu ve grafikler için tek okuma noktası. Edge cache 10 dk (gece cron
 * yazdığı için gün içinde değişmez).
 *
 * Yanıt: { ok, symbol, count, firstDate, lastDate, source:'yahoo→D1',
 *          bars:[{d,o,h,l,c,v}], meta:{lastRunAt,lastError} }
 */

interface Env { DB: D1Database }

interface Row { date: string; open: number; high: number; low: number; close: number; volume: number }

export const onRequestGet: PagesFunction<Env> = async ({ request, params, env, waitUntil }) => {
  const symbol = String(params.symbol ?? '').toUpperCase().trim();
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
    return new Response(JSON.stringify({ ok: false, error: 'Geçersiz sembol' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  const url = new URL(request.url);
  const days = Math.min(1500, Math.max(30, parseInt(url.searchParams.get('days') ?? '750', 10) || 750));

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    const rows = await env.DB.prepare(
      'SELECT date, open, high, low, close, volume FROM bars_daily WHERE symbol = ? ORDER BY date DESC LIMIT ?',
    ).bind(symbol, days).all<Row>();
    const meta = await env.DB.prepare('SELECT last_run_at, last_error FROM bars_meta WHERE symbol = ?')
      .bind(symbol).first<{ last_run_at: number; last_error: string | null }>();
    const list = (rows.results ?? []).reverse();
    if (list.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'Bu sembol için bar yok (bars-warm henüz çalışmadı)', symbol }), {
        status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
      });
    }
    const body = {
      ok: true,
      symbol,
      count: list.length,
      firstDate: list[0].date,
      lastDate: list[list.length - 1].date,
      source: 'yahoo→D1',
      adjusted: true,
      bars: list.map((r) => ({ d: r.date, o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume })),
      meta: { lastRunAt: meta?.last_run_at ?? null, lastError: meta?.last_error ?? null },
    };
    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=3600' },
    });
    waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
    return resp;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: `D1: ${(e as Error).message.slice(0, 120)}` }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};
