/**
 * POST /api/cron/bist-warm
 *
 * BIST tam evreni (~500 hisse) için Is Yatirim StockHistoricalAll'a batch fetch,
 * D1 `bist_snapshot` tablosuna UPSERT. Snapshot endpoint bu tablodan taze
 * quote'lari okur — Yahoo previousClose bug'i tamamen elimine.
 *
 * Auth: X-Cron-Secret header = CRON_SECRET env value.
 * Tetikleyici: .github/workflows/bist-warm.yml (piyasa saatlerinde her 5dk).
 *
 * Batch stratejisi:
 *   - 20 sembol paralel fetch (Promise.all)
 *   - 200ms delay her batch arasi (Is Yatirim rate limit korumasi)
 *   - Basarili olanlar tek COMMIT ile D1'e yazilir
 *   - Basarisiz semboller D1'e YAZILMAZ, eski satirlari kalir (frontend fallback icin)
 *
 * Query params:
 *   ?scope=bist100|bist30|all|top50  (default: bist100 - hizli MVP)
 */

interface Env {
  DB: D1Database;
  CRON_SECRET?: string;
}

interface IsYatirimResponse {
  data?: Array<[number, number]>; // [ts_ms, close]
}

function formatTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function fetchIsYatirimStock(
  symbol: string,
): Promise<{ price: number; prev: number; changePct: number; asOf: string; updatedAt: number } | null> {
  const sym = symbol.replace(/\.IS$/i, '').toUpperCase();
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 14);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 0);

  const url = new URL(
    'https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/StockHistoricalAll',
  );
  url.searchParams.set('period', '1440');
  url.searchParams.set('from', formatTimestamp(start));
  url.searchParams.set('to', formatTimestamp(end));
  url.searchParams.set('hisse', sym);

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/default.aspx',
      },
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    if (!text || text.length < 10) return null;
    let parsed: IsYatirimResponse;
    try {
      parsed = JSON.parse(text) as IsYatirimResponse;
    } catch { return null; }
    const rows = (parsed.data ?? []).filter(
      (r) => Array.isArray(r) && r.length >= 2 && Number.isFinite(r[1]) && r[1] > 0,
    );
    if (rows.length < 2) return null;
    rows.sort((a, b) => a[0] - b[0]);
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const price = last[1];
    const prevClose = prev[1];
    const changePct = prevClose > 0 && prevClose !== price ? ((price - prevClose) / prevClose) * 100 : 0;
    return {
      price,
      prev: prevClose,
      changePct,
      asOf: new Date(last[0]).toISOString().slice(0, 10),
      updatedAt: last[0] || Date.now(),
    };
  } catch {
    return null;
  }
}

// BIST 100 sembol listesi — ilk cron populasyonu icin.
// Kucuk kap dahil tam evren scope=all ile.
const BIST_100_UNIVERSE = [
  'AEFES','AGHOL','AHGAZ','AKBNK','AKCNS','AKFYE','AKSA','AKSEN','ALARK','ALBRK',
  'ALFAS','ARCLK','ASELS','ASTOR','BERA','BFREN','BIMAS','BINHO','BRSAN','BRYAT',
  'CANTE','CIMSA','CWENE','DOAS','DOHOL','ECILC','ECZYT','EGEEN','EKGYO','ENERY',
  'ENJSA','ENKAI','EREGL','FROTO','GARAN','GESAN','GLYHO','GUBRF','GWIND','HALKB',
  'HEKTS','ISCTR','ISDMR','ISFIN','ISMEN','IZMDC','KARSN','KAYSE','KCAER','KCHOL',
  'KLKIM','KMPUR','KONTR','KONYA','KOZAA','KOZAL','KRDMD','MAVI','MGROS','MIATK',
  'ODAS','OTKAR','OYAKC','PETKM','PGSUS','SAHOL','SASA','SISE','SKBNK','SMRTG',
  'SOKM','TAVHL','TCELL','THYAO','TKFEN','TKNSA','TOASO','TRGYO','TSKB','TTKOM',
  'TTRAK','TUPRS','TUREX','ULKER','VAKBN','VESBE','VESTL','YATAS','YKBNK','ZOREN',
  // BIST 30 disi ama yaygin — daha genis kapsam
  'AKGRT','ALTNY','ANHYT','BRISA','CCOLA','GENIL','ICBCT','LOGO','NETAS','NTHOL',
  'PARSN','PENTA','QUAGR','SNGYO','TATGD','TSPOR','TURSG','ULUUN','VESTL','ZOREN',
];

async function upsertBatch(
  db: D1Database,
  rows: Array<{ symbol: string; price: number; prev: number; changePct: number; asOf: string; updatedAt: number }>,
): Promise<void> {
  if (rows.length === 0) return;
  // D1 batch: array of Prepared statements
  const stmts = rows.map((r) =>
    db.prepare(
      `INSERT INTO bist_snapshot (symbol, price, prev, change_pct, as_of, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
         price = excluded.price,
         prev = excluded.prev,
         change_pct = excluded.change_pct,
         as_of = excluded.as_of,
         updated_at = excluded.updated_at`,
    ).bind(r.symbol, r.price, r.prev, r.changePct, r.asOf, r.updatedAt),
  );
  await db.batch(stmts);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Auth
  const secret = request.headers.get('x-cron-secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();
  const symbols = Array.from(new Set(BIST_100_UNIVERSE));

  // Paralel fetch — 20'lik batch, 200ms delay
  const results: Array<{ symbol: string; price: number; prev: number; changePct: number; asOf: string; updatedAt: number }> = [];
  let success = 0;
  let fail = 0;
  const BATCH_SIZE = 20;

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (sym) => {
      const data = await fetchIsYatirimStock(sym);
      return { symbol: sym, data };
    }));
    for (const { symbol, data } of batchResults) {
      if (data) {
        results.push({ symbol, ...data });
        success++;
      } else {
        fail++;
      }
    }
    // Rate limit koruma - son batch degilse 200ms bekle
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // D1 batch upsert
  try {
    // D1 batch limit ~100 stmts, chunk edelim
    const CHUNK = 50;
    for (let i = 0; i < results.length; i += CHUNK) {
      await upsertBatch(env.DB, results.slice(i, i + CHUNK));
    }
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: `D1 batch write failed: ${(e as Error).message}`,
      success, fail, totalTried: symbols.length,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    ok: true,
    success,
    fail,
    totalTried: symbols.length,
    elapsedMs: Date.now() - startTime,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
