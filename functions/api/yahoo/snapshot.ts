/**
 * /api/yahoo/snapshot — toplu quote endpoint
 *
 * Tek HTTP isteyle tüm sembollerin son quote'unu D1 cache'den döner.
 * Frontend 819 ayrı request yerine 1 request atar → ilk render saniyeler içinde.
 *
 * Quote için kullanılan cache key: `${symbol}:5d:1d` (tatil/hafta sonu fix sonrası)
 * Eski cache key `${symbol}:2d:1d` da fallback olarak okunur.
 *
 * Format: { ok: true, updatedAt: <ms>, quotes: { SYMBOL: { price, changePct, prev, updatedAt } } }
 */

interface Env {
  DB?: D1Database;
}

interface QuoteOut {
  price: number;
  changePct: number;
  prev: number;
  updatedAt: number;
  name?: string;
  /** Veri kaynagi - default 'yahoo'. BIST endeksleri 'isyatirim' olabilir. */
  source?: 'yahoo' | 'isyatirim';
  /** Verinin gosterdigi seans tarihi (YYYY-MM-DD). Hafta sonu 'son acik gun' anlami. */
  asOf?: string;
}

// ===========================================================================
// IS YATIRIM ENDEKS FEED — BIST endeksleri icin birincil kaynak (Yahoo bug fix)
// ===========================================================================
//
// Endpoint: isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/IndexHistoricalAll
//   ?period=1440&from=YYYYMMDDhhmmss&to=YYYYMMDDhhmmss&endeks=XU100
//
// Response: { data: [[timestamp_ms, close], ...] }
//   - data[i][0]: epoch ms
//   - data[i][1]: o gunun kapanis degeri
//
// urazakgul/isyatirimhisse Python wrapper kaynak kodu (FetchIndexData.py):
//   BASE_URL_INDEX = "https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/IndexHistoricalAll"
//   url = f"{BASE_URL_INDEX}?period=1440&from={start}&to={end}&endeks={idx}"
//
// 20 Hazi 2026'da canli dogrulandi: XU100=14734.50 (-%0.63), XU030=17019.86 (-%0.63)
interface IsYatirimChartResponse {
  data?: Array<[number, number]>; // [ts_ms, close]
  timestamp?: string;
}

function formatTimestampForIsYatirim(d: Date): string {
  // YYYYMMDDhhmmss
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

async function fetchIsYatirimIndex(
  symbol: string,
): Promise<{ price: number; prev: number; updatedAt: number; asOf: string } | null> {
  // ".IS" sufix temizle (XU100.IS -> XU100)
  const sym = symbol.replace(/\.IS$/i, '').toUpperCase();
  const now = new Date();
  const start = new Date(now);
  // 14 gun geriye - en az 2 islem gunu yakalamaya yeter (hafta sonu + tatil dahil)
  start.setDate(start.getDate() - 14);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 0);

  const url = new URL(
    'https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/IndexHistoricalAll',
  );
  url.searchParams.set('period', '1440'); // 1440 dakika = gunluk
  url.searchParams.set('from', formatTimestampForIsYatirim(start));
  url.searchParams.set('to', formatTimestampForIsYatirim(end));
  url.searchParams.set('endeks', sym);

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/default.aspx',
      },
      // 5 dakika edge cache yeterli
      cf: { cacheTtl: 300, cacheEverything: true } as RequestInitCfProperties,
    });
    if (!resp.ok) {
      console.warn(`[isYatirim] ${sym} HTTP ${resp.status}`);
      return null;
    }
    const text = await resp.text();
    if (!text || text.length < 10) return null;
    let parsed: IsYatirimChartResponse;
    try {
      parsed = JSON.parse(text) as IsYatirimChartResponse;
    } catch {
      console.warn(`[isYatirim] ${sym} non-JSON: ${text.slice(0, 80)}`);
      return null;
    }
    const rows = (parsed.data ?? []).filter(
      (r) => Array.isArray(r) && r.length >= 2 && Number.isFinite(r[1]) && r[1] > 0,
    );
    if (rows.length === 0) return null;

    // Zaten timestamp sirasi geliyor ama emin olalim
    rows.sort((a, b) => a[0] - b[0]);
    const last = rows[rows.length - 1];
    const prev = rows.length >= 2 ? rows[rows.length - 2] : last;
    return {
      price: last[1],
      prev: prev[1],
      updatedAt: last[0] || Date.now(),
      asOf: new Date(last[0]).toISOString().slice(0, 10),
    };
  } catch (e) {
    console.warn(`[isYatirim] ${sym} fail:`, e);
    return null;
  }
}

