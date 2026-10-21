/**
 * GET /api/isyatirim/stocks — BIST geneli günlük tablo (İş Yatırım, ~15 dk gecikmeli).
 * Teşhis + istemci için; asıl tüketiciler snapshot / top-movers / bist-warm.
 */
import { fetchIsYatirimAll, isBistSessionNowUtc } from '../_isyatirim';

export const onRequestGet: PagesFunction = async ({ waitUntil }) => {
  const d = await fetchIsYatirimAll(waitUntil);
  if (!d) {
    return new Response(JSON.stringify({ ok: false, error: 'İş Yatırım tablosu alınamadı' }), {
      status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const ttl = isBistSessionNowUtc() ? 60 : 600;
  return new Response(JSON.stringify({ ok: true, source: 'isyatirim', count: d.rows.length, pageTime: d.pageTime, fetchedAt: d.fetchedAt, rows: d.rows }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}` },
  });
};
