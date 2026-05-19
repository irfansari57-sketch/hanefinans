/**
 * Cloudflare Pages Function — Türkiye 5Y CDS spread veri kaynağı.
 *
 * GET /api/tr-cds  → { ok, value, changePct?, updatedAt, history?: [{date,value}], source }
 *
 * Kaynak: worldgovernmentbonds.com'un Turkey 5Y CDS sayfası HTML'i scrape edilir.
 * Cloudflare CDN cache: 30 dk. Yahoo'da bu veri yok, alternatif yok.
 *
 * Veri çekilemezse { ok: false, error } döner — frontend external link'e düşer.
 */

interface CdsHistoryPoint {
  date: string;       // ISO yyyy-mm-dd
  value: number;      // bps
}

interface CdsResponse {
  ok: boolean;
  value?: number;       // current spread in bps
  changePct?: number;   // % vs previous close
  changeAbs?: number;   // bps change
  updatedAt: string;    // ISO timestamp of fetch
  asOfDate?: string;    // source's "as of" date if parseable
  history?: CdsHistoryPoint[];
  source: string;
  error?: string;
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

/** "dd/mm/yyyy" → "yyyy-mm-dd" */
function normalizeDate(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export const onRequest: PagesFunction = async ({ request }) => {
  // Edge cache via Cloudflare's cache API
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
      const data: CdsResponse = {
        ok: false,
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
        error: `Source HTTP ${res.status}`,
      };
      return jsonResponse(data, 502, 60);
    }
    const html = await res.text();

    // --- Current value parse ---
    // Sayfa başlığında veya tabloda "200.45" gibi bps değer var.
    // Birden fazla pattern dene (sayfa zaman zaman güncellenir):
    let value: number | null = null;
    const patterns: RegExp[] = [
      // "current_value">208.45</  veya  ">208.45 bps<"
      /current[_-]?value[^>]*>\s*(\d+(?:[.,]\d+)?)/i,
      // "Turkey 5 Years CDS ... <td>208.45"
      /turkey\s*5\s*years?\s*cds[\s\S]{0,500}?<td[^>]*>\s*(\d+(?:[.,]\d+)?)/i,
      // ">208.45 bp<"  or  ">208.45 bps<"
      />(\d+(?:[.,]\d+)?)\s*bp[s]?\s*</i,
      // generic large number near "CDS" keyword
      /cds[\s\S]{0,200}?(\d{2,4}(?:[.,]\d+)?)/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) {
        const num = parseFloat(m[1].replace(',', '.'));
        if (Number.isFinite(num) && num > 30 && num < 5000) {
          value = num;
          break;
        }
      }
    }

    if (value == null) {
      const data: CdsResponse = {
        ok: false,
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
        error: 'CDS değeri sayfa HTML\'inden çıkarılamadı (pattern eşleşmedi).',
      };
      return jsonResponse(data, 502, 60);
    }

    // --- History parse ---
    // Tablo: <tr><td>15/05/2026</td><td>208.45</td>...</tr>
    const history: CdsHistoryPoint[] = [];
    const rowRe = /<tr[^>]*>\s*<td[^>]*>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>\s*<td[^>]*>\s*(\d+(?:[.,]\d+)?)/g;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(html)) !== null) {
      const isoDate = normalizeDate(rm[1]);
      const v = parseFloat(rm[2].replace(',', '.'));
      if (isoDate && Number.isFinite(v) && v > 30 && v < 5000) {
        history.push({ date: isoDate, value: v });
      }
      if (history.length > 500) break;
    }
    // En eskiden en yeniye sırala
    history.sort((a, b) => a.date.localeCompare(b.date));

    // --- Change vs previous day ---
    let changeAbs: number | undefined;
    let changePct: number | undefined;
    let asOfDate: string | undefined;
    if (history.length >= 2) {
      const last = history[history.length - 1];
      const prev = history[history.length - 2];
      // Eğer son satırdaki değer current ile ~uyumlu değilse, value'yu son tablo satırına eşitle
      if (Math.abs(last.value - value) / value > 0.5) {
        // büyük sapma — current değer büyük olasılıkla bugünün spotu, tablo D-1
        changeAbs = value - last.value;
        changePct = (changeAbs / last.value) * 100;
        asOfDate = last.date;
      } else {
        changeAbs = last.value - prev.value;
        changePct = (changeAbs / prev.value) * 100;
        asOfDate = last.date;
      }
    }

    const data: CdsResponse = {
      ok: true,
      value,
      changeAbs,
      changePct,
      asOfDate,
      updatedAt: new Date().toISOString(),
      history: history.length ? history.slice(-365) : undefined, // son 1 yıl
      source: 'worldgovernmentbonds.com',
    };

    const response = jsonResponse(data, 200, 1800);
    // Edge cache 30 dk
    request.url && (await cache.put(cacheKey, response.clone()));
    return response;
  } catch (e) {
    const data: CdsResponse = {
      ok: false,
      updatedAt: new Date().toISOString(),
      source: SOURCE_URL,
      error: (e as Error).message,
    };
    return jsonResponse(data, 500, 30);
  }
};
