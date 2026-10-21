/**
 * /api/panel/top-movers — Panel "Günün Enleri" için 4 kategori unified endpoint.
 *
 * 21 Eki 2026 — KAYNAK DEĞİŞİKLİĞİ: fvt.com.tr API'sini kapattı (401 BLOCKED /
 * 429). Erişim kontrolünü aşmıyoruz; kategoriler şu kaynaklara taşındı:
 *   - stocks: İş Yatırım günlük hisse tablosu (~15 dk gecikmeli, _isyatirim.ts)
 *   - funds:  Kendi TEFAS feed'imiz (data/tefas.json, gece güncellenir; NAV T-1)
 *   - bes:    Kaynak YOK (FVT'ye bağımlıydı) → boş döner, `partial` ile raporlanır
 *   - crypto: CoinGecko /coins/markets (ilk 100, 24s değişim)
 *
 * Server-side filtering + sorting:
 *   - BIST: ±%10.5 (tavan ±%10 + rounding)
 *   - Fon:  ±%15
 *   - Kripto: ±%50
 *
 * Edge cache 60sn seans açık, 10dk kapalı.
 */

import { fetchIsYatirimAll } from '../_isyatirim';

interface Env {}

interface MoverItem { kod: string; ad: string; pct: number; fiyat: number }

const TEFAS_FEED = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/tefas.json';

function topBottom(items: MoverItem[]) {
  return {
    gainers: [...items].sort((a, b) => b.pct - a.pct).slice(0, 10),
    losers: [...items].sort((a, b) => a.pct - b.pct).slice(0, 10),
  };
}

/** BIST hisseler — İş Yatırım toplu tablo; BYF (…F, 6 harf) ve sertifikalar hariç */
async function fetchStocks(waitUntil: (p: Promise<unknown>) => void): Promise<{ gainers: MoverItem[]; losers: MoverItem[]; asOf?: string }> {
  const d = await fetchIsYatirimAll(waitUntil);
  if (!d) return { gainers: [], losers: [] };
  const items: MoverItem[] = [];
  for (const r of d.rows) {
    if (r.symbol.length > 5) continue; // BYF / sertifika / varant
    if (r.changePct === 0 || Math.abs(r.changePct) > 10.5) continue;
    items.push({ kod: r.symbol, ad: r.name ?? '', pct: r.changePct, fiyat: r.price });
  }
  return { ...topBottom(items), asOf: d.pageTime ?? undefined };
}

/** YAT fonlar — kendi TEFAS feed'imiz (1d getiri, NAV T-1). ±%15 dışı elenir. */
async function fetchFunds(): Promise<{ gainers: MoverItem[]; losers: MoverItem[]; asOf?: string }> {
  try {
    const r = await fetch(TEFAS_FEED, { cf: { cacheTtl: 900, cacheEverything: true } as RequestInitCfProperties });
    if (!r.ok) return { gainers: [], losers: [] };
    const j = (await r.json()) as { funds?: Array<{ code: string; name: string; nav?: number; date?: string; returns?: { '1d'?: number | null } }> };
    const items: MoverItem[] = [];
    let asOf: string | undefined;
    for (const f of j.funds ?? []) {
      const pct = f.returns?.['1d'];
      if (pct == null || !Number.isFinite(pct) || pct === 0 || Math.abs(pct) > 15) continue;
      if (!f.nav || f.nav <= 0) continue;
      if (!asOf && f.date) asOf = f.date;
      items.push({ kod: f.code, ad: f.name, pct, fiyat: f.nav });
    }
    return { ...topBottom(items), asOf };
  } catch {
    return { gainers: [], losers: [] };
  }
}

/** BES — FVT kapandı; alternatif kaynak bağlanana kadar boş (dürüst). */
async function fetchBes(): Promise<{ gainers: MoverItem[]; losers: MoverItem[] }> {
  return { gainers: [], losers: [] };
}

/** Kripto — CoinGecko markets (USD), 24 saatlik değişim, ±%50 dışı elenir */
async function fetchCrypto(): Promise<{ gainers: MoverItem[]; losers: MoverItem[] }> {
  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h';
    const r = await fetch(url, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 120, cacheEverything: true } as RequestInitCfProperties });
    if (!r.ok) return { gainers: [], losers: [] };
    const arr = (await r.json()) as Array<{ symbol: string; name: string; current_price: number; price_change_percentage_24h: number | null }>;
    const items: MoverItem[] = [];
    for (const c of arr) {
      const pct = c.price_change_percentage_24h;
      if (pct == null || !Number.isFinite(pct) || Math.abs(pct) > 50) continue;
      if (!c.current_price || c.current_price <= 0) continue;
      items.push({ kod: `${c.symbol.toUpperCase()}/USD`, ad: c.name, pct, fiyat: c.current_price });
    }
    return topBottom(items);
  } catch {
    return { gainers: [], losers: [] };
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, waitUntil }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cv', '2');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached && cached.ok) return cached;
  }

  // Paralel 4 kategori fetch — tek endpoint, tek roundtrip client için
  const [stocks, funds, bes, crypto] = await Promise.all([
    fetchStocks(waitUntil),
    fetchFunds(),
    fetchBes(),
    fetchCrypto(),
  ]);

  // 13 Eki 2026: Hiçbir kategori veri getiremediyse bu bir hata — 502 + no-store,
  // edge cache'e yazılmaz. Kısmi veri (örn. sadece kripto düştü) cache'lenir ama
  // hangi kategorilerin boş olduğu `partial` alanında raporlanır.
  const sizes = {
    stocks: stocks.gainers.length + stocks.losers.length,
    funds: funds.gainers.length + funds.losers.length,
    bes: bes.gainers.length + bes.losers.length,
    crypto: crypto.gainers.length + crypto.losers.length,
  };
  const emptyCats = (Object.keys(sizes) as Array<keyof typeof sizes>).filter((k) => sizes[k] === 0);
  const allEmpty = emptyCats.length === 4;

  const body = {
    ok: !allEmpty,
    source: 'isyatirim+tefas+coingecko',
    attribution: 'Hisse: İş Yatırım (~15 dk gecikmeli) · Fon: TEFAS (T-1) · Kripto: CoinGecko',
    sources: { stocks: 'isyatirim', funds: 'tefas', bes: null, crypto: 'coingecko' },
    updatedAt: new Date().toISOString(),
    partial: emptyCats.length > 0 ? emptyCats : undefined,
    error: allEmpty ? 'Hiçbir kaynaktan veri alınamadı' : undefined,
    stocks,
    funds,
    bes,
    crypto,
  };

  if (allEmpty) {
    return new Response(JSON.stringify(body), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const now = new Date();
  const utcH = now.getUTCHours();
  const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
  const marketOpen = isWeekday && utcH >= 6 && utcH <= 16;
  // Kısmi veri: kısa TTL ki eksik kategori hızla tamamlansın.
  // BES kaynağı bilinçli olarak boş (FVT kapandı) — TTL hesabında sayılmaz
  const unexpectedEmpty = emptyCats.filter((k) => k !== 'bes');
  const ttl = unexpectedEmpty.length > 0 ? 30 : marketOpen ? 60 : 600;

  const resp = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=1800`,
    },
  });
  if (!force) {
    waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
  }
  return resp;
};
