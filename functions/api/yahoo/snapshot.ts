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
    quotes[symbol] = q;
    parsedCount++;
    if (row.updated_at > mostRecent) mostRecent = row.updated_at;
  }

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
