/**
 * Cloudflare Pages Function — Türkiye 5Y CDS spread (v7 — jsDelivr proxy).
 *
 * Mimari değişikliği:
 *   v1-v6: worldgovernmentbonds.com'u doğrudan scrape ederdi.
 *   v7:    site JS-rendered olduğu için (Mayıs 2026) statik scrape imkansız.
 *          GitHub Actions cron (2x/gün) Playwright ile render edip
 *          data/tr-cds.json üretir → jsDelivr CDN'den buradan okunur.
 *
 * Frontend kontratı (CdsData) aynı kalır. Bu Function sadece:
 *   1) jsDelivr'den JSON çek
 *   2) Browser cache header'ları ekle
 *   3) Hata durumunda 200 + ok:false JSON dön (502 imkansız)
 *
 * Avantajlar:
 *   • Cloudflare egress bağımlılığı yok
 *   • Site HTML değişikliğine dayanıklı (scraper Playwright kullanır)
 *   • Edge cache + browser cache ile hızlı
 *   • Free tier limitlerini aşmaz
 */

const JSDELIVR_URL = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/tr-cds.json';

interface CdsHistoryPoint { date: string; value: number; }

interface CdsResponse {
  ok: boolean;
  value?: number;
  changePct?: number | null;
  changeAbs?: number | null;
  changeWindow?: string | null;
  updatedAt: string;
  asOfDate?: string | null;
  history?: CdsHistoryPoint[] | null;
  source: string;
  error?: string;
  parser?: string;
}

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

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const noCache = url.searchParams.get('refresh') === '1';

  try {
    const r = await fetch(JSDELIVR_URL, {
      headers: {
        'User-Agent': 'hanefinans-tr-cds-proxy/1.0',
        'Accept': 'application/json',
      },
      // jsDelivr CDN'i Cloudflare edge'inde 10 dk cache (cron 2x/gün, yeterli)
      cf: noCache ? { cacheTtl: 0 } : { cacheTtl: 600, cacheEverything: true },
    });

    if (!r.ok) {
      return safeJsonResponse({
        ok: false,
        updatedAt: new Date().toISOString(),
        source: 'worldgovernmentbonds.com (via jsDelivr CDN)',
        error: `jsDelivr HTTP ${r.status}. data/tr-cds.json henüz GitHub Actions tarafından üretilmemiş olabilir.`,
      });
    }

    const data = (await r.json()) as CdsResponse;

    // jsDelivr'den gelen JSON doğrudan client kontratıyla uyumlu, sadece source ekle
    return safeJsonResponse({
      ...data,
      source: data.source ?? 'worldgovernmentbonds.com',
    }, 1800);
  } catch (e) {
    return safeJsonResponse({
      ok: false,
      updatedAt: new Date().toISOString(),
      source: 'tr-cds-function',
      error: 'fatal: ' + ((e as Error).message || String(e)),
    });
  }
};
