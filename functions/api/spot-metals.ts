/**
 * GET /api/spot-metals
 *
 * MİNİMAL STUB — Stooq/Yahoo backend fetch Cloudflare Workers'tan 502 attığı için
 * tamamen devre dışı bırakıldı. Endpoint her zaman 200 + `ok: false` döner.
 *
 * Frontend `fetchSpotMetalsInline` bunu görünce null döndürür, ve
 * `loadMacroAll` içindeki `fetchMetal` chain doğrudan client-side
 * Yahoo `XAUUSD=X` / `XAGUSD=X` direct fetch'e (CSP allow-listed) geçer.
 *
 * Backend'ten metal verisi servis etmeye gerek yok — frontend zaten Yahoo direct
 * fetch'i CORS-safe yapıyor (BIST snapshot ile aynı pattern).
 */

export const onRequest: PagesFunction = async () => {
  return new Response(JSON.stringify({ ok: false, reason: 'backend-disabled-use-yahoo-direct' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      'X-Source': 'STUB-DISABLED',
    },
  });
};
