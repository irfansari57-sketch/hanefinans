/**
 * /api/funds/:code/distribution — Fon portfoy dagilimi (hisse-bazli).
 *
 * Kaynak: fvt.com.tr/api/funds/{code}/distribution (public JSON endpoint).
 * FVT bu veriyi SPK'nin resmi aylik portfoy aciklamalarindan derliyor:
 *   - Her hisse icin: kod, sirket adi, sektor, mevcut agirlik %, onceki ay %
 *   - Fon icinde Yabanci menkul ve BYF/ETF holding'leri de iceriyor
 *   - Degisim yonu (fark pozitif/negatif) alım/satım trendini gösterir
 *
 * Response:
 *   {
 *     ok: true,
 *     code: "DHJ",
 *     updatedAt: "2026-10-03...",
 *     aciklamaTarihi: "2026-09-02T21:00:00Z",  // SPK aciklama tarihi
 *     oncekiAy: 8, oncekiYil: 2026,            // onceki ay karsilastirmasi
 *     items: [
 *       { kod: "ASELS", ad: "...", sektor: "...", agirlik: 20.44,
 *         eskiAgirlik: 19.27, fark: 1.17, hisseKategori: 22 }
 *     ],
 *     sektorler: [ { ad: "...", pct: 35.64 } ]  // agirlik toplami bazinda
 *   }
 *
 * Edge cache: 1 saat (SPK aciklama ayda 1 kez, intraday revize olmaz).
 */

interface Env {}

interface FvtDistributionItem {
  hisseKodu: string;
  sirketAdi: string;
  sektorAdi: string;
  agirlik: string | number;
  eskiAgirlik: string | number;
  fark: string | number;
  hisseKategori: number;
  etf: number;
  yabanci: number;
  fonAdi2: string;
  [k: string]: unknown;
}

interface FvtDistResponse {
  success: boolean;
  data?: {
    items: FvtDistributionItem[];
    meta?: {
      aciklamaTarihi?: string;
      oncekiAy?: number;
      oncekiYil?: number;
    };
  };
  timestamp?: string;
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export const onRequest: PagesFunction<Env> = async ({ request, params }) => {
  const code = String(params.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code || code.length < 2 || code.length > 6) {
    return new Response(JSON.stringify({ ok: false, error: 'Gecersiz fon kodu' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cv', '2'); // bump: Fon Sepeti ad field fallback fix
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached && cached.ok) return cached;
  }

  const fvtUrl = `https://fvt.com.tr/api/funds/${code}/distribution`;
  try {
    const r = await fetch(fvtUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Referer': `https://fvt.com.tr/fonlar/yatirim-fonlari/${code}/dagilim`,
        'Origin': 'https://fvt.com.tr',
      },
    });

    if (!r.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: `FVT HTTP ${r.status}`,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const j = (await r.json()) as FvtDistResponse;
    if (!j.success || !j.data?.items) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'FVT invalid response or no distribution data',
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Normalize + agirlik > 0 olanlari al, agirlik desc sirala.
    // ONEMLI: sirketAdi "" (empty string) olabilir (Fon Sepeti fonlarinda),
    // `??` empty string'de fallback yapmaz. Trim sonrasi truthy check yapıyoruz.
    const items = j.data.items
      .map((it) => {
        const sirket = (it.sirketAdi ?? '').trim();
        const fonAd  = (it.fonAdi2 ?? '').trim();
        return {
          kod: it.hisseKodu ?? '',
          ad: sirket || fonAd || '',
          sektor: (it.sektorAdi ?? '').trim(),
          agirlik: toNum(it.agirlik),
          eskiAgirlik: toNum(it.eskiAgirlik),
          fark: toNum(it.fark),
          kategori: it.hisseKategori,
          etf: it.etf === 1,
          yabanci: it.yabanci === 1,
        };
      })
      .filter((it) => it.kod && it.agirlik > 0)
      .sort((a, b) => b.agirlik - a.agirlik);

    // Sektorel dagilim: agirlik toplami
    const sektorMap = new Map<string, number>();
    for (const it of items) {
      if (!it.sektor) continue;
      sektorMap.set(it.sektor, (sektorMap.get(it.sektor) ?? 0) + it.agirlik);
    }
    const sektorler = Array.from(sektorMap.entries())
      .map(([ad, pct]) => ({ ad, pct: Math.round(pct * 100) / 100 }))
      .sort((a, b) => b.pct - a.pct);

    const body = {
      ok: true,
      code,
      source: 'fvt.com.tr',
      attribution: 'Veri kaynağı: fvt.com.tr (SPK aylik portföy açıklamaları)',
      updatedAt: new Date().toISOString(),
      aciklamaTarihi: j.data.meta?.aciklamaTarihi ?? null,
      oncekiAy: j.data.meta?.oncekiAy ?? null,
      oncekiYil: j.data.meta?.oncekiYil ?? null,
      itemCount: items.length,
      items,
      sektorler,
    };

    // SPK aylik aciklama — intraday degismez. 1 saat market, 6 saat kapali.
    const now = new Date();
    const utcH = now.getUTCHours();
    const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
    const marketOpen = isWeekday && utcH >= 6 && utcH <= 16;
    const ttl = marketOpen ? 3600 : 21600;

    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=86400`,
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
