/**
 * /api/stocks/:symbol/financials
 *
 * BIST hissesi için şirket mali tablolarını İş Yatırım'ın herkese açık
 * "Mali Tablolar" verisinden proxy eder (21 Eki 2026):
 *   - fvt.com.tr 19 Eki 2026'dan itibaren API'sini kapattı (401/429); bu erişim
 *     kontrolünü AŞMIYORUZ. Kaynak İş Yatırım'a taşındı.
 *   - Bilanço + Gelir Tablosu + Nakit Akış — son 8 çeyrek (2 istek x 4 dönem)
 *   - Çarpanlar (FK, PDDD, FD/FAVÖK) bu kaynakta yok → carpanlar: null
 *
 * Dönüş şeması FVT dönemiyle aynı tutuldu (UI: FinancialStatementsCard):
 *   {ok, symbol, source, attribution, asOf, inflationAdjusted, cumulativeIncome,
 *    updatedAt, lastReport, periods:[{donem, donemTarihi, toplamVarliklar, ozsermaye,
 *    netBorc, netSatis, brutKar, faaliyetKari, favok, netKar, nakitNakitBenzerleri,
 *    gonderimTarihi, bilanco, gelirTablosu, nakitAkis}], carpanlar:null}
 *
 * Kaynak endpoint (GET, isyatirimhisse Python kütüphanesinin de kullandığı):
 *   https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo
 *     ?companyCode=THYAO&exchange=TRY&financialGroup=XI_29
 *     &year1=2026&period1=9&year2=2026&period2=6&year3=2026&period3=3&year4=2025&period4=12
 *   → { value: [ { itemCode, itemDescTr, itemDescEng, value1, value2, value3, value4 }, ... ] }
 *   financialGroup: XI_29 (sanayi/holding) → boşsa UFRS (banka) → boşsa UFRS_K.
 *   period: 3/6/9/12 — gelir tablosu/nakit akış kalemleri yılbaşından KÜMÜLATİF.
 *
 * Notlar:
 *   - TMS 29: 2024+ dönemler enflasyon muhasebesine göre düzeltilmiştir → inflationAdjusted:true
 *   - Kalem eşlemesi itemDescTr üzerinden (normalize edilmiş); eşleşmeyen alan null.
 *   - Ağaç tablolar itemCode önek hiyerarşisinden kurulur ("1A" → "1AA" → "1AAA").
 *   - Hata: 503 + no-store. Başarı: edge cache 6 saat.
 */

interface Env {}

interface IsyMaliTabloItem {
  itemCode: string;
  itemDescTr: string;
  itemDescEng?: string;
  value1: unknown;
  value2: unknown;
  value3: unknown;
  value4: unknown;
}

interface IsyMaliTabloResp {
  value?: IsyMaliTabloItem[] | null;
}

interface TreeNode {
  key: string;
  label: string;
  value: number | null;
  children: TreeNode[];
}

interface QuarterRef {
  year: number;
  period: 3 | 6 | 9 | 12;
}

interface PeriodOut {
  donem: string;
  donemTarihi: string;
  toplamVarliklar: number | null;
  ozsermaye: number | null;
  netBorc: number | null;
  netSatis: number | null;
  brutKar: number | null;
  faaliyetKari: number | null;
  favok: number | null;
  netKar: number | null;
  nakitNakitBenzerleri: number | null;
  gonderimTarihi: string;
  bilanco: TreeNode[] | null;
  gelirTablosu: TreeNode[] | null;
  nakitAkis: TreeNode[] | null;
}

const ISY_MALI_TABLO_URL =
  'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo';

const ISY_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx',
};

/** Sırayla denenecek mali tablo grupları: sanayi/holding → banka → banka (konsolide). */
const FINANCIAL_GROUPS = ['XI_29', 'UFRS', 'UFRS_K'] as const;

/** Kaç çeyrek istenir (4'ün katı; her 4 çeyrek = 1 istek). */
const QUARTERS_WANTED = 8;

const CACHE_TTL = 6 * 3600;

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** İş Yatırım değerleri: sayı, düz sayı string'i ("123456") veya TR biçimli ("1.234,5"). */
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s === '-') return null;
  let n: number;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    n = parseFloat(s);
  } else if (s.includes(',')) {
    n = parseFloat(s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  } else {
    n = parseFloat(s.replace(/\s/g, '').replace(/\./g, ''));
  }
  return Number.isFinite(n) ? n : null;
}

const TR_FOLD: Record<string, string> = {
  'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g', 'ı': 'i', 'I': 'i', 'İ': 'i', 'i': 'i',
  'ö': 'o', 'Ö': 'o', 'ş': 's', 'Ş': 's', 'ü': 'u', 'Ü': 'u',
};

