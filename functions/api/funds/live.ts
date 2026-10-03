/**
 * /api/funds/live — Canli Yatirim Fonu verisi (NAV + tum period getirileri).
 *
 * Kaynak: fvt.com.tr/api/funds (public JSON endpoint — default YAT fonlari).
 * TEFAS scraper'in GitHub Actions pipeline'i period returns null donduyordu
 * (1d hariç hepsi null, history=[]). FVT ayni data'yi eksiksiz veriyor:
 *   - haftalikGetiri, aylikGetiri, ucAylikGetiri, altiAylikGetiri
 *   - ytdGetiri, birYillikGetiri, ucYillikGetiri, besYillikGetiri
 *   - fiyat, kategori, fonTipi, risk, sharpe, beta, sortino
 *
 * Response: ~3278 yatirim fonu + tum period getirileri.
 * TefasFeed-compatible format — frontend'in fetchTefasFeed'i bunu kullanabilir.
 *
 * Edge cache: 15 dk piyasa acikken, 4 saat kapaliyken.
 */

interface Env {}

interface FvtFund {
  id: number;
  fonKodu: string;
  fonAdi: string;
  fiyat: string;
  getiri: string;             // 1d
  kategori: string;
  fonTipi: string;
  risk: string;
  yonetimUcret: string;
  sharpe: string;
  beta: string;
  sortino: string;
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
  // FVT boolean flag'leri
  bes: number;
  hisse: number;
  katilim: number;
  serbest: number;
  doviz: number;
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
 * Fon tipini normalize et — FundsPage frontend `category` field'ini kullanıyor:
 *   Hisse Senedi | Borçlanma Araçları | Katılım | Altın | Para Piyasası |
 *   Değişken | Karma | Fon Sepeti | Serbest | Döviz | Kıymetli Maden | Emtia | Diğer
 */
function normalizeCategory(f: FvtFund): string {
  // FVT boolean flag'leri önce (en spesifik):
  if (f.bes) return 'Emeklilik';
  if (f.serbest) return 'Serbest';
  if (f.hisse) return 'Hisse Senedi';
  if (f.katilim) return 'Katılım';
  if (f.doviz) return 'Döviz';

  // String tabanli — fonTipi/kategori icinde arama
  const label = `${f.fonTipi ?? ''} ${f.kategori ?? ''}`.toLocaleLowerCase('tr-TR');
  if (/altın/.test(label)) return 'Altın';
  if (/gümüş|platin|kıymetli maden/.test(label)) return 'Kıymetli Maden';
  if (/emtia/.test(label)) return 'Emtia';
  if (/para piyasası/.test(label)) return 'Para Piyasası';
  if (/borçlanma|tahvil|bono/.test(label)) return 'Borçlanma Araçları';
  if (/fon sepeti/.test(label)) return 'Fon Sepeti';
  if (/karma/.test(label)) return 'Karma';
  if (/değişken/.test(label)) return 'Değişken';
  if (/hisse/.test(label)) return 'Hisse Senedi';
  if (/katılım/.test(label)) return 'Katılım';
  return 'Diğer';
}

/**
 * FVT fund → TefasFundData shape (frontend tefasGithub.ts bekliyor).
 */
function normalizeFund(f: FvtFund) {
  const nav = toNum(f.fiyat);
  return {
    code: f.fonKodu?.toUpperCase() ?? '',
    name: f.fonAdi ?? '',
    category: normalizeCategory(f),
    tefasOpen: true,                        // FVT yat default is TEFAS acik
    befasOpen: !!f.bes,
    nav: nav && nav > 0 ? nav : 0,
    date: f.sonGuncelleme ?? new Date().toISOString(),
    marketCap: toNum(f.toplamDeger) ?? undefined,
    investorCount: toNum(f.yatirimci) ?? undefined,
    returns: {
      '1d':  toNum(f.getiri),
      '1w':  toNum(f.haftalikGetiri),
      '1m':  toNum(f.aylikGetiri),
      '3m':  toNum(f.ucAylikGetiri),
      '6m':  toNum(f.altiAylikGetiri),
      ytd:   toNum(f.ytdGetiri),
      '1y':  toNum(f.birYillikGetiri),
    },
    history: [] as Array<{ date: string; price: number }>,  // Period getiriler zaten dolu; history on-demand
    riskValue: toNum(f.risk) ?? undefined,
    managementFeeYearly: toNum(f.yonetimUcret) ?? undefined,
    publicOfferDate: f.halkaArzTarihi ?? undefined,
    isin: f.isinKodu ?? undefined,
  };
}

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  // Versioned cache key — v1 bump edilince eski cache temizlenir
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cv', '1');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached && cached.ok) return cached;
  }

  // FVT'ye browser-like istek — default YAT fonlari (3278 adet)
  const fvtUrl = 'https://fvt.com.tr/api/funds?limit=5000&sortOrder=DESC&viewMode=getiri&page=1';
  try {
    const r = await fetch(fvtUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Referer': 'https://fvt.com.tr/fonlar/yatirim-fonlari',
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

    // Frontend bekleniyor shape: { updatedAt, count, funds }
    const body = {
      updatedAt: j.timestamp ?? new Date().toISOString(),
      count: funds.length,
      source: 'fvt.com.tr',
      attribution: 'Veri kaynağı: fvt.com.tr — bilgilendirme amaçlıdır, yatırım tavsiyesi değildir.',
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
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=3600`,
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
