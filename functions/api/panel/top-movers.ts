/**
 * /api/panel/top-movers — Panel "Günün Enleri" için 4 kategori unified endpoint.
 *
 * Her kategori için pre-sorted top 10 gainers + top 10 losers döner.
 *   - stocks: BIST hisseleri (FVT /api/stocks hissePazar=2 .IS filter)
 *   - funds:  TEFAS Yatırım Fonları (FVT /api/funds islem=1)
 *   - bes:    BES/Emeklilik fonları (FVT /api/funds fonTipi=bes)
 *   - crypto: Kripto (FVT /api/stocks/kripto)
 *
 * Server-side filtering + sorting:
 *   - BIST: ±%10.5 (tavan ±%10 + rounding)
 *   - Fon:  ±%15 (günlük max realistic, scraper outlier'larını eler)
 *   - BES:  ±%10 (daha dar range, emeklilik fonları volatilite düşük)
 *   - Kripto: ±%50 (gerçek hareket)
 *
 * Edge cache 60sn market open, 10dk kapali — FVT paritesi real-time.
 */

import { fvtJson, isFvtBistRow } from '../_fvt';

interface Env {}

// Shared FVT fetch helper — ortak header + 8sn timeout (_fvt.ts)
async function fvtFetch(url: string): Promise<{ data: unknown[] } | null> {
  const d = await fvtJson<{ data?: unknown[] }>(url);
  if (!d || !Array.isArray(d.data)) return null;
  return { data: d.data };
}

function toNum(v: unknown): number {
  if (v == null || v === '') return NaN;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

interface MoverItem { kod: string; ad: string; pct: number; fiyat: number }

/** BIST hisseler — top-stocks.ts logic'inin aynısı */
async function fetchStocks(): Promise<{ gainers: MoverItem[]; losers: MoverItem[] }> {
  const d = await fvtFetch('https://fvt.com.tr/api/stocks?limit=5000&hissePazar=2');
  if (!d) return { gainers: [], losers: [] };
  const items: MoverItem[] = [];
  for (const row of d.data as Array<Record<string, unknown>>) {
    if (!isFvtBistRow(row)) continue;
    let pct = toNum(row.gunlukYuzde);
    const son = toNum(row.gunlukKapanis);
    const prev = toNum(row.dunkuKapanis);
    if (!Number.isFinite(pct) || pct === 0) {
      if (Number.isFinite(son) && Number.isFinite(prev) && prev > 0) pct = ((son - prev) / prev) * 100;
    }
    if (!Number.isFinite(pct) || pct === 0 || Math.abs(pct) > 10.5) continue;
    if (!Number.isFinite(son) || son <= 0) continue;
    items.push({
      kod: row.hisseKodu as string,
      ad: ((row.hisseAdi as string) ?? '').trim(),
      pct,
      fiyat: son,
    });
  }
  return {
    gainers: [...items].sort((a, b) => b.pct - a.pct).slice(0, 10),
    losers: [...items].sort((a, b) => a.pct - b.pct).slice(0, 10),
  };
}

/** YAT fonlar — islem=1 (TEFAS aktif), outlier ±%15 */
async function fetchFunds(): Promise<{ gainers: MoverItem[]; losers: MoverItem[] }> {
  const d = await fvtFetch('https://fvt.com.tr/api/funds?limit=1000&islem=1');
  if (!d) return { gainers: [], losers: [] };
  const items: MoverItem[] = [];
  for (const row of d.data as Array<Record<string, unknown>>) {
    const pct = toNum(row.getiri);
    const fiyat = toNum(row.fiyat);
    if (!Number.isFinite(pct) || pct === 0 || Math.abs(pct) > 15) continue;
    if (!Number.isFinite(fiyat) || fiyat <= 0) continue;
    items.push({
      kod: row.fonKodu as string,
      ad: ((row.fonAdi as string) ?? '').trim(),
      pct,
      fiyat,
    });
  }
  return {
    gainers: [...items].sort((a, b) => b.pct - a.pct).slice(0, 10),
    losers: [...items].sort((a, b) => a.pct - b.pct).slice(0, 10),
  };
}

/** BES fonları — fonTipi=bes, outlier ±%10 */
async function fetchBes(): Promise<{ gainers: MoverItem[]; losers: MoverItem[] }> {
  const d = await fvtFetch('https://fvt.com.tr/api/funds?limit=500&fonTipi=bes');
  if (!d) return { gainers: [], losers: [] };
  const items: MoverItem[] = [];
  for (const row of d.data as Array<Record<string, unknown>>) {
    const pct = toNum(row.getiri);
    const fiyat = toNum(row.fiyat);
    if (!Number.isFinite(pct) || pct === 0 || Math.abs(pct) > 10) continue;
    if (!Number.isFinite(fiyat) || fiyat <= 0) continue;
    items.push({
      kod: row.fonKodu as string,
      ad: ((row.fonAdi as string) ?? '').trim(),
      pct,
      fiyat,
    });
  }
  return {
    gainers: [...items].sort((a, b) => b.pct - a.pct).slice(0, 10),
    losers: [...items].sort((a, b) => a.pct - b.pct).slice(0, 10),
  };
}

/** Kripto — outlier ±%50 */
async function fetchCrypto(): Promise<{ gainers: MoverItem[]; losers: MoverItem[] }> {
  const d = await fvtFetch('https://fvt.com.tr/api/stocks/kripto?limit=500');
  if (!d) return { gainers: [], losers: [] };
  const items: MoverItem[] = [];
  for (const row of d.data as Array<Record<string, unknown>>) {
    const pct = toNum(row.getiri);
    const fiyat = toNum(row.fiyat);
    if (!Number.isFinite(pct) || Math.abs(pct) > 50) continue;
    if (!Number.isFinite(fiyat) || fiyat <= 0) continue;
    const code = (row.kriptoKodu as string) ?? (row.kodu as string);
    items.push({
      kod: code,
      ad: ((row.kriptoAdi as string) ?? '').trim(),
      pct,
      fiyat,
    });
  }
  return {
    gainers: [...items].sort((a, b) => b.pct - a.pct).slice(0, 10),
    losers: [...items].sort((a, b) => a.pct - b.pct).slice(0, 10),
  };
}

export const onRequest: PagesFunction<Env> = async ({ request, waitUntil }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cv', '1');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached && cached.ok) return cached;
  }

  // Paralel 4 kategori fetch — tek endpoint, tek roundtrip client için
  const [stocks, funds, bes, crypto] = await Promise.all([
    fetchStocks(),
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
    source: 'fvt.com.tr',
    attribution: 'Veri kaynağı: fvt.com.tr',
    updatedAt: new Date().toISOString(),
    partial: emptyCats.length > 0 ? emptyCats : undefined,
    error: allEmpty ? 'FVT kaynağından veri alınamadı' : undefined,
    stocks,
    funds,
    bes,
    crypto,
  };

  if (allEmpty) {
    return new Response(JSON.stringify(body), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const now = new Date();
  const utcH = now.getUTCHours();
  const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
  const marketOpen = isWeekday && utcH >= 6 && utcH <= 16;
  // Kısmi veri: kısa TTL ki eksik kategori hızla tamamlansın.
  const ttl = emptyCats.length > 0 ? 30 : marketOpen ? 60 : 600;

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
