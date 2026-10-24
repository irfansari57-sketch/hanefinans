/**
 * /api/funds/:code/distribution — Fon portfoy dagilimi.
 *
 * Kaynak (21 Eki 2026'dan itibaren): kendi TEFAS feed'imiz
 *   https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/tefas.json
 *   (scripts/tefas_fetch.py gece calisir; her fonda `allocation` alani =
 *   TEFAS BindFonPortfoyDagilimi -> [{ label: "Hisse Senedi", pct: 59.03 }, ...] | null)
 *
 * NOT: TEFAS yalnizca VARLIK SINIFI dagilimi yayinlar (Hisse %, Tahvil %, Ters Repo %...).
 * Hisse-bazli dagilim (ASELS %4,50 gibi) — 24 Eki 2026'dan itibaren KAP aylik "Portfoy Dagilim
 * Raporu" PDF'lerinden (scripts/kap_holdings_fetch.py, workflow kap-holdings-fetch.yml) uretilen
 * data/holdings/{KOD}.json dosyasindan okunur; dosya yoksa `items: []`, `itemsAvailable: false`.
 * Agirlik = raporun "Fon Toplam Degerine gore %" sutunu (FVT ile birebir dogrulandi: KTJ Eyl-2026).
 * Onceki ay = bir onceki rapor (ilk raporda yok → fark 0, UI "Onceki rapor henuz yok").
 *
 * Response (sema onceki FVT surumuyle uyumlu; yeni alanlar eklendi):
 *   {
 *     ok: true,
 *     code: "DHJ",
 *     source: "tefas.gov.tr",
 *     attribution: "...",
 *     updatedAt: "2026-10-21T...",        // bu yanitin uretim zamani
 *     feedUpdatedAt: "2026-10-20T...",     // tefas.json updatedAt
 *     navDate: "2026-10-19",               // fonun feed'deki fiyat tarihi
 *     aciklamaTarihi: null, oncekiAy: null, oncekiYil: null,  // KAP verisi yok
 *     itemCount: 0,
 *     items: [],                           // hisse-bazli — kaynak yok
 *     itemsAvailable: false,
 *     note: "Hisse bazlı dağılım için kaynak geçici olarak yok (...)",
 *     allocationAvailable: true,
 *     allocation: [ { label: "Hisse Senedi", pct: 59.03 } ],   // TEFAS varlik sinifi
 *     sektorler:  [ { ad: "Hisse Senedi",   pct: 59.03 } ],    // ayni veri, eski sema adi
 *   }
 *
 * Hata: 503 + Cache-Control: no-store (502 kullanilmaz; Cloudflare 502'yi HTML sayfayla
 * degistiriyor ve istemci JSON.parse'ta patliyor). Fon feed'de yoksa 404 + no-store.
 * Basarili yanit: edge cache (caches.default) 1 saat.
 */

import { fetchIsYatirimAll } from '../../_isyatirim';

interface Env {}

interface FeedAllocationItem { label?: unknown; pct?: unknown }

interface FeedFund {
  code: string;
  name?: string;
  category?: string;
  date?: string;
  allocation?: FeedAllocationItem[] | null;
  [k: string]: unknown;
}

interface FeedPayload {
  updatedAt?: string;
  count?: number;
  funds?: FeedFund[];
}

const TEFAS_FEED = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/tefas.json';
/** 24 Eki 2026: KAP aylık Portföy Dağılım Raporu (scripts/kap_holdings_fetch.py) → data/holdings/{KOD}.json */
const HOLDINGS_BASE = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/holdings/';
const ITEMS_NOTE = 'Bu fon için KAP aylık portföy dağılım raporu henüz işlenmedi (rapor ay başında yayımlanır)';
const EDGE_TTL = 3600;

interface HoldingItem {
  kod: string; ad?: string | null; isin?: string | null; cur?: string; tur?: string;
  adet?: number | null; fiyat?: number | null; deger?: number | null;
  pct: number; pctFpd?: number; pctGrup?: number;
}
interface HoldingsFile {
  code: string; name?: string | null; fundType?: string; updatedAt?: string; source?: string;
  current?: { period?: string | null; publishDate?: string | null; disclosureIndex?: number; items?: HoldingItem[] } | null;
  previous?: { period?: string | null; items?: Array<{ kod: string; pct: number }> } | null;
}

const TUR_LABEL: Record<string, string> = {
  hisse: 'Hisse (BIST)', yabanci_hisse: 'Yabancı Hisse', fon: 'Yatırım Fonu / BYF', yabanci_fon: 'Yabancı Fon',
  borclanma: 'Borçlanma Aracı', kira: 'Kira Sertifikası', repo: 'Repo / Taahhütlü', doviz: 'Döviz',
  kiymetli_maden: 'Kıymetli Maden', mevduat: 'Mevduat / Katılım', turev: 'Türev', diger: 'Diğer',
};

