/**
 * Cloudflare Pages Function — TR 10Y Tahvil yield (% — jsDelivr proxy).
 *
 * Veri kaynağı: data/tr-10y.json (GitHub Actions cron 2x/gün Playwright ile üretir)
 * Frontend client: src/data/api/tr10y.ts
 *
 * TR CDS ile aynı mimari: site JS-rendered olduğu için Pages Function'da
 * direkt scrape imkansız; cron tarafından üretilmiş JSON jsDelivr CDN'den okunur.
 */

const JSDELIVR_URL = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/tr-10y.json';

interface BondHistoryPoint { date: string; value: number; }

interface BondResponse {
  ok: boolean;
  value?: number;
  unit?: string;
  changePct?: number | null;
  changeAbs?: number | null;
  changeWindow?: string | null;
  updatedAt: string;
  asOfDate?: string | null;
  history?: BondHistoryPoint[] | null;
  source: string;
  error?: string;
  parser?: string;
}

function safeJsonResponse(data: BondResponse, ttlSec = 1800): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': data.ok ? `public, max-age=${ttlSec}` : 'no-store',
    },
  });
}

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const noCache = url.searchParams.get('refresh') === '1';

  try {
    const r = await fetch(JSDELIVR_URL, {
      headers: {
        'User-Agent': 'hanefinans-tr-10y-proxy/1.0',
        'Accept': 'application/json',
      },
      cf: noCache ? { cacheTtl: 0 } : { cacheTtl: 600, cacheEverything: true },
    });

    if (!r.ok) {
      return safeJsonResponse({
        ok: false,
        updatedAt: new Date().toISOString(),
        source: 'worldgovernmentbonds.com (via jsDelivr CDN)',
        error: `jsDelivr HTTP ${r.status}. data/tr-10y.json henüz üretilmemiş olabilir.`,
      });
    }

    const data = (await r.json()) as BondResponse;
    return safeJsonResponse({
      ...data,
      source: data.source ?? 'worldgovernmentbonds.com',
    }, 1800);
  } catch (e) {
    return safeJsonResponse({
      ok: false,
      updatedAt: new Date().toISOString(),
      source: 'tr-10y-function',
      error: 'fatal: ' + ((e as Error).message || String(e)),
    });
  }
};
