/**
 * /api/panel/top-stocks — Panel "Günün Enleri · Hisseler" için top gainers/losers.
 *
 * Kaynak: fvt.com.tr/api/stocks (public JSON endpoint)
 *   - hissePazar=2 BIST + bazı yabancı hisseler mixed
 *   - hisseUrl Yahoo URL formatında — .IS/ suffixi varsa BIST
 *   - gunlukYuzde field'ı bazen null → gunlukKapanis/dunkuKapanis'ten hesaplanır
 *
 * BIST günlük tavan/taban ±%10 (SPK) — üstünü outlier olarak atar.
 * Edge cache 60sn market open / 10dk kapali.
 */

interface Env {}

interface FvtStock {
  hisseKodu: string;
  hisseAdi: string;
  hisseUrl: string;
  gunlukKapanis: string | null;
  dunkuKapanis: string | null;
  gunlukYuzde: string | null;
  hissePazar: number;
  piyDeg: string | null;
  [k: string]: unknown;
}

interface FvtResponse {
  success: boolean;
  data?: { data: FvtStock[]; meta?: { total: number } };
  timestamp?: string;
}

function toNum(v: unknown): number {
  if (v == null || v === '') return NaN;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cv', '1');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached && cached.ok) return cached;
  }

  try {
    const fvtUrl = 'https://fvt.com.tr/api/stocks?limit=5000&hissePazar=2';
    const r = await fetch(fvtUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Referer': 'https://fvt.com.tr/',
        'Origin': 'https://fvt.com.tr',
      },
    });
    if (!r.ok) {
      return new Response(JSON.stringify({ ok: false, error: `FVT HTTP ${r.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const j = (await r.json()) as FvtResponse;
    if (!j.success || !j.data?.data) {
      return new Response(JSON.stringify({ ok: false, error: 'FVT invalid response' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Sadece BIST (yahoo URL .IS suffixi) + gecerli fiyat + ±%10 BIST tavan filtresi
    const items = j.data.data
      .filter((s) => s.hisseUrl?.includes('.IS/'))
      .map((s) => {
        let pct = toNum(s.gunlukYuzde);
        const son = toNum(s.gunlukKapanis);
        const prev = toNum(s.dunkuKapanis);
        if (!Number.isFinite(pct) || pct === 0) {
          if (Number.isFinite(son) && Number.isFinite(prev) && prev > 0) {
            pct = ((son - prev) / prev) * 100;
          }
        }
        return {
          kod: s.hisseKodu,
          ad: (s.hisseAdi ?? '').trim(),
          pct,
          fiyat: Number.isFinite(son) ? son : null,
        };
      })
      .filter((x) =>
        x.kod &&
        Number.isFinite(x.pct) &&
        x.pct !== 0 &&
        Math.abs(x.pct) <= 10.5 && // tolerans: 10.00 exact + rounding
        Number.isFinite(x.fiyat ?? NaN)
      );

    const gainers = [...items].sort((a, b) => b.pct - a.pct).slice(0, 10);
    const losers = [...items].sort((a, b) => a.pct - b.pct).slice(0, 10);

    const body = {
      ok: true,
      source: 'fvt.com.tr',
      attribution: 'Veri kaynağı: fvt.com.tr',
      updatedAt: new Date().toISOString(),
      totalBist: items.length,
      gainers,
      losers,
    };

    const now = new Date();
    const utcH = now.getUTCHours();
    const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
    const marketOpen = isWeekday && utcH >= 6 && utcH <= 16;
    const ttl = marketOpen ? 60 : 600;

    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=1800`,
      },
    });
    if (!force && items.length > 0) {
      cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ });
    }
    return resp;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