/** "08.10.2026 16:54:43" → "2026-10-08" */
function kapDateToIso(s: string | null | undefined): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(s ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function fetchHoldings(code: string): Promise<HoldingsFile | null> {
  try {
    const r = await fetch(`${HOLDINGS_BASE}${code}.json`, {
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true } as RequestInitCfProperties,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as HoldingsFile;
    return j && j.current && Array.isArray(j.current.items) ? j : null;
  } catch {
    return null;
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
  });
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Feed allocation -> temiz { label, pct } listesi (pct > 0, desc sirali). */
function normalizeAllocation(raw: unknown): Array<{ label: string; pct: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ label: string; pct: number }> = [];
  for (const it of raw as FeedAllocationItem[]) {
    if (!it || typeof it !== 'object') continue;
    const label = String(it.label ?? '').trim();
    const pct = Math.round(toNum(it.pct) * 100) / 100;
    if (!label || pct <= 0) continue;
    out.push({ label, pct });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

export const onRequest: PagesFunction<Env> = async ({ request, params, waitUntil }) => {
  const code = String(params.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code || code.length < 2 || code.length > 6) {
    return errorResponse(400, 'Gecersiz fon kodu');
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cv', '4'); // bump: KAP holdings items, 24 Eki 2026
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached && cached.ok) return cached;
  }

  try {
    const r = await fetch(TEFAS_FEED, {
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 900, cacheEverything: true } as RequestInitCfProperties,
    });
    if (!r.ok) {
      return errorResponse(503, `TEFAS feed HTTP ${r.status}`);
    }

    let feed: FeedPayload;
    try {
      feed = (await r.json()) as FeedPayload;
    } catch {
      return errorResponse(503, 'TEFAS feed JSON parse hatasi');
    }
    const funds = Array.isArray(feed?.funds) ? feed.funds : null;
    if (!funds) {
      return errorResponse(503, 'TEFAS feed gecersiz (funds yok)');
    }

    const fund = funds.find((f) => String(f?.code ?? '').toUpperCase() === code);
    if (!fund) {
      return errorResponse(404, `Fon feed'de bulunamadi: ${code}`);
    }

    const allocation = normalizeAllocation(fund.allocation);
    const sektorler = allocation.map((a) => ({ ad: a.label, pct: a.pct }));

    // KAP aylık portföy dağılım raporu (hisse/varlık bazlı) — varsa items doldurulur
    const holdings = await fetchHoldings(code);
    const cur = holdings?.current ?? null;
    // BIST hisse adları: PDF'te çok satırlı hücre güvenilir birleşmiyor → İş Yatırım tablosundan (edge cache) zenginleştir
    const bistNames = new Map<string, string>();
    if (cur?.items?.some((h) => h.tur === 'hisse')) {
      const isy = await fetchIsYatirimAll(waitUntil).catch(() => null);
      for (const r of isy?.rows ?? []) if (r.name) bistNames.set(r.symbol, r.name);
    }
    const prevMap = new Map<string, number>();
    for (const p of holdings?.previous?.items ?? []) prevMap.set(p.kod, p.pct);
    const items = (cur?.items ?? [])
      .filter((h) => Number.isFinite(h.pct) && h.pct > 0)
      .map((h) => {
        // Önceki rapor yoksa fark hesaplanamaz → eski = yeni (UI gri gösterir). Önceki rapor var ama kayıt yoksa → yeni pozisyon (eski 0).
        const hasPrev = !!holdings?.previous;
        const eski = hasPrev ? (prevMap.get(h.kod) ?? 0) : h.pct;
        const yabanci = h.tur === 'yabanci_hisse' || h.tur === 'yabanci_fon' || (h.cur != null && h.cur !== 'TL');
        return {
          kod: h.kod,
          ad: (h.tur === 'hisse' ? bistNames.get(h.kod) : null) ?? ((h.ad ?? '').trim() || h.kod),
          sektor: TUR_LABEL[h.tur ?? 'diger'] ?? 'Diğer',
          tur: h.tur ?? 'diger',
          isin: h.isin ?? null,
          agirlik: h.pct,
          eskiAgirlik: eski,
          fark: Math.round((h.pct - eski) * 100) / 100,
          yeni: hasPrev && !prevMap.has(h.kod),
          kategori: null as number | null,
          etf: h.tur === 'fon' || h.tur === 'yabanci_fon',
          yabanci,
        };
      })
      .sort((a, b) => b.agirlik - a.agirlik);

    const body = {
      ok: true,
      code,
      name: fund.name ?? null,
      category: fund.category ?? null,
      source: items.length ? 'tefas.gov.tr + kap.org.tr' : 'tefas.gov.tr',
      attribution: items.length
        ? 'Veri kaynağı: KAP aylık Portföy Dağılım Raporu (hisse bazlı) · TEFAS (varlık sınıfı)'
        : 'Veri kaynağı: TEFAS (varlık sınıfı dağılımı, günlük feed)',
      updatedAt: new Date().toISOString(),
      feedUpdatedAt: feed.updatedAt ?? null,
      navDate: fund.date ?? null,
      // KAP aylık rapor alanları
      aciklamaTarihi: kapDateToIso(cur?.publishDate),
      period: cur?.period ?? null,
      previousPeriod: holdings?.previous?.period ?? null,
      kapSource: holdings?.source ?? null,
      oncekiAy: null as number | null,
      oncekiYil: null as number | null,
      itemCount: items.length,
      items,
      itemsAvailable: items.length > 0,
      note: items.length ? null : ITEMS_NOTE,
      allocationAvailable: allocation.length > 0,
      allocation,
      sektorler,
    };

    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        'Cache-Control': `public, max-age=${EDGE_TTL}, s-maxage=${EDGE_TTL}, stale-while-revalidate=86400`,
      },
    });

    if (!force) {
      waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
    }
    return resp;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorResponse(503, msg);
  }
};
