/**
 * GET /api/bist/katilim — BIST Katılım endeksi üyelikleri.
 *
 * Kaynak: FVT /api/stocks/katilim-endeks (BIST endeks bileşimlerinin yansıması).
 * Yanıt: { ok, asOf, count, indices: {XKTUM:'BIST Katılım Tüm',...}, symbols: {THYAO:[...]} }
 *
 * Edge cache 12 saat (bileşim çeyreklik değişir); kaynak düşerse boş sonuç
 * cache'lenmez — istemci statik yedeğe (src/data/katilim.ts) düşer.
 */

import { fvtJson } from '../_fvt';

interface FvtKatilim {
  success?: boolean;
  data?: { adet?: number; adlar?: Record<string, string>; semboller?: Record<string, string[]> };
}

export const onRequestGet: PagesFunction = async ({ request, waitUntil }) => {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  cacheUrl.searchParams.set('cv', '1');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit && hit.ok) return hit;

  const d = await fvtJson<FvtKatilim>('https://fvt.com.tr/api/stocks/katilim-endeks', 8000);
  const symbols = d?.data?.semboller ?? {};
  const count = Object.keys(symbols).length;
  if (!d?.success || count < 50) {
    return new Response(JSON.stringify({ ok: false, error: 'Katılım endeks verisi alınamadı', count }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const clean: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(symbols)) {
    const sym = k.toUpperCase();
    if (!/^[A-Z0-9]{3,6}$/.test(sym) || !Array.isArray(v)) continue;
    clean[sym] = v.filter((x): x is string => typeof x === 'string');
  }

  const resp = new Response(
    JSON.stringify({
      ok: true,
      asOf: new Date().toISOString(),
      source: 'fvt',
      count: Object.keys(clean).length,
      indices: d.data?.adlar ?? {},
      symbols: clean,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400',
      },
    },
  );
  waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
  return resp;
};
