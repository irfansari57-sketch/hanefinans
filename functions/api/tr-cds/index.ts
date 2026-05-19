/**
 * Cloudflare Pages Function — Türkiye 5Y CDS spread (v3).
 *
 * v3 farkları:
 *   • PRIMARY pattern: "value stands at NNN.NN basis points" — sayfadaki
 *     otomatik açıklama paragrafının değişmez ifadesi. Çok güvenilir.
 *   • SECONDARY: "TURKEY - 5 Years CDS" başlığından sonra ilk büyük
 *     decimal sayı (ör. 243.63)
 *   • Tablo parser ayrı, history için kullanılır
 *   • Sanity: 50-1500 bps, 2000-2050 yıl reddi
 *
 * Doğrulama: 19 May 2026'da gerçek değer 243.63 idi, parser bunu yakalamalı.
 */

interface CdsHistoryPoint { date: string; value: number; }

interface CdsResponse {
  ok: boolean;
  value?: number;
  changePct?: number;        // gün/ay/yıl bazlı page-derived (mümkünse)
  changeAbs?: number;
  changeWindow?: string;     // "1 day" | "1 month" gibi (page'den)
  updatedAt: string;
  asOfDate?: string;         // "19 May 2026 13:45 GMT+0" gibi
  history?: CdsHistoryPoint[];
  source: string;
  error?: string;
  parser?: string;
}

const SOURCE_URL = 'http://www.worldgovernmentbonds.com/cds-historical-data/turkey/5-years/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function jsonResponse(data: CdsResponse, status = 200, ttlSec = 1800): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${ttlSec}`,
    },
  });
}

function normalizeDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function isPlausibleCdsValue(v: number): boolean {
  if (!Number.isFinite(v)) return false;
  if (v < 50 || v > 1500) return false;
  if (v >= 2000 && v <= 2050) return false; // yıl
  return true;
}

/** "▲ 2.82 %" → 2.82 ; "▼ 1.50 %" → -1.50  */
function parseChangeIndicator(html: string): { pct: number; window?: string } | null {
  // "▲ 2.82 %" veya benzeri + en yakın "1 month/day/year/week"
  const re = /([▲▼])\s*(\d+(?:[.,]\d+)?)\s*%[\s\S]{0,80}?(\d+\s*(?:day|month|year|week)s?)/i;
  const m = html.match(re);
  if (m) {
    const sign = m[1] === '▼' ? -1 : 1;
    const val = parseFloat(m[2].replace(',', '.'));
    return Number.isFinite(val) ? { pct: sign * val, window: m[3].toLowerCase() } : null;
  }
  return null;
}

function parseAsOfDate(html: string): string | undefined {
  // "Last Update: 19 May 2026 13:45 GMT+0"
  const m = html.match(/Last\s*Update:?\s*([0-9]{1,2}\s+[A-Za-zçşğüöıİ]+\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*GMT[+-]?\d*)?)?)/i);
  return m ? m[1].trim() : undefined;
}

export const onRequest: PagesFunction = async ({ request }) => {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    if (!res.ok) {
      return jsonResponse({
        ok: false,
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
        error: `Source HTTP ${res.status}`,
      }, 502, 60);
    }
    const html = await res.text();

    let value: number | undefined;
    let parser = 'unknown';

    // --- PRIMARY: "value stands at NNN.NN basis points" ---
    // Sayfanın otomatik açıklamasında her zaman var, değişmez.
    const standsAt = html.match(/value\s+stands\s+at\s*<?[^>]*>?\s*([\d]+(?:[.,]\d+)?)\s*<?[^>]*>?\s*basis\s+points/i);
    if (standsAt) {
      const num = parseFloat(standsAt[1].replace(',', '.'));
      if (isPlausibleCdsValue(num)) {
        value = num;
        parser = 'stands-at';
      }
    }

    // --- SECONDARY: TURKEY 5 Years CDS başlığından sonra ilk büyük decimal ---
    if (value == null) {
      const headerIdx = html.search(/TURKEY[^<]*-?\s*5\s*Years?\s*CDS/i);
      if (headerIdx >= 0) {
        const window = html.slice(headerIdx, headerIdx + 1500);
        // En az 1 ondalık olmalı (243.63 OK, 2023 değil — ama 2023.00 yine elenir sanity ile)
        const m = window.match(/>\s*(\d{2,4}\.\d{1,4})\s*</);
        if (m) {
          const num = parseFloat(m[1]);
          if (isPlausibleCdsValue(num)) {
            value = num;
            parser = 'header-window';
          }
        }
      }
    }

    // --- History tablosu ---
    const history: CdsHistoryPoint[] = [];
    const rowRe = /<tr[^>]*>\s*<td[^>]*>\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d]+(?:[.,]\d+)?)/g;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(html)) !== null) {
      const iso = normalizeDate(rm[1]);
      const v = parseFloat(rm[2].replace(',', '.'));
      if (iso && isPlausibleCdsValue(v)) {
        history.push({ date: iso, value: v });
      }
      if (history.length > 1000) break;
    }
    history.sort((a, b) => a.date.localeCompare(b.date));

    // History varsa ve PRIMARY parser çalışmadıysa son satırı al
    if (value == null && history.length > 0) {
      value = history[history.length - 1].value;
      parser = 'history-last';
    }

    if (value == null) {
      return jsonResponse({
        ok: false,
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
        error: 'CDS değeri bulunamadı (stands-at + header-window + history hiçbiri eşleşmedi)',
      }, 502, 60);
    }

    // Page-derived change indicator (▲ 2.82 % 1 month)
    const ind = parseChangeIndicator(html);

    // History'den gün bazlı change (varsa)
    let changeAbs: number | undefined;
    let changePct: number | undefined;
    let changeWindow: string | undefined;
    if (history.length >= 2) {
      const last = history[history.length - 1];
      const prev = history[history.length - 2];
      changeAbs = last.value - prev.value;
      changePct = (changeAbs / prev.value) * 100;
      changeWindow = '1 day';
    } else if (ind) {
      changePct = ind.pct;
      changeWindow = ind.window;
    }

    const data: CdsResponse = {
      ok: true,
      value,
      changeAbs,
      changePct,
      changeWindow,
      asOfDate: parseAsOfDate(html),
      updatedAt: new Date().toISOString(),
      history: history.length ? history.slice(-365) : undefined,
      source: 'worldgovernmentbonds.com',
      parser,
    };

    const response = jsonResponse(data, 200, 1800);
    await cache.put(cacheKey, response.clone());
    return response;
  } catch (e) {
    return jsonResponse({
      ok: false,
      updatedAt: new Date().toISOString(),
      source: SOURCE_URL,
      error: (e as Error).message,
    }, 500, 30);
  }
};
