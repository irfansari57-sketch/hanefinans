/**
 * GET /api/bars/regime?symbol=XU100
 *
 * Piyasa rejimi (Sinyal Motoru Hafta 2, 15 Eki 2026). bars_daily'den son 400
 * kapanışı okur, src/lib/regime.ts ile trend + oynaklık hesaplar; genişlik için
 * /api/yahoo/snapshot'taki yerli hisse sayımını kullanır (RegimeStrip ile aynı
 * kaynak). Deterministik; her etiket kanıt satırlarıyla döner.
 *
 * Edge cache 15 dk (bars gece yazılır; genişlik gün içi değişir → kısa TTL).
 */

import { computeRegime } from '../../../src/lib/regime';

interface Env { DB: D1Database }

interface SnapshotQuote { price: number; changePct: number; source?: string; kind?: string }

async function fetchBreadth(origin: string): Promise<{ advancers: number; decliners: number } | null> {
  try {
    const r = await fetch(`${origin}/api/yahoo/snapshot`, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const j = (await r.json()) as { ok: boolean; quotes: Record<string, SnapshotQuote> };
    if (!j.ok) return null;
    let a = 0, d = 0;
    for (const [k, q] of Object.entries(j.quotes)) {
      if (!k.endsWith('.IS')) continue;
      const sym = k.slice(0, -3);
      if (sym.length > 5 || sym.startsWith('XU') || sym.startsWith('XB') || sym.startsWith('XK')) continue;
      if (q.kind || !(q.price > 0) || !Number.isFinite(q.changePct) || Math.abs(q.changePct) > 11) continue;
      if (q.changePct > 0.0001) a++; else if (q.changePct < -0.0001) d++;
    }
    return { advancers: a, decliners: d };
  } catch { return null; }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get('symbol') ?? 'XU100').toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
    return new Response(JSON.stringify({ ok: false, error: 'Geçersiz sembol' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  cacheUrl.searchParams.set('symbol', symbol);
  cacheUrl.searchParams.set('cv', '1');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit && hit.ok) return hit;

  try {
    const rows = await env.DB.prepare(
      'SELECT date, close FROM bars_daily WHERE symbol = ? ORDER BY date DESC LIMIT 400',
    ).bind(symbol).all<{ date: string; close: number }>();
    const bars = (rows.results ?? []).reverse();
    if (bars.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'Bu sembol için bar yok', symbol }), {
        status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    const isIndex = symbol.startsWith('XU');
    const breadth = isIndex ? await fetchBreadth(url.origin) : null;
    const regime = computeRegime(bars, breadth, 'bars_daily');

    const resp = new Response(JSON.stringify({
      ok: true,
      symbol,
      computedAt: new Date().toISOString(),
      ...regime,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600',
      },
    });
    waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
    return resp;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};
