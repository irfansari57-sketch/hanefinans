/**
 * Cloudflare Pages Function — Türkiye 5Y CDS spread (v5 — bulletproof).
 *
 * v5 farkları:
 *   • caches.default kaldırıldı (Pages Functions'da bazen exception fırlatıyor)
 *   • Promise.race ile sağlam timeout (AbortController fetch'i durdurmasa bile)
 *   • Master try/catch herhangi bir uncaught exception'a karşı 200 + JSON döner
 *     (502 ASLA üretmeyiz; client her zaman parse edilebilir yanıt alır)
 *   • Cloudflare edge cache: Cache-Control header üzerinden yönetilir
 *   • ?debug=1 → tam diagnostik (HTML head + match raporu)
 *
 * Doğrulama: 19 May 2026'da gerçek değer 243.63 idi.
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
  htmlHead?: string;
  containsTurkey?: boolean;
  containsCds?: boolean;
  standsAtMatch?: string | null;
  headerWindowMatch?: string | null;
  rowMatches?: number;
  attempts: Array<{ url: string; ok: boolean; status?: number; error?: string; ms?: number }>;
  fatalError?: string;
}

const SOURCE_URL_HTTPS = 'https://www.worldgovernmentbonds.com/cds-historical-data/turkey/5-years/';
const SOURCE_URL_HTTP  = 'http://www.worldgovernmentbonds.com/cds-historical-data/turkey/5-years/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** Her zaman 200 + JSON döner — Cloudflare 502 üretmesin diye. */
function safeJsonResponse(data: CdsResponse, ttlSec = 1800): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': data.ok ? `public, max-age=${ttlSec}` : 'no-store',
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
  if (v >= 2000 && v <= 2050) return false;
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

/** Promise.race ile zorlanmış timeout — AbortController fetch'i durdurmasa bile zaman aşımı çalışır. */
async function tryFetch(url: string, timeoutMs: number): Promise<{ ok: true; html: string; status: number; ms: number } | { ok: false; status?: number; error: string; ms: number }> {
  const startedAt = Date.now();
  const ctrl = new AbortController();
  let timer: number | undefined;
  const timeoutPromise = new Promise<{ ok: false; error: string; ms: number }>((resolve) => {
    timer = setTimeout(() => {
      try { ctrl.abort(); } catch { /* */ }
      resolve({ ok: false, error: `timeout ${timeoutMs}ms`, ms: Date.now() - startedAt });
    }, timeoutMs) as unknown as number;
  });

  const fetchPromise: Promise<{ ok: true; html: string; status: number; ms: number } | { ok: false; status?: number; error: string; ms: number }> = (async () => {
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (!r.ok) return { ok: false, status: r.status, error: `HTTP ${r.status}`, ms: Date.now() - startedAt };
      const html = await r.text();
      return { ok: true, html, status: r.status, ms: Date.now() - startedAt };
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'fetch error', ms: Date.now() - startedAt };
    }
  })();

  const result = await Promise.race([fetchPromise, timeoutPromise]);
  if (timer !== undefined) clearTimeout(timer);
  return result;
}

async function fetchSource(): Promise<{ html: string; url: string; status: number; attempts: DebugReport['attempts'] }> {
  const attempts: DebugReport['attempts'] = [];
  for (const url of [SOURCE_URL_HTTPS, SOURCE_URL_HTTP]) {
    const r = await tryFetch(url, 6000);
    if (r.ok) {
      attempts.push({ url, ok: true, status: r.status, ms: r.ms });
      return { html: r.html, url, status: r.status, attempts };
    }
    attempts.push({ url, ok: false, status: r.status, error: r.error, ms: r.ms });
  }
  throw new Error('Both attempts failed: ' + attempts.map((a) => `${a.url.replace(/^https?:\/\//,'').slice(0,40)}=${a.error || a.status}(${a.ms}ms)`).join(' | '));
}

async function scrape(debugMode: boolean): Promise<CdsResponse> {
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

    const standsAt = html.match(/value\s+stands\s+at[\s\S]{0,80}?(\d+(?:[.,]\d+)?)[\s\S]{0,40}?basis\s+points/i);
    debug.standsAtMatch = standsAt ? standsAt[0].slice(0, 200) : null;
    if (standsAt) {
      const num = parseFloat(standsAt[1].replace(',', '.'));
      if (isPlausibleCdsValue(num)) { value = num; parser = 'stands-at'; }
    }

    if (value == null) {
      const headerIdx = html.search(/TURKEY[^<]{0,40}5\s*Years?\s*CDS/i);
      if (headerIdx >= 0) {
        const window = html.slice(headerIdx, headerIdx + 2000);
        debug.headerWindowMatch = window.slice(0, 300);
        const m = window.match(/>\s*(\d{2,4}\.\d{1,4})\s*</);
        if (m) {
          const num = parseFloat(m[1]);
          if (isPlausibleCdsValue(num)) { value = num; parser = 'header-window'; }
        }
      }
    }

    const history: CdsHistoryPoint[] = [];
    const rowRe = /<tr[^>]*>\s*<td[^>]*>\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d]+(?:[.,]\d+)?)/g;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(html)) !== null) {
      const iso = normalizeDate(rm[1]);
      const v = parseFloat(rm[2].replace(',', '.'));
      if (iso && isPlausibleCdsValue(v)) history.push({ date: iso, value: v });
      if (history.length > 1000) break;
    }
    history.sort((a, b) => a.date.localeCompare(b.date));
    debug.rowMatches = history.length;

    if (value == null && history.length > 0) {
      value = history[history.length - 1].value;
      parser = 'history-last';
    }

    if (value == null) {
      const anyDecimal = html.match(/<td[^>]*>\s*(\d{2,4}\.\d{1,4})\s*</);
      if (anyDecimal) {
        const num = parseFloat(anyDecimal[1]);
        if (isPlausibleCdsValue(num)) { value = num; parser = 'any-td-decimal'; }
      }
    }

    if (value == null) {
      return {
        ok: false,
        updatedAt: new Date().toISOString(),
        source: fetchedUrl,
        error: 'CDS değeri bulunamadı (4 pattern de eşleşmedi)',
        ...(debugMode ? { debug } : {}),
      };
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

    return {
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
      ...(debugMode ? { debug } : {}),
    };
  } catch (e) {
    debug.fatalError = (e as Error).message;
    return {
      ok: false,
      updatedAt: new Date().toISOString(),
      source: 'worldgovernmentbonds.com',
      error: (e as Error).message,
      ...(debugMode ? { debug } : {}),
    };
  }
}

export const onRequest: PagesFunction = async ({ request }) => {
  // MASTER TRY/CATCH — Cloudflare bu Function'dan ASLA 502 görmesin.
  try {
    const url = new URL(request.url);
    const debugMode = url.searchParams.get('debug') === '1';
    const data = await scrape(debugMode);
    return safeJsonResponse(data, 1800);
  } catch (e) {
    // En son güvenlik ağı — herhangi bir uncaught exception bile JSON döner
    return safeJsonResponse({
      ok: false,
      updatedAt: new Date().toISOString(),
      source: 'tr-cds-function',
      error: 'fatal: ' + ((e as Error).message || String(e)),
    });
  }
};
