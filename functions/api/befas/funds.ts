/**
 * /api/befas/funds — Bireysel Emeklilik Sistemi (BES) fon listesi.
 *
 * BES fonları TEFAS'ta normal fonlarla listelenmiyor — ayrı `fontip=EMK`
 * endpoint'inden çekilmesi gerekiyor. Python cron haftada bir çalıştığı için
 * bu endpoint ONA-DEMAND yedek olarak yaşıyor:
 *   - Frontend BES sayfası feed'de BES fonu bulamazsa buraya düşer
 *   - Her istekte TEFAS BindComparisonFundReturns'e POST atar
 *   - CF Workers KV cache ile 30 dk cache edilir (bir gunde ~48 gercek istek)
 *
 * Response:
 *   { ok: true, updatedAt: '...', count: N, funds: [{ code, name, category,
 *     nav, returns: { '1d','1w','1m','3m','6m','ytd','1y' } }] }
 *
 * Edge cache: 30 dk (piyasa saatlerinde), 6 saat (kapali).
 */

interface Env {}

interface TefasBesItem {
  FONKODU?: string;
  fonkodu?: string;
  FONUNVAN?: string;
  fonunvan?: string;
  KATEGORI?: string;
  kategori?: string;
  SONFIYAT?: number | string;
  sonfiyat?: number | string;
  GETIRIGUNLUK?: number | string;
  GETIRI1AY?: number | string;
  GETIRI3AY?: number | string;
  GETIRI6AY?: number | string;
  GETIRI1YIL?: number | string;
  GETIRIYILBASI?: number | string;
  [k: string]: unknown;
}

interface BesFund {
  code: string;
  name: string;
  category: 'Emeklilik';
  besKategori: string; // TEFAS alt kategori (Değişken, Hisse Senedi, Katılım Standart, Altın vs.)
  tefasOpen: false;
  befasOpen: true;
  nav: number | null;
  returns: {
    '1d'?: number | null;
    '1w'?: number | null;
    '1m'?: number | null;
    '3m'?: number | null;
    '6m'?: number | null;
    ytd?: number | null;
    '1y'?: number | null;
  };
}

function fmtTefasDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = d.getUTCFullYear();
  return `${dd}.${mm}.${yy}`;
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function firstNonEmpty(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s.length > 0 && s.toLowerCase() !== 'null') return s;
  }
  return null;
}

async function fetchTefasBes(): Promise<BesFund[]> {
  const now = new Date();
  // Hafta sonu ise cuma tarihi
  const dow = now.getUTCDay();
  const backDays = dow === 0 ? 2 : dow === 6 ? 1 : 0;
  const bittarih = new Date(now.getTime() - backDays * 86400_000);
  const bastarih = new Date(bittarih.getTime() - 7 * 86400_000);

  const form = new URLSearchParams({
    calismatipi: '2',
    fontip: 'EMK',
    bastarih: fmtTefasDate(bastarih),
    bittarih: fmtTefasDate(bittarih),
    strperiod: '1,1,1,1,1,1,1',
    islemdurum: '1',
    fongrup: '',
    kurucukod: '',
    fonturkod: '',
    fonunvantip: '',
  });

  const r = await fetch('https://www.tefas.gov.tr/api/DB/BindComparisonFundReturns', {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Referer': 'https://www.tefas.gov.tr/FonKarsilastirma.aspx',
      'Origin': 'https://www.tefas.gov.tr',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    body: form.toString(),
  });

  if (!r.ok) {
    throw new Error(`TEFAS HTTP ${r.status}`);
  }

  const j = await r.json() as { data?: TefasBesItem[]; Data?: TefasBesItem[] };
  const items = j.data ?? j.Data ?? [];
  if (!Array.isArray(items)) return [];

  const out: BesFund[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const code = (firstNonEmpty(it as Record<string, unknown>, 'FONKODU', 'fonkodu') || '').toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const name = firstNonEmpty(it as Record<string, unknown>, 'FONUNVAN', 'fonunvan') || code;
    const kategori = firstNonEmpty(it as Record<string, unknown>, 'KATEGORI', 'kategori') || 'Emeklilik';
    const nav = toNumber(it.SONFIYAT ?? it.sonfiyat);

    out.push({
      code,
      name,
      category: 'Emeklilik',
      besKategori: kategori,
      tefasOpen: false,
      befasOpen: true,
      nav: nav != null && nav > 0 ? nav : null,
      returns: {
        '1d':  toNumber(it.GETIRIGUNLUK),
        '1w':  null,
        '1m':  toNumber(it.GETIRI1AY),
        '3m':  toNumber(it.GETIRI3AY),
        '6m':  toNumber(it.GETIRI6AY),
        '1y':  toNumber(it.GETIRI1YIL),
        ytd:   toNumber(it.GETIRIYILBASI),
      },
    });
  }
  return out;
}

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  // Cloudflare edge cache
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(request.url, request);

  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  try {
    const funds = await fetchTefasBes();
    const body = {
      ok: true,
      updatedAt: new Date().toISOString(),
      count: funds.length,
      funds,
    };
    // Piyasa acikken 30 dk, kapaliyken 6 saat
    const now = new Date();
    const utcH = now.getUTCHours();
    const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
    const marketOpen = isWeekday && utcH >= 6 && utcH <= 15;
    const ttl = marketOpen ? 1800 : 21600;
    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
      },
    });
    if (!force && funds.length > 0) {
      // Cache'e yaz (fire-and-forget)
      const cachePut = cache.put(cacheKey, resp.clone());
      // ctx.waitUntil available on some CF runtimes; safe ignore
      cachePut.catch(() => { /* noop */ });
    }
    return resp;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
