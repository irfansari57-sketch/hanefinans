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

interface Env { DB?: D1Database }

interface MoverItem { kod: string; ad: string; pct: number; fiyat: number }

const TEFAS_FEED = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/tefas.json';

/** TR saatiyle son BIST iş günü (hafta sonu → Cuma; tatil takvimi yok). Seans 10:00 öncesinde dünkü gün. */
function trSessionDate(now = new Date()): string {
  const tr = new Date(now.getTime() + 3 * 3_600_000);
  if (tr.getUTCHours() < 10) tr.setUTCDate(tr.getUTCDate() - 1);
  while (tr.getUTCDay() === 0 || tr.getUTCDay() === 6) tr.setUTCDate(tr.getUTCDate() - 1);
  return tr.toISOString().slice(0, 10);
}

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

const CRYPTO_YAHOO = ['BTC-USD', 'ETH-USD', 'BNB-USD', 'SOL-USD', 'XRP-USD', 'ADA-USD', 'DOGE-USD', 'AVAX-USD', 'DOT-USD', 'LINK-USD', 'MATIC-USD', 'TRX-USD', 'LTC-USD'];

/** Kripto — CoinGecko markets (USD, ilk 100, 24s); erişilemezse kendi Yahoo snapshot'ımızdan 13 büyük coin */
async function fetchCrypto(origin: string): Promise<{ gainers: MoverItem[]; losers: MoverItem[] }> {
  const viaYahoo = async (): Promise<{ gainers: MoverItem[]; losers: MoverItem[] }> => {
    try {
      const r = await fetch(`${origin}/api/yahoo/snapshot?symbols=${CRYPTO_YAHOO.join(',')}`, { headers: { Accept: 'application/json' } });
      if (!r.ok) return { gainers: [], losers: [] };
      const j = (await r.json()) as { ok: boolean; quotes: Record<string, { price: number; changePct: number; name?: string }> };
      const items: MoverItem[] = [];
      for (const [k, q] of Object.entries(j.quotes ?? {})) {
        if (!q || !(q.price > 0) || !Number.isFinite(q.changePct) || Math.abs(q.changePct) > 50) continue;
        items.push({ kod: k.replace('-USD', '/USD'), ad: q.name ?? k.replace('-USD', ''), pct: q.changePct, fiyat: q.price });
      }
      return topBottom(items);
    } catch { return { gainers: [], losers: [] }; }
  };
  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h';
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; InvestliQ/1.0; +https://investliq.com)' },
      cf: { cacheTtl: 120, cacheEverything: true } as RequestInitCfProperties,
    });
    if (!r.ok) return viaYahoo();
    const arr = (await r.json()) as Array<{ symbol: string; name: string; current_price: number; price_change_percentage_24h: number | null }>;
    const items: MoverItem[] = [];
    for (const c of arr) {
      const pct = c.price_change_percentage_24h;
      if (pct == null || !Number.isFinite(pct) || Math.abs(pct) > 50) continue;
      if (!c.current_price || c.current_price <= 0) continue;
      items.push({ kod: `${c.symbol.toUpperCase()}/USD`, ad: c.name, pct, fiyat: c.current_price });
    }
    if (items.length === 0) return viaYahoo();
    return topBottom(items);
  } catch {
    return viaYahoo();
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cv', '3');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached && cached.ok) return cached;
  }

  // Paralel 4 kategori fetch — tek endpoint, tek roundtrip client için
  const [stocksLive, fundsLive, bes, cryptoLive] = await Promise.all([
    fetchStocks(waitUntil),
    fetchFunds(),
    fetchBes(),
    fetchCrypto(url.origin),
  ]);

  // 23 Eki 2026 — SON İYİ KOPYA (D1 daily_movers). Seans öncesi (İş Yatırım tablosu 0 değişim),
  // tatil veya kaynak hatasında liste boş/çok kısa geliyordu; istemci de küçük bir yedek
  // kümeyi "Yükselenler" diye gösteriyordu (itibar riski). Kural: kategori ≥ 10 kayıt getirdiyse
  // D1'e yaz; getirmediyse D1'deki son dolu kopyayı `stale:true` + tarih etiketiyle sun.
  const MIN_FULL = 10;
  const sessionDate = trSessionDate();
  type Cat = { gainers: MoverItem[]; losers: MoverItem[]; asOf?: string; stale?: boolean; staleDate?: string };
  const withFallback = async (cat: string, live: Cat): Promise<Cat> => {
    const full = live.gainers.length >= MIN_FULL && live.losers.length >= MIN_FULL;
    if (!env.DB) return live;
    if (full) {
      waitUntil(env.DB.prepare(
        'INSERT INTO daily_movers (cat, as_of, session_date, payload, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(cat) DO UPDATE SET as_of = excluded.as_of, session_date = excluded.session_date, payload = excluded.payload, updated_at = excluded.updated_at',
      ).bind(cat, live.asOf ?? null, sessionDate, JSON.stringify({ gainers: live.gainers, losers: live.losers }), Date.now()).run().catch(() => null));
      return live;
    }
    try {
      const row = await env.DB.prepare('SELECT as_of, session_date, payload FROM daily_movers WHERE cat = ?').bind(cat).first<{ as_of: string | null; session_date: string | null; payload: string }>();
      if (row) {
        const p = JSON.parse(row.payload) as { gainers: MoverItem[]; losers: MoverItem[] };
        return { gainers: p.gainers, losers: p.losers, asOf: row.as_of ?? undefined, stale: true, staleDate: row.session_date ?? undefined };
      }
    } catch { /* tablo yoksa (migration 024) canlıya düş */ }
    return live;
  };
  const [stocks, funds, crypto] = await Promise.all([
    withFallback('stocks', stocksLive),
    withFallback('funds', fundsLive),
    withFallback('crypto', cryptoLive),
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
    sources: { stocks: 'isyatirim', funds: 'tefas', bes: null, crypto: crypto.gainers.some((c) => c.kod.includes('/')) ? 'coingecko|yahoo' : null },
    updatedAt: new Date().toISOString(),
    sessionDate,
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