/** "ÖZKAYNAKLAR" → "ozkaynaklar"; "Brüt Kar (Zarar)" → "brut kar zarar" */
function norm(s: string): string {
  return s
    .replace(/[çÇğĞıIİiöÖşŞüÜ]/g, (ch) => TR_FOLD[ch] ?? ch)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slug(s: string): string {
  return norm(s).replace(/\s+/g, '_');
}

/**
 * Bugünden geriye son N çeyrek (en yeni önce). Henüz bitmemiş çeyrek dahil edilmez;
 * yeni biten ama yayınlanmamış çeyrek (ör. 2026/9 Ekim'de) istenir, boş gelirse atlanır.
 */
function lastQuarters(n: number, now = new Date()): QuarterRef[] {
  const out: QuarterRef[] = [];
  let year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1..12
  // Son BİTMİŞ çeyrek: ay 1-3 → önceki yıl 12; 4-6 → 3; 7-9 → 6; 10-12 → 9
  let period: 3 | 6 | 9 | 12;
  if (month <= 3) { period = 12; year -= 1; }
  else if (month <= 6) period = 3;
  else if (month <= 9) period = 6;
  else period = 9;
  while (out.length < n) {
    out.push({ year, period });
    if (period === 3) { period = 12; year -= 1; }
    else period = (period - 3) as 3 | 6 | 9 | 12;
  }
  return out;
}

function quarterEndDate(q: QuarterRef): string {
  const lastDay = q.period === 3 ? 31 : q.period === 6 ? 30 : q.period === 9 ? 30 : 31;
  return `${q.year}-${String(q.period).padStart(2, '0')}-${lastDay}`;
}

function buildUrl(symbol: string, group: string, quarters: QuarterRef[]): string {
  const u = new URL(ISY_MALI_TABLO_URL);
  u.searchParams.set('companyCode', symbol);
  u.searchParams.set('exchange', 'TRY');
  u.searchParams.set('financialGroup', group);
  quarters.forEach((q, i) => {
    u.searchParams.set(`year${i + 1}`, String(q.year));
    u.searchParams.set(`period${i + 1}`, String(q.period));
  });
  return u.toString();
}

async function fetchMaliTablo(
  symbol: string,
  group: string,
  quarters: QuarterRef[],
): Promise<IsyMaliTabloItem[] | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(buildUrl(symbol, group, quarters), { headers: ISY_HEADERS, signal: ctrl.signal });
    if (!r.ok) return null;
    const text = await r.text();
    if (!text || text.length < 10) return null;
    let j: IsyMaliTabloResp;
    try {
      j = JSON.parse(text) as IsyMaliTabloResp;
    } catch {
      return null;
    }
    if (!Array.isArray(j.value) || j.value.length === 0) return null;
    return j.value.filter((it) => it && typeof it.itemCode === 'string' && typeof it.itemDescTr === 'string');
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Kalem eşlemesi (itemDescTr → bizim alan). Normalize edilmiş karşılaştırma.
// Liste sırası = öncelik; sadece belirtilen bölüm (itemCode ilk karakteri) içinde aranır.
//   1 = Bilanço Varlıklar, 2 = Bilanço Kaynaklar, 3 = Gelir Tablosu, 4 = Nakit Akış
// ---------------------------------------------------------------------------

interface ItemMatcher {
  sections: string[]; // itemCode ilk karakterleri; boş → tümü
  names: string[];    // normalize edilmiş itemDescTr adayları (tam eşleşme)
}

const M = (sections: string[], ...names: string[]): ItemMatcher => ({
  sections,
  names: names.map(norm),
});

const MATCHERS = {
  netSatis: M(['3'], 'Satış Gelirleri', 'Hasılat', 'SATIŞ GELİRLERİ', 'Toplam Hasılat', 'Net Satışlar'),
  brutKar: M(['3'], 'BRÜT KAR (ZARAR)', 'Brüt Kar (Zarar)', 'Ticari Faaliyetlerden Brüt Kar (Zarar)', 'BRÜT KAR/ZARAR'),
  faaliyetKari: M(['3'], 'FAALİYET KARI (ZARARI)', 'Esas Faaliyet Karı (Zararı)', 'ESAS FAALİYET KARI (ZARARI)', 'Faaliyet Karı/Zararı'),
  netKar: M(
    ['3'],
    'Dönem Net Karı/Zararı',
    'DÖNEM NET KARI/ZARARI',
    'Dönem Net Kar/Zararı',
    'DÖNEM KARI (ZARARI)',
    'Dönem Karı (Zararı)',
    'Net Dönem Karı/Zararı',
    'SÜRDÜRÜLEN FAALİYETLER DÖNEM KARI/ZARARI',
  ),
  toplamVarliklar: M(['1', '2'], 'TOPLAM VARLIKLAR', 'Toplam Varlıklar', 'AKTİF TOPLAMI', 'Toplam Aktifler', 'VARLIKLAR TOPLAMI'),
  ozsermaye: M(['2', '1'], 'ÖZKAYNAKLAR', 'Özkaynaklar', 'TOPLAM ÖZKAYNAKLAR', 'Toplam Özkaynaklar', 'Ana Ortaklığa Ait Özkaynaklar'),
  nakit: M(['1'], 'Nakit ve Nakit Benzerleri', 'NAKİT VE NAKİT BENZERLERİ', 'Nakit Değerler ve Merkez Bankası'),
  amortisman: M(
    ['4', '3'],
    'Amortisman ve İtfa Gideri İle İlgili Düzeltmeler',
    'Amortisman ve İtfa Giderleri İle İlgili Düzeltmeler',
    'Amortisman Giderleri',
    'Amortisman ve İtfa Payları',
    'Amortisman',
  ),
} as const;

/** Net borç için toplanacak finansal borç kalemleri (bölüm 2, birden çok eşleşme toplanır). */
const FIN_BORC_NAMES = new Set(
  [
    'Finansal Borçlar',
    'Kısa Vadeli Borçlanmalar',
    'Uzun Vadeli Borçlanmalar',
    'Uzun Vadeli Borçlanmaların Kısa Vadeli Kısımları',
    'Kısa Vadeli Finansal Borçlar',
    'Uzun Vadeli Finansal Borçlar',
  ].map(norm),
);

const VALUE_KEYS = ['value1', 'value2', 'value3', 'value4'] as const;

function findItem(items: IsyMaliTabloItem[], m: ItemMatcher): IsyMaliTabloItem | null {
  for (const name of m.names) {
    const hit = items.find(
      (it) => (m.sections.length === 0 || m.sections.includes(it.itemCode.charAt(0))) && norm(it.itemDescTr) === name,
    );
    if (hit) return hit;
  }
  return null;
}

function valueAt(it: IsyMaliTabloItem | null, idx: number): number | null {
  if (!it) return null;
  return toNum(it[VALUE_KEYS[idx]]);
}

/** Bir dönemde (idx) hiç sayısal değer var mı? Yoksa dönem henüz yayınlanmamış. */
function periodHasData(items: IsyMaliTabloItem[], idx: number): boolean {
  return items.some((it) => valueAt(it, idx) != null);
}

// ---------------------------------------------------------------------------
// Ağaç tablolar — itemCode önek hiyerarşisi
// ---------------------------------------------------------------------------

function buildTree(items: IsyMaliTabloItem[], sectionChars: string[], rootLabel: string, idx: number): TreeNode[] | null {
  const sec = items.filter((it) => sectionChars.includes(it.itemCode.charAt(0)));
  if (sec.length === 0) return null;
  const byCode = new Map<string, TreeNode>();
  const sorted = [...sec].sort((a, b) => a.itemCode.localeCompare(b.itemCode));
  for (const it of sorted) {
    if (byCode.has(it.itemCode)) continue; // yinelenen kod → ilkini tut
    byCode.set(it.itemCode, {
      key: `${it.itemCode.toLowerCase()}_${slug(it.itemDescTr)}`,
      label: it.itemDescTr.trim(),
      value: valueAt(it, idx),
      children: [],
    });
  }
  const root: TreeNode = { key: slug(rootLabel), label: rootLabel, value: null, children: [] };
  for (const [code, node] of byCode) {
    let parent: TreeNode | null = null;
    for (let len = code.length - 1; len >= 2; len--) {
      const p = byCode.get(code.slice(0, len));
      if (p) { parent = p; break; }
    }
    (parent ?? root).children.push(node);
  }
  return root.children.length > 0 ? [root] : null;
}

function buildPeriod(items: IsyMaliTabloItem[], q: QuarterRef, idx: number): PeriodOut {
  const netSatis = valueAt(findItem(items, MATCHERS.netSatis), idx);
  const brutKar = valueAt(findItem(items, MATCHERS.brutKar), idx);
  const faaliyetKari = valueAt(findItem(items, MATCHERS.faaliyetKari), idx);
  const netKar = valueAt(findItem(items, MATCHERS.netKar), idx);
  const toplamVarliklar = valueAt(findItem(items, MATCHERS.toplamVarliklar), idx);
  const ozsermaye = valueAt(findItem(items, MATCHERS.ozsermaye), idx);
  const nakit = valueAt(findItem(items, MATCHERS.nakit), idx);
  const amortisman = valueAt(findItem(items, MATCHERS.amortisman), idx);

  // FAVÖK = Esas faaliyet kârı + amortisman/itfa (nakit akış düzeltmesi). Biri yoksa null.
  const favok = faaliyetKari != null && amortisman != null ? faaliyetKari + Math.abs(amortisman) : null;

  // Net borç = (KV + UV finansal borçlar) − nakit. Hiç borç kalemi yoksa null.
  let borc: number | null = null;
  for (const it of items) {
    if (it.itemCode.charAt(0) !== '2') continue;
    if (!FIN_BORC_NAMES.has(norm(it.itemDescTr))) continue;
    const v = valueAt(it, idx);
    if (v != null) borc = (borc ?? 0) + v;
  }
  const netBorc = borc != null && nakit != null ? borc - nakit : null;

  // Bilanço ağacı: Varlıklar (1) + Kaynaklar (2) iki kök
  const varliklar = buildTree(items, ['1'], 'VARLIKLAR', idx);
  const kaynaklar = buildTree(items, ['2'], 'KAYNAKLAR', idx);
  const bilanco = varliklar || kaynaklar ? [...(varliklar ?? []), ...(kaynaklar ?? [])] : null;

  return {
    donem: `${q.year}/${q.period}`,
    donemTarihi: quarterEndDate(q),
    toplamVarliklar,
    ozsermaye,
    netBorc,
    netSatis,
    brutKar,
    faaliyetKari,
    favok,
    netKar,
    nakitNakitBenzerleri: nakit,
    // İş Yatırım KAP gönderim tarihini vermiyor; uydurmuyoruz.
    gonderimTarihi: '',
    bilanco,
    gelirTablosu: buildTree(items, ['3'], 'GELİR TABLOSU', idx),
    nakitAkis: buildTree(items, ['4'], 'NAKİT AKIŞ TABLOSU', idx),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequest: PagesFunction<Env> = async ({ request, params, waitUntil }) => {
  const symbol = String(params.symbol ?? '').toUpperCase().trim().replace(/\.IS$/, '');
  if (!symbol || symbol.length > 10 || !/^[A-Z0-9]+$/.test(symbol)) {
    return errorResponse(400, 'Geçersiz sembol');
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  // cv=3: kaynak İş Yatırım'a taşındı (FVT kapandı)
  cacheUrl.searchParams.set('cv', '3');
  cacheUrl.searchParams.delete('force');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  if (!force) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached && cached.ok) return cached;
    } catch { /* cache yoksa devam */ }
  }

  try {
    const quarters = lastQuarters(QUARTERS_WANTED);
    const batches: QuarterRef[][] = [];
    for (let i = 0; i < quarters.length; i += 4) batches.push(quarters.slice(i, i + 4));

    // Grup tespiti ilk (en güncel) batch ile: XI_29 → UFRS → UFRS_K
    let group: string | null = null;
    let firstItems: IsyMaliTabloItem[] | null = null;
    for (const g of FINANCIAL_GROUPS) {
      const items = await fetchMaliTablo(symbol, g, batches[0]);
      if (items && items.length > 0 && VALUE_KEYS.some((_, idx) => periodHasData(items, idx))) {
        group = g;
        firstItems = items;
        break;
      }
    }
    if (!group || !firstItems) {
      return errorResponse(503, 'İş Yatırım mali tablo verisi alınamadı');
    }

    const rest = await Promise.all(batches.slice(1).map((b) => fetchMaliTablo(symbol, group as string, b)));
    const batchItems: (IsyMaliTabloItem[] | null)[] = [firstItems, ...rest];

    const periods: PeriodOut[] = [];
    batches.forEach((b, bi) => {
      const items = batchItems[bi];
      if (!items) return;
      b.forEach((q, idx) => {
        if (!periodHasData(items, idx)) return; // henüz yayınlanmamış / boş dönem
        periods.push(buildPeriod(items, q, idx));
      });
    });

    if (periods.length === 0) {
      return errorResponse(503, 'İş Yatırım mali tablo verisi boş');
    }

    const asOf = periods[0].donem;
    const body = {
      ok: true,
      symbol,
      source: 'isyatirim',
      attribution: 'İş Yatırım mali tablolar',
      financialGroup: group,
      asOf,
      // TMS 29: 2024 ve sonrası dönemler enflasyon muhasebesine göre düzeltilmiştir
      inflationAdjusted: true,
      // Gelir tablosu / nakit akış kalemleri yılbaşından kümülatif (İş Yatırım formatı)
      cumulativeIncome: true,
      updatedAt: new Date().toISOString(),
      lastReport: asOf,
      periods,
      // İş Yatırım mali tablo servisinde çarpan yok
      carpanlar: null,
    };

    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}, stale-while-revalidate=${CACHE_TTL}`,
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
