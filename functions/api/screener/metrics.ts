/**
 * GET /api/screener/metrics
 *
 * Tarayıcı veri kaynağı (Hafta 4a, 15 Eki 2026). bars_daily'deki tüm yerli
 * hisseler (bar_count ≥ 30, endeksler hariç) için src/lib/metrics.ts özetini
 * döner. Filtreleme İSTEMCİDE yapılır (URL ile paylaşılabilir, sunucu tek
 * yanıtı önbellekler). Edge cache 30 dk — barlar gece yazılır.
 *
 * Yanıt ~600 satır × 20 alan ≈ 120 KB (gzip ~30 KB).
 * Yatırım tavsiyesi değildir; sayısal durum tespiti.
 */

import { computeMetrics, type StockMetrics } from '../../../src/lib/metrics';
import { computeTrend } from '../../../src/lib/regime';
import type { Bar } from '../../../src/lib/signals';

interface Env { DB: D1Database }
interface Row { symbol: string; date: string; open: number; high: number; low: number; close: number; volume: number }

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  cacheUrl.searchParams.set('cv', '1');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit && hit.ok) return hit;

  const started = Date.now();
  try {
    const meta = await env.DB.prepare(
      "SELECT symbol FROM bars_meta WHERE bar_count >= 30 AND symbol NOT LIKE 'XU%' AND symbol NOT LIKE 'XK%' AND symbol NOT LIKE 'XB%' ORDER BY symbol",
    ).all<{ symbol: string }>();
    const universe = (meta.results ?? []).map((x) => x.symbol).filter((s) => /^[A-Z0-9]{2,5}$/.test(s));

    const idxRows = await env.DB.prepare('SELECT close FROM bars_daily WHERE symbol = ? ORDER BY date DESC LIMIT 400').bind('XU100').all<{ close: number }>();
    const idxCloses = (idxRows.results ?? []).map((r) => r.close).reverse();
    const indexTrend = idxCloses.length >= 60 ? computeTrend(idxCloses).regime : null;

    const items: StockMetrics[] = [];
    const CH = 20;
    let latestDate = '';
    for (let i = 0; i < universe.length; i += CH) {
      const slice = universe.slice(i, i + CH);
      const stmts = slice.map((sym) =>
        env.DB.prepare('SELECT symbol, date, open, high, low, close, volume FROM bars_daily WHERE symbol = ? ORDER BY date DESC LIMIT 300').bind(sym),
      );
      const results = await env.DB.batch<Row>(stmts);
      for (const res of results) {
        const rows = (res.results ?? []).reverse();
        if (rows.length === 0) continue;
        const bars: Bar[] = rows.map((r) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0 }));
        const m = computeMetrics(rows[0].symbol, bars, indexTrend);
        if (!m) continue;
        if (m.asOfDate > latestDate) latestDate = m.asOfDate;
        items.push(m);
      }
    }

    const body = {
      ok: true,
      computedAt: new Date().toISOString(),
      asOfDate: latestDate || null,
      indexTrend,
      universe: universe.length,
      count: items.length,
      elapsedMs: Date.now() - started,
      items,
      disclaimer: 'Kapanış verisinden hesaplanan sayısal durum özeti; yatırım tavsiyesi değildir.',
    };
    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600, s-maxage=1800, stale-while-revalidate=3600' },
    });
    if (items.length > 0) waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
    return resp;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};