interface YahooChartResult {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        regularMarketTime?: number;
        shortName?: string;
        longName?: string;
      };
      indicators?: {
        quote?: Array<{ close?: (number | null)[] }>;
      };
    }>;
  };
}

/**
 * BIST endeksleri (XU100, XU030, XUSIN, XUMAL, XUTUM...) icin gunluk
 * degisim genellikle %5'i gecmez. Yahoo bazen yanlis previousClose ile
 * +6%, +7% gibi yanlis degerler donduruyor. Bu sembollerde sanity check
 * yapariz.
 */
function isBistIndex(symbol: string | undefined): boolean {
  if (!symbol) return false;
  return /^XU\d{3}/i.test(symbol) || symbol.startsWith('^XU');
}

function parseYahooBody(body: string, symbolHint?: string): { price: number; changePct: number; prev: number; updatedAt: number; name?: string } | null {
  try {
    const json = JSON.parse(body) as YahooChartResult;
    const result = json.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const validCloses: number[] = [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (c != null && Number.isFinite(c) && (c as number) > 0) validCloses.push(c as number);
      if (validCloses.length >= 2) break;
    }

    let price: number | undefined = meta.regularMarketPrice;
    if (price == null && validCloses.length > 0) price = validCloses[0];
    if (price == null || !Number.isFinite(price) || price <= 0) return null;

    // PREV CLOSE SECIMI — onceligi meta.previousClose'a ver
    //
    // Yahoo'da meta.previousClose her zaman "bir onceki tamamlanmis seans kapanisi"ni
    // verir. BU EN GUVENILIR FIELD'dir.
    //
    // BIST endeksleri (XU100, XU030) icin onceki kod yanlistı:
    // closes array'inde son 2 valid close alip beforeClose'u baz aliyordu.
    // Ama Yahoo'da closes[-2] bazen cok eski bir gun olabiliyor (hafta sonu
    // sonrasi, tatil sonrasi vb.) — bu durumda yanlis prev secilip
    // changePct +2-3% gibi yanlis cikiyordu (gercek -0.63% iken).
    //
    // Sıralama:
    //   1) meta.previousClose (Yahoo'nun resmi alanı)
    //   2) meta.chartPreviousClose (fallback)
    //   3) validCloses[1] (closes array son 2'sinden bir oncesi)
    //   4) price (last resort, changePct=0)
    let prev: number;
    if (meta.previousClose && meta.previousClose > 0) {
      prev = meta.previousClose;
    } else if (meta.chartPreviousClose && meta.chartPreviousClose > 0) {
      prev = meta.chartPreviousClose;
    } else if (validCloses.length >= 2) {
      const lastClose = validCloses[0];
      const beforeClose = validCloses[1];
      // Eger price ~ lastClose ise (piyasa kapali, son close yeni), beforeClose'a dus.
      // Aksi durumda lastClose son tamamlanmis kapanistir, prev=lastClose.
      const pctDiff = Math.abs(price - lastClose) / lastClose;
      prev = pctDiff < 0.001 ? beforeClose : lastClose;
    } else {
      prev = price;
    }
    let changePct = prev > 0 && prev !== price ? ((price - prev) / prev) * 100 : 0;

    // BIST endeksi sanity check — gunluk |%5|'i gecen degisim Yahoo veri hatasi
    // ihtimali yuksek. Fallback'leri sirayla dene; hala absurd ise 0 don.
    if (isBistIndex(symbolHint) && Math.abs(changePct) > 5) {
      let altPrev: number | undefined;
      // 1) chartPreviousClose dene
      if (meta.chartPreviousClose && meta.chartPreviousClose > 0) {
        const pct = Math.abs((price - meta.chartPreviousClose) / meta.chartPreviousClose) * 100;
        if (pct <= 5) altPrev = meta.chartPreviousClose;
      }
      // 2) validCloses[1] dene (eger varsa)
      if (altPrev === undefined && validCloses.length >= 2) {
        const c1 = validCloses[1];
        const pct = Math.abs((price - c1) / c1) * 100;
        if (pct <= 5) altPrev = c1;
      }
      if (altPrev !== undefined) {
        prev = altPrev;
        changePct = ((price - prev) / prev) * 100;
      } else {
        // Hicbir gecerli prev bulunamadi — gunluk degisim gosterilemez
        prev = price;
        changePct = 0;
      }
    }

    const updatedAt = meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now();
    return { price, changePct, prev, updatedAt, name: meta.shortName ?? meta.longName };
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Quote cache keys: ":5d:1d" suffix (yeni). Legacy 2d:1d'yi skip — tatil/kapali piyasa
  // verilerinde changePct=0 dondurup frontend'i mock'a dusururdu.
  const rows = await env.DB
    .prepare(
      `SELECT key, payload, updated_at FROM yahoo_cache
       WHERE key LIKE '%:5d:1d'
       ORDER BY updated_at DESC`,
    )
    .all<{ key: string; payload: string; updated_at: number }>();

  const quotes: Record<string, QuoteOut> = {};
  const seen = new Set<string>();
  let parsedCount = 0;
  let mostRecent = 0;

  for (const row of rows.results ?? []) {
    // key format: "SYMBOL:5d:1d" or "SYMBOL:2d:1d"
    const colonIdx = row.key.indexOf(':');
    if (colonIdx < 0) continue;
    const symbol = row.key.slice(0, colonIdx);
    if (seen.has(symbol)) continue; // ORDER BY desc => en yenisini al
    seen.add(symbol);

    const q = parseYahooBody(row.payload, symbol);
    if (!q) continue;
    quotes[symbol] = { ...q, source: 'yahoo' };
    parsedCount++;
    if (row.updated_at > mostRecent) mostRecent = row.updated_at;
  }

  // -------------------------------------------------------------------------
  // BIST ENDEKS OVERRIDE (Paket A): Yahoo previousClose bug fix
  //
  // XU100/XU030/... icin Yahoo'nun verdigi degisim genelde yanlis. Is Yatirim
  // HisseTekil endpoint'inden ayni endeksin son 2 kapanisini cekip Yahoo'nun
  // entry'sini override ederiz. Yahoo'nun price'ini sanity check icin tutariz
  // (eger %2'den fazla farkliysa logla - paket B'de fallback chain icin).
  // -------------------------------------------------------------------------
  const BIST_INDEX_SYMBOLS = ['XU100.IS', 'XU030.IS', 'XUSIN.IS', 'XUMAL.IS', 'XUTUM.IS'];
  // Paralel fetch (en kotu senaryo 5 sembol x ~500ms cf-cache miss = 2.5s,
  // tipik durum ~50ms cf-cache hit)
  await Promise.all(
    BIST_INDEX_SYMBOLS.map(async (symbol) => {
      try {
        const iy = await fetchIsYatirimIndex(symbol);
        if (!iy) return; // Is Yatirim cevap vermezse Yahoo entry'si kalir
        const yahoo = quotes[symbol];
        // Sanity log - %2+ fiyat farki problem isareti
        if (yahoo && yahoo.price > 0) {
          const diff = Math.abs(iy.price - yahoo.price) / yahoo.price;
          if (diff > 0.02) {
            console.warn(
              `[snapshot] ${symbol} Yahoo/IsYatirim %${(diff * 100).toFixed(2)} fark`,
              { yahoo: yahoo.price, isYatirim: iy.price },
            );
          }
        }
        const changePct = iy.prev > 0 && iy.prev !== iy.price
          ? ((iy.price - iy.prev) / iy.prev) * 100
          : 0;
        quotes[symbol] = {
          price: iy.price,
          prev: iy.prev,
          changePct,
          updatedAt: iy.updatedAt,
          name: yahoo?.name ?? symbol.replace(/\.IS$/i, ''),
          source: 'isyatirim',
          asOf: iy.asOf,
        };
        // Eger Yahoo entry'si yoksa parsedCount'a ekle
        if (!yahoo) parsedCount++;
      } catch (e) {
        // Network/parse hatasi - Yahoo entry'si yedek olarak kalir
        console.warn(`[snapshot] Is Yatirim fetch fail for ${symbol}:`, e);
      }
    }),
  );

  return new Response(
    JSON.stringify({
      ok: true,
      count: parsedCount,
      updatedAt: mostRecent,
      quotes,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
      },
    },
  );
};
