/**
 * /api/befas/live — Canlı BES fon verisi (NAV + getiri + risk metrikleri).
 *
 * Kaynak: fvt.com.tr/api/funds (public JSON endpoint).
 * FVT bu veriyi kendi frontend'inde kullanmak icin acik yayinliyor.
 *
 * Bizim CF Function proxy'ledigimizden:
 *   - Browser CORS bypassed (server-to-server)
 *   - Edge cache ile FVT'ye minimal yuk (15 dk)
 *   - Attribution: response'da "source: fvt.com.tr" alani
 *
 * Response 325+ BES fonu + tum period getirileri + risk metrikleri.
 */

interface Env {}

interface FvtFund {
  id: number;
  fonKodu: string;
  fonAdi: string;
  fiyat: string;
  getiri: string;
  kategori: string;
  fonTipi: string;
  risk: string;
  yonetimUcret: string;
  sharpe: string;
  beta: string;
  sortino: string;
  alpha: string;
  treynor: string;
  maximumKayip: string;
  downside: string;
  dolulukOrani: string;
  toplamDeger: string;
  yatirimci: string;
  pazarPayi: string;
  isinKodu: string;
  kurulusTarihi: string;
  halkaArzTarihi: string | null;
  stopaj: string;
  paraBirimi: string;
  kapAdresi: string;
  hakkinda: string;
  sonGuncelleme: string;
  // Period getiriler
  haftalikGetiri: string;
  aylikGetiri: string;
  ucAylikGetiri: string;
  altiAylikGetiri: string;
  ytdGetiri: string;
  birYillikGetiri: string;
  ucYillikGetiri: string;
  besYillikGetiri: string;
  [k: string]: unknown;
}

interface FvtResponse {
  success: boolean;
  data?: {
    data: FvtFund[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  };
  timestamp?: string;
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Kurucu firmayı fon adından cıkarır — regex ile "A.Ş" (period optional).
 * Sonuc her zaman Title Case + " A.Ş." canonical formuna cevrilir ki dropdown'da
 * "KATILIM EMEKLİLİK VE HAYAT A.Ş." tek satır olsun, varyantlar dagilmasin.
 */
function extractFounder(fonAdi: string): string {
  if (!fonAdi) return '';
  // "AGESA HAYAT VE EMEKLİLİK A.Ş. XXX" | "KATILIM EMEKLİLİK VE HAYAT A.Ş XXX" (no period)
  const m = fonAdi.match(/^(.+?)\s+A\.?Ş\.?/i);
  if (!m) return '';
  const base = m[1].trim();
  // Title Case with TR-aware casing
  const small = new Set(['VE', 'İLE']);
  const titled = base.split(/\s+/).map((w, i) => {
    if (i > 0 && small.has(w)) return w.toLocaleLowerCase('tr-TR');
    // Kisa buyukharfli kisaltmalar (BNP, HDI, QNB, AXA, S.A, N.V. vs.)
    if (/^[A-Z0-9]{2,4}$/.test(w)) return w;
    const lower = w.toLocaleLowerCase('tr-TR');
    return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
  }).join(' ');
  return titled + ' A.Ş.';
}

/**
 * FVT fund → InvestliQ shape (BesFund).
 * Frontend hem seed hem live'dan gelen datayi ayni sekilde isliyor.
 */
function normalizeFund(f: FvtFund) {
  const nav = toNum(f.fiyat);
  return {
    code: f.fonKodu?.toUpperCase() ?? '',
    name: f.fonAdi ?? '',
    category: 'Emeklilik' as const,
    besKategori: f.fonTipi ?? f.kategori ?? 'Emeklilik',
    founder: extractFounder(f.fonAdi ?? ''),
    tip: (f.bes ? 'BES' : (f.fonTipi?.includes('OKS') ? 'OKS' : 'DK')) as 'BES' | 'OKS' | 'DK',
    tefasOpen: false as const,
    befasOpen: true as const,
    nav: nav && nav > 0 ? nav : null,
    navDate: f.sonGuncelleme,
    returns: {
      '1d':  toNum(f.getiri),
      '1w':  toNum(f.haftalikGetiri),
      '1m':  toNum(f.aylikGetiri),
      '3m':  toNum(f.ucAylikGetiri),
      '6m':  toNum(f.altiAylikGetiri),
      ytd:   toNum(f.ytdGetiri),
      '1y':  toNum(f.birYillikGetiri),
      '3y':  toNum(f.ucYillikGetiri),
      '5y':  toNum(f.besYillikGetiri),
    },
    risk: {
      value:         toNum(f.risk),
      sharpe:        toNum(f.sharpe),
      beta:          toNum(f.beta),
      sortino:       toNum(f.sortino),
      alpha:         toNum(f.alpha),
      treynor:       toNum(f.treynor),
      maximumKayip:  toNum(f.maximumKayip),
      downside:      toNum(f.downside),
    },
    size: {
      totalValue:    toNum(f.toplamDeger),
      investorCount: toNum(f.yatirimci),
      marketShare:   toNum(f.pazarPayi),
      occupancyRate: toNum(f.dolulukOrani),
    },
    fees: {
      managementFee: toNum(f.yonetimUcret),
      stopajRate:    toNum(f.stopaj),
    },
    meta: {
      isin:            f.isinKodu ?? null,
      establishedDate: f.kurulusTarihi ?? null,
      ipoDate:         f.halkaArzTarihi ?? null,
      kapUrl:          f.kapAdresi ?? null,
      currency:        f.paraBirimi ?? 'TL',
    },
    description: f.hakkinda ?? '',
  };
}

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(request.url, request);

  if (!force) {
    const cached = await cache.match(cacheKey);
    // Sadece basarili cache hit'i servis et — 5xx cached response'lari atla
    // (BYF Function'da yasadigimiz "cache poisoning" bug'inin ayni pattern'i).
    if (cached && cached.ok) return cached;
  }

  // FVT'ye browser-like istek
  const fvtUrl = 'https://fvt.com.tr/api/funds?limit=500&fonTipi=bes&islem=1&sortOrder=DESC&viewMode=getiri&page=1';
  try {
    const r = await fetch(fvtUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Referer': 'https://fvt.com.tr/fonlar/bes-fonlari',
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

    const j = (await r.json()) as FvtResponse;
    if (!j.success || !j.data?.data) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'FVT invalid response',
        preview: JSON.stringify(j).slice(0, 500),
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const funds = j.data.data.map(normalizeFund);

    const body = {
      ok: true,
      source: 'fvt.com.tr',
      attribution: 'Veri kaynağı: fvt.com.tr — bilgilendirme amaçlıdır, yatırım tavsiyesi değildir.',
      updatedAt: j.timestamp ?? new Date().toISOString(),
      count: funds.length,
      funds,
    };

    // Piyasa acikken 15 dk, kapaliyken 4 saat
    const now = new Date();
    const utcH = now.getUTCHours();
    const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
    const marketOpen = isWeekday && utcH >= 6 && utcH <= 16;
    const ttl = marketOpen ? 900 : 14400;

    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
      },
    });

    if (!force && funds.length > 0) {
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
