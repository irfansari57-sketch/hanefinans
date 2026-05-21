/**
 * Cloudflare Pages Function — Türkiye 5Y CDS spread (v4).
 *
 * v4 farkları:
 *   • HTTPS önce denenir, başarısızsa HTTP fallback
 *   • ?debug=1 query parametresi → HTML snippet + pattern match raporu
 *   • Daha esnek "stands at" regex (boşluk/satır sonu toleranslı)
 *   • Üçüncü fallback: tablodaki ilk satırın direkt değeri (history boş bile olsa)
 *   • cf cache YOK (fetch'te) — Edge cache'i de v4 prefix'le ayır
 *
 * Doğrulama: 19 May 2026'da gerçek değer 243.63 idi, parser bunu yakalamalı.
 */

interface CdsHistoryPoint { date: string; value: number; }

interface CdsResponse {
  ok: boolean;
  value?: number;
  changePct?: number;
  changeAbs?: number;
  changeWindow?: string;
  updatedAt: string;
  asOfDate?: string;
  history?: CdsHistoryPoint[];
  source: string;
  error?: string;
  parser?: string;
  debug?: DebugReport;
}

interface DebugReport {
  fetchedUrl?: string;
  httpStatus?: number;
  htmlLength?: number;
  htmlHead?: string;       // ilk 800 char
  containsTurkey?: boolean;
  containsCds?: boolean;
  standsAtMatch?: string | null;
  headerWindowMatch?: string | null;
  rowMatches?: number;
  attempts: Array<{ url: string; ok: boolean; status?: number; error?: string }>;
}

const SOURCE_URL_HTTPS = 'https://www.worldgovernmentbonds.com/cds-historical-data/turkey/5-years/';
const SOURCE_URL_HTTP  = 'http://www.worldgovernmentbonds.com/cds-historical-data/turkey/5-years/';
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

function parseChangeIndicator(html: string): { pct: number; window?: string } | null {
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
  const m = html.match(/Last\s*Update:?\s*([0-9]{1,2}\s+[A-Za-zçşğüöıİ]+\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*GMT[+-]?\d*)?)?)/i);
  return m ? m[1].trim() : undefined;
}

/** Tek fetch deneme — explicit timeout ile. */
async function tryFetch(url: string, timeoutMs: number): Promise<{ ok: true; html: string; status: number } | { ok: false; status?: number; error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });
    if (!r.ok) return { ok: false, status: r.status, error: `HTTP ${r.status}` };
    const html = await r.text();
    return { ok: true, html, status: r.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'fetch error' };
  } finally {
    clearTimeout(timer);
  }
}

/** HTTPS → HTTP fallback, her biri 8 saniye timeout. Toplam max ~16s (Pages limit 30s). */
async function fetchSource(): Promise<{ html: string; url: string; status: number; attempts: DebugReport['attempts'] }> {
  const attempts: DebugReport['attempts'] = [];
  for (const url of [SOURCE_URL_HTTPS, SOURCE_URL_HTTP]) {
    const r = await tryFetch(url, 8000);
    if (r.ok) {
      attempts.push({ url, ok: true, status: r.status });
      return { html: r.html, url, status: r.status, attempts };
    }
    attempts.push({ url, ok: false, status: r.status, error: r.error });
  }
  throw new Error(`All fetch attempts failed: ${attempts.map((a) => `${a.url}=${a.error || a.status}`).join(' | ')}`);
}

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const debugMode = url.searchParams.get('debug') === '1';
  const noCache = debugMode || url.searchParams.get('refresh') === '1';

  const cache = caches.default;
  const cacheKey = new Request(url.toString().replace(/[?&]debug=\d+/, '').replace(/[?&]refresh=\d+/, ''), { method: 'GET' });
  if (!noCache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const debug: DebugReport = { attempts: [] };

  try {
    const { html, url: fetchedUrl, status, attempts } = await fetchSource();
    debug.fetchedUrl = fetchedUrl;
    debug.httpStatus = status;
    debug.htmlLength = html.length;
    debug.htmlHead = html.slice(0, 800);
    debug.containsTurkey = /TURKEY/i.test(html);
    debug.containsCds = /CDS|Credit\s*Default\s*Swap/i.test(html);
    debug.attempts = attempts;

    let value: number | undefined;
    let parser = 'unknown';

    // --- PRIMARY: "value stands at NNN.NN basis points" ---
    // Daha esnek: HTML tag'leri arasında olabilir, virgül/nokta toleranslı
    const standsAt = html.match(/value\s+stands\s+at[\s\S]{0,80}?(\d+(?:[.,]\d+)?)[\s\S]{0,40}?basis\s+points/i);
    debug.standsAtMatch = standsAt ? standsAt[0].slice(0, 200) : null;
    if (standsAt) {
      const num = parseFloat(standsAt[1].replace(',', '.'));
      if (isPlausibleCdsValue(num)) {
        value = num;
        parser = 'stands-at';
      }
    }

    // --- SECONDARY: TURKEY 5 Years CDS başlığından sonra ilk decimal ---
    if (value == null) {
      const headerIdx = html.search(/TURKEY[^<]{0,40}5\s*Years?\s*CDS/i);
      if (headerIdx >= 0) {
        const window = html.slice(headerIdx, headerIdx + 2000);
        debug.headerWindowMatch = window.slice(0, 300);
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
    debug.rowMatches = history.length;

    // History varsa ve PRIMARY parser çalışmadıysa son satırı al
    if (value == null && history.length > 0) {
      value = history[history.length - 1].value;
      parser = 'history-last';
    }

    // --- TERTIARY: tablodaki herhangi bir td'de geçen ilk büyük decimal ---
    if (value == null) {
      const anyDecimal = html.match(/<td[^>]*>\s*(\d{2,4}\.\d{1,4})\s*</);
      if (anyDecimal) {
        const num = parseFloat(anyDecimal[1]);
        if (isPlausibleCdsValue(num)) {
          value = num;
          parser = 'any-td-decimal';
        }
      }
    }

    if (value == null) {
      const errResponse: CdsResponse = {
        ok: false,
        updatedAt: new Date().toISOString(),
        source: fetchedUrl,
        error: 'CDS değeri bulunamadı (stands-at + header-window + history + any-td hiçbiri eşleşmedi)',
      };
      if (debugMode) errResponse.debug = debug;
      return jsonResponse(errResponse, 502, 60);
    }

    const ind = parseChangeIndicator(html);

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
    if (debugMode) data.debug = debug;

    const response = jsonResponse(data, 200, 1800);
    if (!debugMode) await cache.put(cacheKey, response.clone());
    return response;
  } catch (e) {
    const errResponse: CdsResponse = {
      ok: false,
      updatedAt: new Date().toISOString(),
      source: SOURCE_URL_HTTPS,
      error: (e as Error).message,
    };
    if (debugMode) errResponse.debug = debug;
    return jsonResponse(errResponse, 500, 30);
  }
};
