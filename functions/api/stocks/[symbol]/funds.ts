/**
 * /api/stocks/:symbol/funds — Bu hisseyi tutan fonlar (28 Eki 2026).
 *
 * Kaynak: data/holdings/by-stock.json (scripts/kap_holdings_fetch.py ters indeksi; KAP aylık/haftalık
 * Portföy Dağılım Raporu). Ağırlık = fon toplam değerine göre %. Yalnız raporu işlenmiş fonlar (kapsam
 * yanıtta `fundsCovered`), yani "bu hisseyi tutan TÜM fonlar" değil — UI bunu söyler.
 * Edge cache 1 saat; hata 503 no-store.
 */
interface Env {}

const BY_STOCK = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/holdings/by-stock.json';
interface Holder { f: string; n: string; p: number; per: string | null; t: string }
interface ByStock { updatedAt?: string; funds?: number; stocks?: Record<string, Holder[]> }

const H = { 'Content-Type': 'application/json; charset=utf-8' };

export const onRequest: PagesFunction<Env> = async ({ request, params, waitUntil }) => {
  const sym = String(params.symbol ?? '').toUpperCase().replace(/\.IS$/, '').replace(/[^A-Z0-9]/g, '');
  if (!sym || sym.length < 2 || sym.length > 8) {
    return new Response(JSON.stringify({ ok: false, error: 'Geçersiz sembol' }), { status: 400, headers: { ...H, 'Cache-Control': 'no-store' } });
  }
  const cache = (caches as unknown as { default: Cache }).default;
  const ck = new Request(new URL(request.url).toString() + '&cv=1', { method: 'GET' });
  const hit = await cache.match(ck);
  if (hit) return hit;
  try {
    const r = await fetch(BY_STOCK, { cf: { cacheTtl: 3600, cacheEverything: true } as RequestInitCfProperties });
    if (!r.ok) return new Response(JSON.stringify({ ok: false, error: `kaynak HTTP ${r.status}` }), { status: 503, headers: { ...H, 'Cache-Control': 'no-store' } });
    const j = (await r.json()) as ByStock;
    const holders = (j.stocks?.[sym] ?? []).map((h) => ({ code: h.f, name: h.n, pct: h.p, period: h.per, tur: h.t }));
    const body = {
      ok: true,
      symbol: sym,
      source: 'kap.org.tr',
      attribution: 'KAP aylık/haftalık Portföy Dağılım Raporu · ağırlık = fon toplam değerine göre %',
      indexUpdatedAt: j.updatedAt ?? null,
      fundsCovered: j.funds ?? null,
      count: holders.length,
      holders,
    };
    const resp = new Response(JSON.stringify(body), { status: 200, headers: { ...H, 'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400' } });
    waitUntil(cache.put(ck, resp.clone()).catch(() => null));
    return resp;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 503, headers: { ...H, 'Cache-Control': 'no-store' } });
  }
};
