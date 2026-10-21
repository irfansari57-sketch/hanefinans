/**
 * /api/panel/top-stocks — BIST günün en çok yükselen / düşen 10 hissesi.
 *
 * 21 Eki 2026: Kaynak FVT → İş Yatırım toplu günlük tablo (_isyatirim.ts; ~15 dk
 * gecikmeli). FVT API'si kapandı (401/429); erişim kontrolü aşılmıyor.
 * BIST günlük tavan/taban ±%10 — üstü outlier olarak atılır. BYF/sertifika (6+ harf) hariç.
 * Edge cache 60sn seans açık / 10dk kapalı.
 */

import { fetchIsYatirimAll, isBistSessionNowUtc } from '../_isyatirim';

interface Env {}

export const onRequest: PagesFunction<Env> = async ({ request, waitUntil }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cv', '2');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached && cached.ok) return cached;
  }

  const d = await fetchIsYatirimAll(waitUntil);
  if (!d) {
    return new Response(JSON.stringify({ ok: false, error: 'İş Yatırım tablosu alınamadı' }), {
      status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const items = d.rows
    .filter((r) => r.symbol.length <= 5 && r.changePct !== 0 && Math.abs(r.changePct) <= 10.5)
    .map((r) => ({ kod: r.symbol, ad: r.name ?? '', pct: r.changePct, fiyat: r.price }));
  const body = {
    ok: true,
    source: 'isyatirim',
    attribution: 'Veri kaynağı: İş Yatırım (~15 dk gecikmeli)',
    updatedAt: new Date().toISOString(),
    pageTime: d.pageTime,
    totalBist: items.length,
    gainers: [...items].sort((a, b) => b.pct - a.pct).slice(0, 10),
    losers: [...items].sort((a, b) => a.pct - b.pct).slice(0, 10),
  };
  const ttl = isBistSessionNowUtc() ? 60 : 600;
  const resp = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=1800` },
  });
  if (!force && items.length > 0) waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
  return resp;
};
