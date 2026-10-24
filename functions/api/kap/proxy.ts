/**
 * /api/kap/proxy — KAP için KISITLI geçiş (24 Eki 2026).
 *
 * Amaç: GitHub Actions IP'leri KAP tarafından engellenirse scraper (scripts/kap_holdings_fetch.py)
 * isteklerini Cloudflare edge üzerinden yapar. Açık proxy DEĞİLDİR:
 *   - yalnız 3 KAP yolu: POST /tr/api/disclosure/funds/byCriteria, GET /tr/Bildirim/{n}, GET /tr/api/file/download/{hex}
 *   - X-Proxy-Key başlığı env.KAP_PROXY_KEY ile eşleşmeli (Pages → Settings → Secrets)
 *   - ?probe=1 : anahtarsız erişilebilirlik testi — yalnız bugünün YF listesinin SAYISINI döner (10 dk edge cache)
 *
 * Kullanım: GET/POST /api/kap/proxy?path=/tr/Bildirim/1677365   (gövde POST'ta aynen iletilir)
 */
interface Env { KAP_PROXY_KEY?: string }

const BASE = 'https://kap.org.tr';
const ALLOWED: Array<{ method: 'GET' | 'POST'; re: RegExp }> = [
  { method: 'POST', re: /^\/tr\/api\/disclosure\/funds\/byCriteria$/ },
  { method: 'GET', re: /^\/tr\/Bildirim\/\d{1,9}$/ },
  { method: 'GET', re: /^\/tr\/api\/file\/download\/[0-9a-fA-F]{16,40}$/ },
];
const UA_HEADERS = {
  'Accept-Language': 'tr-TR,tr;q=0.9',
  'Referer': BASE + '/tr/bildirim-sorgu',
  'Origin': BASE,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function probe(): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10);
  const body = { fromDate: today, toDate: today, fundTypeList: ['YF'], mkkMemberOidList: [], fundOidList: [], passiveFundOidList: [], disclosureClass: '', isLate: '', subjectList: [], discIndex: [], fromSrc: false, srcCategory: '' };
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + '/tr/api/disclosure/funds/byCriteria', {
      method: 'POST', headers: { ...UA_HEADERS, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
    });
    const txt = await r.text();
    let n: number | null = null;
    try { const j = JSON.parse(txt); n = Array.isArray(j) ? j.length : null; } catch { /* html */ }
    return new Response(JSON.stringify({ ok: r.status === 200 && n !== null, status: r.status, count: n, ms: Date.now() - t0, head: n === null ? txt.slice(0, 200) : undefined }), {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
    });
  } catch (e) {
    return json(200, { ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 });
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (url.searchParams.get('probe') === '1') return probe();

  const key = env.KAP_PROXY_KEY;
  if (!key) return json(503, { ok: false, error: 'KAP_PROXY_KEY tanımlı değil' });
  if (request.headers.get('X-Proxy-Key') !== key) return json(401, { ok: false, error: 'yetkisiz' });

  const path = url.searchParams.get('path') ?? '';
  const method = request.method === 'POST' ? 'POST' : 'GET';
  if (!ALLOWED.some((a) => a.method === method && a.re.test(path))) return json(400, { ok: false, error: 'izin verilmeyen yol' });

  const init: RequestInit = { method, headers: { ...UA_HEADERS, Accept: path.startsWith('/tr/Bildirim') ? 'text/html' : '*/*' } };
  if (method === 'POST') {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = await request.text();
  }
  try {
    const r = await fetch(BASE + path, init);
    const h = new Headers();
    h.set('Content-Type', r.headers.get('content-type') ?? 'application/octet-stream');
    h.set('Cache-Control', 'no-store');
    h.set('X-Upstream-Status', String(r.status));
    return new Response(r.body, { status: r.status, headers: h });
  } catch (e) {
    return json(503, { ok: false, error: e instanceof Error ? e.message : String(e) }); // 502 değil: CF HTML sayfayla değiştirir
  }
};
