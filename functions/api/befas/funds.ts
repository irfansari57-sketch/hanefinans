/**
 * /api/befas/funds — Bireysel Emeklilik Sistemi (BES) fon listesi.
 *
 * NOT: TEFAS (www.tefas.gov.tr) Cloudflare Workers IP'lerine bot koruma
 * challenge sayfasi donuyor. Bu yuzden PRIMARY kaynak Takasbank BEFAS
 * fund list endpoint'i (farkli CDN, bot koruma yok).
 *
 * Data flow:
 *   1) Takasbank BEFAS JSON endpoint (tercih) — sadece kod + isim + kurucu
 *   2) TEFAS BindComparisonFundReturns (fallback, IP bloke oldugu icin genelde 502)
 *   3) TEFAS gecerse: kod + isim + NAV + getiriler zenginlik olur
 *
 * Response: { ok: true, updatedAt, count, funds: [...] }
 * Edge cache: 30 dk (piyasa acikken), 6 saat (kapaliyken).
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

import { BES_SEED } from './_seed';

/** Seed listeyi TEFAS-style BesFund'a cevirir (NAV/getiri null) */
function seedToBesFunds(): BesFund[] {
  return BES_SEED.map((s) => ({
    code: s.code,
    name: s.name,
    category: 'Emeklilik' as const,
    besKategori: s.besKategori,
    tefasOpen: false as const,
    befasOpen: true as const,
    nav: null,
    returns: {},
  }));
}

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const debug = url.searchParams.get('debug') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(request.url, request);

  if (!force && !debug) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  // Strateji: TEFAS'i dene (nadiren calisir CF Worker IP'lerinden), fail olursa seed.
  let funds: BesFund[] = [];
  let source: 'tefas-live' | 'seed' = 'seed';
  let tefasError: string | null = null;

  try {
    funds = await fetchTefasBes();
    if (funds.length > 0) source = 'tefas-live';
  } catch (e) {
    tefasError = e instanceof Error ? e.message : String(e);
  }

  // TEFAS bos veya fail ise seed liste
  if (funds.length === 0) {
    funds = seedToBesFunds();
    source = 'seed';
  }

  const body = {
    ok: true,
    updatedAt: new Date().toISOString(),
    count: funds.length,
    source,
    funds,
    ...(debug || tefasError ? { tefasError } : {}),
  };
  // Seed cevaplari 6 saat cache, tefas-live 30 dk
  const ttl = source === 'tefas-live' ? 1800 : 21600;
  const resp = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
    },
  });
  if (!force && !debug && funds.length > 0) {
    cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ });
  }
  return resp;
};
