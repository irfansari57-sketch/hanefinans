/**
 * GET /api/health/data-quality
 *
 * Backend feed sağlık kontrolü. Yahoo, TEFAS, BIST, kripto, haberler
 * endpoint'lerinin çalıştığını + verinin makul olduğunu doğrular.
 *
 * Kullanım:
 *   - Client (Admin Data Quality sayfası) 30 saniyede bir çağırır
 *   - GitHub Actions cron (sabah 09:30, öğlen 12:30, akşam 15:30) çağırır
 *     — fail durumunda Telegram/webhook alert
 *
 * Response örneği:
 *   {
 *     "ok": true,
 *     "checkedAt": "2026-08-22T10:15:00Z",
 *     "yahoo": { "ok": true, "latency": 320 },
 *     "tefas": { "ok": true, "count": 1012 },
 *     "bist": { "ok": true, "latency": 180 },
 *     "crypto": { "ok": true, "latency": 210 },
 *     "news": { "ok": true, "count": 42 }
 *   }
 */

interface HealthResult {
  ok: boolean;
  latency?: number;
  error?: string;
  count?: number;
}

async function checkYahoo(env: any): Promise<HealthResult> {
  const start = Date.now();
  try {
    // XU100 quote check
    const url = new URL('https://query1.finance.yahoo.com/v7/finance/quote?symbols=XU100.IS');
    const r = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestliQ-Health/1.0)' },
      cf: { cacheTtl: 0 },
    });
    const latency = Date.now() - start;
    if (!r.ok) return { ok: false, latency, error: `HTTP ${r.status}` };
    const json = await r.json() as any;
    const result = json?.quoteResponse?.result?.[0];
    if (!result?.regularMarketPrice) {
      return { ok: false, latency, error: 'Yahoo quote payload boş' };
    }
    // BIST price sanity: XU100 > 5000 olmalı
    if (result.regularMarketPrice < 5000) {
      return { ok: false, latency, error: `XU100 anormal düşük: ${result.regularMarketPrice}` };
    }
    return { ok: true, latency };
  } catch (e: any) {
    return { ok: false, latency: Date.now() - start, error: e?.message?.slice(0, 100) ?? 'fetch fail' };
  }
}

async function checkTefas(env: any): Promise<HealthResult> {
  const start = Date.now();
  try {
    const url = (env.TEFAS_FEED_URL as string) || 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans-data@main/data/tefas-funds.json';
    const r = await fetch(url, { cf: { cacheTtl: 0 } });
    const latency = Date.now() - start;
    if (!r.ok) return { ok: false, latency, error: `HTTP ${r.status}` };
    const json = await r.json() as any;
    const count = Array.isArray(json?.funds) ? json.funds.length : 0;
    if (count < 500) {
      return { ok: false, latency, error: `TEFAS fon sayısı düşük: ${count}` };
    }
    // Feed staleness check
    if (json.updatedAt) {
      const ageDays = (Date.now() - new Date(json.updatedAt).getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays > 4) {
        return { ok: false, latency, count, error: `TEFAS feed ${ageDays.toFixed(1)} gün eski` };
      }
    }
    return { ok: true, latency, count };
  } catch (e: any) {
    return { ok: false, latency: Date.now() - start, error: e?.message?.slice(0, 100) ?? 'fetch fail' };
  }
}

async function checkBist(request: Request): Promise<HealthResult> {
  const start = Date.now();
  try {
    const origin = new URL(request.url).origin;
    const r = await fetch(`${origin}/api/yahoo/returns-snapshot`, { cf: { cacheTtl: 0 } });
    const latency = Date.now() - start;
    if (!r.ok) return { ok: false, latency, error: `HTTP ${r.status}` };
    const json = await r.json() as any;
    const count = json && typeof json === 'object' ? Object.keys(json).length : 0;
    if (count < 100) {
      return { ok: false, latency, count, error: `BIST snapshot sembol sayısı düşük: ${count}` };
    }
    return { ok: true, latency, count };
  } catch (e: any) {
    return { ok: false, latency: Date.now() - start, error: e?.message?.slice(0, 100) ?? 'fetch fail' };
  }
}

async function checkCrypto(): Promise<HealthResult> {
  const start = Date.now();
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', {
      cf: { cacheTtl: 0 },
    });
    const latency = Date.now() - start;
    if (!r.ok) return { ok: false, latency, error: `HTTP ${r.status}` };
    const json = await r.json() as any;
    if (!json?.bitcoin?.usd) return { ok: false, latency, error: 'BTC price boş' };
    return { ok: true, latency };
  } catch (e: any) {
    return { ok: false, latency: Date.now() - start, error: e?.message?.slice(0, 100) ?? 'fetch fail' };
  }
}

async function checkNews(request: Request): Promise<HealthResult> {
  const start = Date.now();
  try {
    const origin = new URL(request.url).origin;
    const r = await fetch(`${origin}/api/news?max=10`, { cf: { cacheTtl: 0 } });
    const latency = Date.now() - start;
    if (!r.ok) return { ok: false, latency, error: `HTTP ${r.status}` };
    const json = await r.json() as any;
    const count = Array.isArray(json?.data) ? json.data.length : 0;
    if (count === 0) return { ok: false, latency, count, error: 'Haber akışı boş' };
    return { ok: true, latency, count };
  } catch (e: any) {
    return { ok: false, latency: Date.now() - start, error: e?.message?.slice(0, 100) ?? 'fetch fail' };
  }
}

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const [yahoo, tefas, bist, crypto, news] = await Promise.all([
    checkYahoo(env),
    checkTefas(env),
    checkBist(request),
    checkCrypto(),
    checkNews(request),
  ]);

  const allOk = yahoo.ok && tefas.ok && bist.ok && crypto.ok && news.ok;

  return new Response(
    JSON.stringify({
      ok: allOk,
      checkedAt: new Date().toISOString(),
      yahoo,
      tefas,
      bist,
      crypto,
      news,
    }),
    {
      status: allOk ? 200 : 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
};
