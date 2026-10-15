/**
 * /api/panel/snapshot — Panel ana sayfasi icin AGGREGATE endpoint.
 *
 * Panel acilisinda client su endpoint'leri ayri ayri cagiriyordu:
 *   - /api/yahoo/snapshot          (BIST hisseler + endeksler)
 *   - /api/news?max=8              (son haberler)
 *   - /api/spot-metals             (altin/gumus spot)
 *   - /api/isyatirim/chart         (XU100 chart data)
 *   - Yahoo kripto quotes          (BTC/ETH/XRP/DOGE)
 *
 * Her birisi ayri network round-trip + ayri edge cache. Client 4-6 fetch + duplicate dedup
 * sorunlariyla boguluyordu. Bu aggregator:
 *   1. Sunucu tarafinda tum endpoint'leri PARALEL cagirir (subrequest)
 *   2. Tek JSON response doner
 *   3. CF edge cache 30sn piyasa acikken / 300sn kapaliyken
 *
 * Client: tek fetch, ~200ms (edge hit), Panel 10sn → ~400ms first paint.
 *
 * Response schema: PanelSnapshot (bkz src/data/api/panelSnapshot.ts)
 */

interface Env {
  DB?: D1Database;
}

interface SubFetch {
  snapshot: unknown;
  news: unknown;
  spotMetals: unknown;
  bistChart: unknown;
  crypto: unknown;
}

// 13 Eki 2026: alt istek timeout'u — tek yavaş kaynak tüm paneli kilitlemesin.
async function safeJson<T>(fetchPromise: Promise<Response>, timeoutMs = 6000): Promise<T | null> {
  try {
    const r = await Promise.race([
      fetchPromise,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, waitUntil }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  // Versioned cache key — v1 bump edilince eski entry otomatik expire olur
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cv', '1');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached && cached.ok) return cached;
  }

  // Base URL for subrequests to our own endpoints
  const base = url.origin;

  // Hepsini paralel firlat — her birisi kendi edge cache'li, max latency = en yavasi
  const [
    snapshot,
    news,
    spotMetals,
    bistChart,
    crypto,
  ] = await Promise.all([
    safeJson<unknown>(fetch(`${base}/api/yahoo/snapshot`)),
    safeJson<unknown>(fetch(`${base}/api/news?max=8`)),
    safeJson<unknown>(fetch(`${base}/api/spot-metals`)),
    safeJson<unknown>(fetch(`${base}/api/isyatirim/chart?symbol=XU100&range=ytd`)),
    // Kripto batch via Yahoo snapshot (BTC/ETH/XRP/DOGE/BNB/SOL/ADA/DOT/AVAX/TRX/LINK/LTC/DOGE)
    safeJson<unknown>(fetch(`${base}/api/yahoo/snapshot?symbols=BTC-USD,ETH-USD,XRP-USD,DOGE-USD,BNB-USD,SOL-USD,ADA-USD,DOT-USD,AVAX-USD,TRX-USD,LINK-USD,LTC-USD`)),
  ]);

  // 13 Eki 2026: Düşen alt kaynaklar raporlanır; ana kaynak (snapshot) yoksa
  // 502 + no-store — null'u dakikalarca cache'leme (cache zehirlenmesi).
  const failed = (
    [
      ['snapshot', snapshot],
      ['news', news],
      ['spotMetals', spotMetals],
      ['bistChart', bistChart],
      ['crypto', crypto],
    ] as const
  )
    .filter(([, v]) => v == null)
    .map(([k]) => k);
  const coreDown = snapshot == null;

  const body = {
    ok: !coreDown,
    updatedAt: new Date().toISOString(),
    partial: failed.length > 0 ? failed : undefined,
    error: coreDown ? 'Ana fiyat kaynağı (yahoo/snapshot) alınamadı' : undefined,
    snapshot,
    news,
    spotMetals,
    bistChart,
    crypto,
  };

  if (coreDown) {
    return new Response(JSON.stringify(body), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // Piyasa acikken 30sn (fresh), kapaliyken 5dk (bos saatler, battery friendly)
  const now = new Date();
  const utcH = now.getUTCHours();
  const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
  const marketOpen = isWeekday && utcH >= 6 && utcH <= 16;
  // Kısmi hata: 15sn TTL — eksik parça hızla tamamlansın.
  const ttl = failed.length > 0 ? 15 : marketOpen ? 30 : 300;
  // stale-while-revalidate — 1 saat eski bile olsa INSTANT servis, arka planda yenile
  const swr = marketOpen ? 300 : 3600;

  const resp = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${swr}`,
    },
  });

  if (!force) {
    waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
  }
  return resp;
};
