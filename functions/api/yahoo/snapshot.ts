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
// Endpoint: isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil
//   ?hisse=XU100&startdate=DD-MM-YYYY&enddate=DD-MM-YYYY
//
// Response: { value: [{ HGDG_TARIH, HGDG_KAPANIS, HGDG_AOF, ... }, ...] }
//   - HGDG_TARIH formati: "13-06-2026" (DD-MM-YYYY) - kontrol icin
//   - HGDG_KAPANIS: gunun kapanis degeri
//
// Auth yok, rate limit yumusak. Yahoo'nun previousClose bug'ini ozellikle
// BIST endekslerinde tetikledigi icin sadece BIST endekslerinde kullaniriz.
// Yahoo backup kalsin (sanity check + diger semboller).
interface IsYatirimRow {
  HGDG_TARIH?: string;
  HGDG_KAPANIS?: number;
}

interface IsYatirimResponse {
  value?: IsYatirimRow[];
}

function formatDateForIsYatirim(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** "DD-MM-YYYY" -> "YYYY-MM-DD" (ISO-like). Hatali girdi icin orijinali doner. */
function parseHgdgDate(s: string | undefined): string {
  if (!s) return '';
  const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s);
  if (!m) return s.slice(0, 10);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

async function fetchIsYatirimIndex(
  symbol: string,
): Promise<{ price: number; prev: number; updatedAt: number; asOf: string } | null> {
  // ".IS" sufix temizle (XU100.IS -> XU100)
  const sym = symbol.replace(/\.IS$/i, '').toUpperCase();
  const now = new Date();
  const startDate = new Date(now);
  // 10 gun geriye - en az 2 acik gun yakalamaya yeter (hafta sonu + tatil dahil)
  startDate.setDate(startDate.getDate() - 14);

  const url = new URL(
    'https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil',
  );
  url.searchParams.set('hisse', sym);
  url.searchParams.set('startdate', formatDateForIsYatirim(startDate));
  url.searchParams.set('enddate', formatDateForIsYatirim(now));

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; HaneFinans/1.0)',
      },
      // Cloudflare edge cache - 5 dakika yeterli (BIST seans saatlerinde bile)
      cf: { cacheTtl: 300, cacheEverything: true } as RequestInitCfProperties,
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as IsYatirimResponse;
    const rows = (data.value ?? []).filter(
      (r) => Number.isFinite(r.HGDG_KAPANIS) && (r.HGDG_KAPANIS as number) > 0,
    );
    if (rows.length === 0) return null;

    // Tarihe gore ascending sort - "DD-MM-YYYY" string compare yanlis olur,
    // o yuzden parseHgdgDate ile YYYY-MM-DD'e cevirip karsilastir.
    rows.sort((a, b) => parseHgdgDate(a.HGDG_TARIH).localeCompare(parseHgdgDate(b.HGDG_TARIH)));
    const last = rows[rows.length - 1];
    const prevRow = rows.length >= 2 ? rows[rows.length - 2] : last;
    return {
      price: last.HGDG_KAPANIS as number,
      prev: prevRow.HGDG_KAPANIS as number,
      updatedAt: Date.now(),
      asOf: parseHgdgDate(last.HGDG_TARIH),
    };
  } catch {
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
