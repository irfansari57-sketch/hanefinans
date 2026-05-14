/**
 * Hane Finans — TEFAS Scraper (Cloudflare Worker) v2
 *
 * İki mod:
 *   1. SIMPLE MODE (varsayılan): Cloudflare'in TLS fingerprint'i ile direkt fetch.
 *      Çoğu zaman Akamai'yi atlatır, hiçbir özel binding gerekmez.
 *   2. BROWSER MODE: BROWSER binding varsa headless Chrome ile scrape.
 *      Simple başarısız olursa fallback olarak çalışır.
 *
 * Endpointler:
 *   GET /                    → health + endpoint listesi
 *   GET /test                → TEFAS bağlantısını test eder, hangi mod çalışıyor
 *   GET /fund/:code          → fon NAV, performans, varlık dağılımı
 *   GET /funds/top           → en aktif fonlar listesi
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return cors();

    try {
      if (path === '/' || path === '/health') {
        return json({
          ok: true,
          service: 'tefas-scraper',
          version: '2.0',
          mode: env.BROWSER ? 'browser-rendering' : 'simple-fetch',
          endpoints: ['/test', '/fund/:code', '/funds/top'],
        });
      }

      if (path === '/test') {
        return await testConnectivity(env);
      }

      if (path.startsWith('/fund/')) {
        const code = path.slice(6).toUpperCase();
        if (!code) return json({ error: 'Fon kodu gerekli' }, 400);
        const data = await fetchFund(env, code);
        return json(data);
      }

      if (path === '/funds/top') {
        const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
        const data = await fetchTopFunds(env);
        return json({ data: data.slice(0, limit) });
      }

      return json({ error: 'Endpoint bulunamadı' }, 404);
    } catch (e) {
      return json({ error: e.message, stack: e.stack?.split('\n').slice(0, 3) }, 500);
    }
  },
};

// ============ CORS / Response yardımcıları ============

function cors() {
  return new Response('ok', {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

// ============ Test endpoint ============

async function testConnectivity(env) {
  const results = {};

  // Test 1: TEFAS homepage
  try {
    const r = await fetch('https://www.tefas.gov.tr/TarihselVeriler.aspx', {
      headers: tefasHeaders(),
    });
    results.homepage = {
      status: r.status,
      ok: r.ok,
      preview: (await r.text()).slice(0, 100),
    };
  } catch (e) {
    results.homepage = { error: e.message };
  }

  // Test 2: API endpoint
  try {
    const r = await fetch('https://www.tefas.gov.tr/api/DB/BindHistoryInfo', {
      method: 'POST',
      headers: { ...tefasHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'fontip=YAT&fonkod=TLY&bastarih=01.04.2026&bittarih=11.05.2026',
    });
    const body = await r.text();
    results.api = {
      status: r.status,
      length: body.length,
      preview: body.slice(0, 200),
      isJson: body.startsWith('{') || body.startsWith('['),
    };
  } catch (e) {
    results.api = { error: e.message };
  }

  results.browserBindingAvailable = !!env.BROWSER;
  return json(results);
}

// ============ Headers ============

function tefasHeaders() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Referer': 'https://www.tefas.gov.tr/TarihselVeriler.aspx',
    'Origin': 'https://www.tefas.gov.tr',
    'X-Requested-With': 'XMLHttpRequest',
  };
}

// ============ Fund detail ============

async function fetchFund(env, code) {
  // Önce simple fetch dene
  const simpleResult = await fetchFundSimple(code);
  if (simpleResult.ok) return simpleResult;

  // Başarısızsa Browser Rendering dene (binding varsa)
  if (env.BROWSER) {
    const browserResult = await fetchFundBrowser(env, code);
    if (browserResult.ok) return browserResult;
  }

  return {
    ok: false,
    code,
    error: 'Hem simple fetch hem browser rendering başarısız oldu',
    simpleError: simpleResult.error,
  };
}

async function fetchFundSimple(code) {
  try {
    // Önce homepage'i ziyaret edip cookie alalım
    const homeRes = await fetch('https://www.tefas.gov.tr/TarihselVeriler.aspx', {
      headers: tefasHeaders(),
    });
    const cookieHeader = homeRes.headers.get('set-cookie') ?? '';
    const cookies = cookieHeader.split(',').map((c) => c.split(';')[0]).join('; ');

    // API'yi çağır
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 60);
    const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

    const body =
      `fontip=YAT&sfontur=&fonkod=${code}&fongrup=` +
      `&bastarih=${fmt(start)}&bittarih=${fmt(end)}` +
      `&fonturkod=&fonunvantip=&strperiod=1,1,1,1,1,1,1&islemdurum=1`;

    const r = await fetch('https://www.tefas.gov.tr/api/DB/BindHistoryInfo', {
      method: 'POST',
      headers: {
        ...tefasHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body,
    });

    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const text = await r.text();

    // TEFAS bot challenge'a düşürdüyse içerik HTML olur, JSON değil
    if (!text.startsWith('{') && !text.startsWith('[')) {
      return { ok: false, error: 'TEFAS bot challenge (HTML döndü, JSON beklenirdi)' };
    }

    const data = JSON.parse(text);
    const items = data?.data ?? [];
    if (items.length === 0) return { ok: false, error: 'Veri bulunamadı', code };

    const last = items[items.length - 1];
    return {
      ok: true,
      code,
      fundName: last.FONUNVAN ?? null,
      nav: parseFloat(last.FIYAT ?? '0') || null,
      portfolioSize: parseFloat(last.PORTFOYBUYUKLUK ?? '0') || null,
      shareholderCount: parseInt(last.KISIYESAYISI ?? '0', 10) || null,
      shareCount: parseFloat(last.TEDPAYSAYISI ?? '0') || null,
      date: last.TARIH ?? null,
      history: items.map((i) => ({
        date: i.TARIH,
        nav: parseFloat(i.FIYAT ?? '0'),
      })),
      source: 'simple-fetch',
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function fetchFundBrowser(env, code) {
  // Browser Rendering binding kullanılır. Önce kütüphane import et.
  try {
    const { default: puppeteer } = await import('@cloudflare/puppeteer');
    const browser = await puppeteer.launch(env.BROWSER);
    try {
      const page = await browser.newPage();
      await page.setUserAgent(tefasHeaders()['User-Agent']);
      await page.goto(`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(code)}`, {
        waitUntil: 'networkidle0',
        timeout: 45000,
      });
      await page.waitForSelector('.main-indicators, .fund-info-name', { timeout: 30000 }).catch(() => {});
      const data = await page.evaluate(() => {
        const txt = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
        const num = (s) => {
          if (!s) return null;
          const clean = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
          return parseFloat(clean) || null;
        };
        return {
          fundName: txt('h2'),
          nav: num(txt('.main-indicators .first-row span')),
        };
      });
      return { ok: true, code, ...data, source: 'browser-rendering', fetchedAt: new Date().toISOString() };
    } finally {
      await browser.close();
    }
  } catch (e) {
    return { ok: false, error: `Browser rendering hata: ${e.message}` };
  }
}

// ============ Top funds ============

async function fetchTopFunds(env) {
  // Simple list endpoint dener
  try {
    const r = await fetch(
      'https://www.tefas.gov.tr/api/DB/BindHistoryInfo',
      {
        method: 'POST',
        headers: { ...tefasHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'fontip=YAT&strperiod=1,1,1,1,1,1,1&islemdurum=1',
      },
    );
    if (r.ok) {
      const text = await r.text();
      if (text.startsWith('{') || text.startsWith('[')) {
        const data = JSON.parse(text);
        return (data?.data ?? []).slice(0, 100).map((i) => ({
          code: i.FONKODU,
          name: i.FONUNVAN,
          nav: parseFloat(i.FIYAT ?? '0'),
          date: i.TARIH,
        }));
      }
    }
  } catch {}
  return [];
}
