/**
 * GET /api/bist/katilim — BIST Katılım endeksi üyelikleri.
 *
 * Kaynak (22 Eki 2026): repo'daki data/katilim.json (jsDelivr CDN). Dosyayı
 * GitHub Actions'taki scripts/katilim_fetch.py haftalık üretir (katilimendeksi.org →
 * borsaistanbul.com → KAP sırasıyla; ilk sürüm src/data/katilim.ts statik listesinden).
 * FVT (fvt.com.tr) kaynağı kaldırıldı — API kapandı (401/429), erişim kontrolü aşılmaz.
 *
 * Yanıt: { ok, asOf, source, count, indices: {XKTUM:'BIST Katılım Tüm',...}, symbols: {THYAO:[...]} }
 *
 * Edge cache 12 saat (bileşim çeyreklik değişir); dosya okunamaz/eksikse 503 + no-store —
 * istemci (src/hooks/useKatilim.ts) statik yedeğe düşer. 5xx asla cache'lenmez.
 */

const FEED_URL = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/katilim.json';
const MIN_SYMBOLS = 50;
const FEED_TIMEOUT_MS = 8000;

interface KatilimFeed {
  ok?: boolean;
  asOf?: string;
  updatedAt?: string;
  source?: string;
  count?: number;
  indices?: Record<string, string>;
  symbols?: Record<string, string[]>;
}

function fail(error: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: false, error, ...extra }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestGet: PagesFunction = async ({ request, waitUntil }) => {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  cacheUrl.searchParams.set('cv', '2'); // bump: FVT -> data/katilim.json (jsDelivr), 22 Eki 2026
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit && hit.ok) return hit;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
  let feed: KatilimFeed | null = null;
  let httpStatus = 0;
  try {
    const r = await fetch(FEED_URL, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
      cf: { cacheTtl: 3600, cacheEverything: true } as RequestInitCfProperties,
    });
    httpStatus = r.status;
    if (r.ok) feed = (await r.json()) as KatilimFeed;
  } catch {
    feed = null;
  } finally {
    clearTimeout(timer);
  }

  const rawSymbols = feed?.symbols && typeof feed.symbols === 'object' ? feed.symbols : {};
  const clean: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(rawSymbols)) {
    const sym = k.toUpperCase();
    if (!/^[A-Z0-9]{3,6}$/.test(sym) || !Array.isArray(v)) continue;
    const codes = v.filter((x): x is string => typeof x === 'string' && /^X[A-Z0-9]{3,5}$/.test(x));
    if (codes.length > 0) clean[sym] = codes;
  }
  const count = Object.keys(clean).length;
  if (count < MIN_SYMBOLS) {
    return fail('Katılım endeks verisi alınamadı', { count, feedStatus: httpStatus });
  }

  const resp = new Response(
    JSON.stringify({
      ok: true,
      asOf: feed?.asOf ?? feed?.updatedAt?.slice(0, 10) ?? null,
      updatedAt: feed?.updatedAt ?? null,
      source: feed?.source ? `katilim.json:${feed.source}` : 'katilim.json',
      count,
      indices: feed?.indices && typeof feed.indices === 'object' ? feed.indices : {},
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
