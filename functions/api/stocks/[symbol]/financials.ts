/**
 * /api/stocks/:symbol/financials
 *
 * BIST hissesi için şirket finansal verilerini FVT'den proxy eder:
 *   - Bilanço + Gelir Tablosu + Nakit Akış (son 11 çeyrek)
 *   - Çarpanlar (FK, PDDD, FD/FAVÖK, piyasa değeri)
 *
 * Dönüş: {ok, periods:[{donem,toplamVarliklar,ozsermaye,netBorc,netSatis,brutKar,
 *                      faaliyetKari,favok,netKar,nakitNakitBenzerleri}], carpanlar}
 *
 * Edge cache: bilanco verisi günlük güncellenir — 1 saat cache yeter.
 */

interface Env {}

interface FvtTreeNode {
  key: string;
  label: string;
  value: number | null;
  children: FvtTreeNode[];
}

interface FvtBilancoPeriod {
  hisseKodu: string;
  donem: string;
  donemTarihi: string;
  varlikTipi: string;
  toplamVarliklar: string | number | null;
  ozsermaye: string | number | null;
  netBorc: string | number | null;
  netSatis: string | number | null;
  brutKar: string | number | null;
  faaliyetKari: string | number | null;
  netKar: string | number | null;
  favok: string | number | null;
  nakitNakitBenzerleri: string | number | null;
  gonderimTarihi: string;
  bilanco?: FvtTreeNode[] | null;
  gelirTablosu?: FvtTreeNode[] | null;
  nakitAkis?: FvtTreeNode[] | null;
  kapsamliGelir?: FvtTreeNode[] | null;
}

interface FvtBilancoResp {
  success: boolean;
  data?: FvtBilancoPeriod[];
}

interface FvtCarpanDeger {
  deger: number | null;
  donem: string | null;
}
interface FvtCarpanlar {
  sembol: string;
  fk?: FvtCarpanDeger;
  pddd?: FvtCarpanDeger;
  fdFavok?: FvtCarpanDeger;
  piyasaDegeri?: number;
  odenmisSermaye?: number;
  fiiliDolasimOrani?: number;
}

interface FvtCarpanResp {
  success: boolean;
  data?: FvtCarpanlar;
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

const FVT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  'Referer': 'https://fvt.com.tr/',
  'Origin': 'https://fvt.com.tr',
};

export const onRequest: PagesFunction<Env> = async ({ request, params }) => {
  const symbol = String(params.symbol ?? '').toUpperCase().trim();
  if (!symbol || symbol.length > 10 || !/^[A-Z0-9]+$/.test(symbol)) {
    return new Response(JSON.stringify({ ok: false, error: 'Geçersiz sembol' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  // cv=2: tam ağaç tablolar (bilanco/gelirTablosu/nakitAkis) eklendi
  cacheUrl.searchParams.set('cv', '2');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached && cached.ok) return cached;
  }

  try {
    const [bilancoR, carpanlarR] = await Promise.all([
      fetch(`https://fvt.com.tr/api/stocks/${symbol}/bilanco`, { headers: FVT_HEADERS }),
      fetch(`https://fvt.com.tr/api/hisse/${symbol}/carpanlar`, { headers: FVT_HEADERS }),
    ]);

    if (!bilancoR.ok) {
      return new Response(JSON.stringify({ ok: false, error: `FVT bilanco HTTP ${bilancoR.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const bilancoJ = (await bilancoR.json()) as FvtBilancoResp;
    const carpanlarJ = carpanlarR.ok ? ((await carpanlarR.json()) as FvtCarpanResp) : null;

    if (!bilancoJ.success || !Array.isArray(bilancoJ.data) || bilancoJ.data.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'FVT bilanco verisi yok' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const periods = bilancoJ.data.map((p) => ({
      donem: p.donem,
      donemTarihi: p.donemTarihi,
      toplamVarliklar: toNum(p.toplamVarliklar),
      ozsermaye: toNum(p.ozsermaye),
      netBorc: toNum(p.netBorc),
      netSatis: toNum(p.netSatis),
      brutKar: toNum(p.brutKar),
      faaliyetKari: toNum(p.faaliyetKari),
      favok: toNum(p.favok),
      netKar: toNum(p.netKar),
      nakitNakitBenzerleri: toNum(p.nakitNakitBenzerleri),
      gonderimTarihi: p.gonderimTarihi,
      // Tam ağaç tablolar (bilanço + gelir + nakit akış) — UI detay tabında render edilir
      bilanco: p.bilanco ?? null,
      gelirTablosu: p.gelirTablosu ?? null,
      nakitAkis: p.nakitAkis ?? null,
    }));

    const carpanlar = carpanlarJ?.data
      ? {
          fk: carpanlarJ.data.fk?.deger ?? null,
          pddd: carpanlarJ.data.pddd?.deger ?? null,
          fdFavok: carpanlarJ.data.fdFavok?.deger ?? null,
          piyasaDegeri: carpanlarJ.data.piyasaDegeri ?? null,
          odenmisSermaye: carpanlarJ.data.odenmisSermaye ?? null,
          fiiliDolasimOrani: carpanlarJ.data.fiiliDolasimOrani ?? null,
        }
      : null;

    const body = {
      ok: true,
      symbol,
      source: 'fvt.com.tr',
      attribution: 'Veri kaynağı: fvt.com.tr',
      updatedAt: new Date().toISOString(),
      lastReport: periods[0]?.gonderimTarihi ?? null,
      periods,
      carpanlar,
    };

    // Bilanço günde ~1 kez güncellenir — 1h cache
    const ttl = 3600;
    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=7200`,
      },
    });
    if (!force) {
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
