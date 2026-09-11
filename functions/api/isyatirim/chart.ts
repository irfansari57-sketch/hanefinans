/**
 * /api/isyatirim/chart — BIST endeks + hisse historical chart data
 *
 * Kurumsal aglarda Yahoo Finance genelde bloklu (query1.finance.yahoo.com).
 * Bu endpoint Is Yatirim'in resmi historical endpoint'ini proxy'ler:
 *   - Endeks: IndexHistoricalAll (XU100, XU030, XUSIN, XUMAL, XUTUM, XBANK, XU100D vs.)
 *   - Hisse: StockHistoricalAll (FROTO, THYAO, GARAN vs.)
 *
 * Query params:
 *   ?symbol=XU100          # veya FROTO, XU030, XBANK, etc.
 *   &range=1mo|3mo|6mo|1y|ytd  (default 1mo)
 *
 * Response: { ok: true, bars: [{ date: number, close: number }], source: 'isyatirim' }
 *
 * Edge cache: 5 dakika (piyasa saatlerinde), 6 saat (kapali).
 */

interface Env {}

type Range = '1mo' | '3mo' | '6mo' | '1y' | 'ytd';

interface IsYatirimChartResponse {
  data?: Array<[number, number]>; // [ts_ms, close]
}

function formatTimestamp(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

/** BIST endeks kodu mu? XU100 / XU030 / XUSIN / XUMAL / XBANK / XU100D vs. */
function isIndex(symbol: string): boolean {
  // 3-5 harf sonrasi endeks (XU100, XBANK, XUSIN, XUMAL, XUTUM, XU030)
  return /^X[A-Z0-9]{3,5}$/i.test(symbol) && !isViop(symbol);
}

/** VIOP kontrat kodu mu? XU030DV2026, XU100DV2026 gibi vadeli endeks kontratlari */
function isViop(symbol: string): boolean {
  return /DV\d{4}$/i.test(symbol);
}

function rangeToStartDate(range: Range, now: Date): Date {
  const start = new Date(now);
  switch (range) {
    case '1mo': start.setMonth(start.getMonth() - 1); break;
    case '3mo': start.setMonth(start.getMonth() - 3); break;
    case '6mo': start.setMonth(start.getMonth() - 6); break;
    case '1y':  start.setFullYear(start.getFullYear() - 1); break;
    case 'ytd': start.setMonth(0); start.setDate(1); break;
  }
  start.setHours(0, 0, 0, 0);
  return start;
}

async function tryEndpoint(
  base: string,
  paramName: string,
  sym: string,
  fromStr: string,
  toStr: string,
): Promise<Array<{ date: number; close: number }> | null> {
  const url = new URL(base);
  url.searchParams.set('period', '1440');
  url.searchParams.set('from', fromStr);
  url.searchParams.set('to', toStr);
  url.searchParams.set(paramName, sym);
  try {
    const resp = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/default.aspx',
      },
      cf: { cacheTtl: 900, cacheEverything: true } as RequestInitCfProperties,
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    if (!text || text.length < 10) return null;
    let parsed: IsYatirimChartResponse;
    try {
      parsed = JSON.parse(text) as IsYatirimChartResponse;
    } catch {
      return null;
    }
    const rows = (parsed.data ?? []).filter(
      (r) => Array.isArray(r) && r.length >= 2 && Number.isFinite(r[1]) && r[1] > 0,
    );
    if (rows.length === 0) return null;
    rows.sort((a, b) => a[0] - b[0]);
    return rows.map((r) => ({ date: r[0], close: r[1] }));
  } catch {
    return null;
  }
}

async function fetchIsYatirim(symbol: string, range: Range): Promise<Array<{ date: number; close: number }> | null> {
  const sym = symbol.replace(/\.IS$/i, '').toUpperCase();
  const now = new Date();
  const start = rangeToStartDate(range, now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 0);
  const fromStr = formatTimestamp(start);
  const toStr = formatTimestamp(end);

  const BASE_INDEX = 'https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/IndexHistoricalAll';
  const BASE_STOCK = 'https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/StockHistoricalAll';
  const BASE_VIOP  = 'https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/ViopHistoricalAll';

  // VIOP kontrati: onceligi Viop, sonra Stock (bazi tanimlarda viop de hisse gibi indekslenir)
  if (isViop(sym)) {
    return (await tryEndpoint(BASE_VIOP, 'viop', sym, fromStr, toStr))
      ?? (await tryEndpoint(BASE_STOCK, 'hisse', sym, fromStr, toStr))
      ?? (await tryEndpoint(BASE_INDEX, 'endeks', sym, fromStr, toStr));
  }
  // Endeks: birincil IndexHistoricalAll
  if (isIndex(sym)) {
    return await tryEndpoint(BASE_INDEX, 'endeks', sym, fromStr, toStr);
  }
  // Hisse: birincil StockHistoricalAll
  return await tryEndpoint(BASE_STOCK, 'hisse', sym, fromStr, toStr);
}

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol')?.trim();
  const rangeRaw = (url.searchParams.get('range') ?? '1mo').toLowerCase();
  const validRanges: Range[] = ['1mo', '3mo', '6mo', '1y', 'ytd'];
  const range: Range = (validRanges.includes(rangeRaw as Range) ? rangeRaw : '1mo') as Range;

  if (!symbol) {
    return new Response(JSON.stringify({ ok: false, error: 'symbol required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const bars = await fetchIsYatirim(symbol, range);
  if (!bars) {
    return new Response(JSON.stringify({ ok: false, error: 'no data', symbol, range }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // TTL sirasi:
  //   - 1mo/3mo/YTD gunluk kapanislar - degismeyen historical - 15 dk cache
  //   - 6mo/1y daha uzun - degisken az - 30 dk
  //   Browser cache 5dk (kullanici scroll ederken tazelenmez) + CDN 15-30dk.
  const maxAge = range === '6mo' || range === '1y' ? 1800 : 900;
  return new Response(
    JSON.stringify({ ok: true, source: 'isyatirim', symbol: symbol.toUpperCase(), range, bars }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // s-maxage CDN icin, max-age browser icin (kucuk), SWR ile stale kalabilir 1sa
        'Cache-Control': `public, max-age=300, s-maxage=${maxAge}, stale-while-revalidate=3600`,
      },
    },
  );
};
