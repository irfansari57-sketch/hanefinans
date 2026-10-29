/**
 * GET /api/stocks/:symbol/news?name=<Şirket Adı>&max=20
 *
 * Hisse başına KAP bildirimleri + haber (29 Eki 2026 yeniden yazım).
 *
 * BİRİNCİL KAYNAK — KAP (resmî): POST kap.org.tr/tr/api/disclosure/members/byCriteria, mkkMemberOidList =
 *   data/kap-members.json'daki şirket oid'i (scripts/kap_members_fetch.py, haftalık). Son 30 gün, tüm sınıflar
 *   (ÖDA, FR, DG, DKB…). Bildirim linki: kap.org.tr/tr/Bildirim/{disclosureIndex}. Kritik etiket: _critical.ts.
 *   Cloudflare → KAP erişimi 24 Eki 2026'da doğrulandı (/api/kap/proxy?probe=1).
 * İKİNCİL — Google News RSS (şirket adı + sembol): KAP boşsa/hata verirse. CF'den sık 503 dönüyor; başarısızsa
 *   sessizce atlanır. Hiçbir kaynak yoksa boş liste + `sources` alanında neden.
 *
 * Çıktı: {ok, symbol, count, asOf, sources:{kap:'ok'|'no-oid'|'error:…', news:'ok'|'skipped'|'error:…'},
 *         items:[{id,title,summary,url,source,publishedAt,critical,criticalReason,isKap,kapClass?,kapIndex?}]}
 * Edge cache 10 dk (KAP dolu), 2 dk (boş); hata no-store.
 */

import { detectCritical, splitGoogleTitle, extractXmlTag } from '../../_critical';
import { fetchWithTimeout } from '../../_fvt';

interface Env {}

interface SymbolNewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  critical: boolean;
  criticalReason?: string;
  isKap: boolean;
  kapClass?: string;
  kapIndex?: number;
}

const MEMBERS_URL = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/kap-members.json';
const KAP = 'https://kap.org.tr';
const KAP_DAYS = 30;
const MAX_AGE_MS = 21 * 24 * 3_600_000;
const KAP_CLASS_LABEL: Record<string, string> = { ODA: 'Özel Durum Açıklaması', FR: 'Finansal Rapor', DG: 'Diğer Bildirim', DKB: 'Düzenleyici Kurum', DUY: 'Duyuru', CA: 'Sermaye Artırımı/Hak Kullanımı' };

/** "27.10.2026 19:04:51" (TR saati) → ISO */
function kapDateToIso(s: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0) - 3, +(m[5] ?? 0), +(m[6] ?? 0)));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

async function fetchKapItems(symbol: string): Promise<{ items: SymbolNewsItem[]; status: string }> {
  let oid: string | undefined;
  try {
    const r = await fetch(MEMBERS_URL, { cf: { cacheTtl: 21600, cacheEverything: true } as RequestInitCfProperties });
    if (!r.ok) return { items: [], status: `members HTTP ${r.status}` };
    const j = (await r.json()) as { members?: Record<string, { oid: string }> };
    oid = j.members?.[symbol]?.oid;
  } catch (e) { return { items: [], status: `members: ${e instanceof Error ? e.message : String(e)}` }; }
  if (!oid) return { items: [], status: 'no-oid' };

  const to = new Date(); const from = new Date(to.getTime() - KAP_DAYS * 86_400_000);
  const body = {
    fromDate: isoDate(from), toDate: isoDate(to), memberType: 'IGS', mkkMemberOidList: [oid], inactiveMkkMemberOidList: [],
    disclosureClass: '', subjectList: [], isLate: '', mainSector: '', sector: '', subSector: '', marketOid: '', index: '',
    bdkReview: '', bdkMemberOidList: [], year: '', term: '', ruleType: '', period: '', fromSrc: false, srcCategory: '', disclosureIndexList: [],
  };
  const r = await fetchWithTimeout(`${KAP}/tr/api/disclosure/members/byCriteria`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', 'Accept-Language': 'tr-TR,tr;q=0.9', Referer: `${KAP}/tr/bildirim-sorgu`, Origin: KAP },
    body: JSON.stringify(body),
  }, 15000);
  if (!r || !r.ok) return { items: [], status: `kap HTTP ${r?.status ?? 'timeout'}` };
  const arr = (await r.json()) as Array<{ publishDate: string; kapTitle?: string; disclosureClass?: string; subject?: string; summary?: string; disclosureIndex?: number; stockCodes?: string | null; relatedStocks?: string | null }>;
  if (!Array.isArray(arr)) return { items: [], status: 'kap: beklenmeyen yanıt' };
  const items: SymbolNewsItem[] = [];
  for (const a of arr) {
    const iso = kapDateToIso(a.publishDate);
    if (!iso || !a.disclosureIndex) continue;
    const subject = (a.subject ?? '').trim();
    const summary = (a.summary ?? '').trim();
    const title = subject && summary && summary.toLocaleLowerCase('tr') !== subject.toLocaleLowerCase('tr') ? `${subject} — ${summary}` : (subject || summary || 'KAP bildirimi');
    const crit = detectCritical(subject, summary);
    const cls = a.disclosureClass ?? '';
    const byMkk = /MERKEZİ KAYIT/i.test(a.kapTitle ?? '');
    items.push({
      id: `kap-${symbol}-${a.disclosureIndex}`,
      title: title.slice(0, 200),
      summary: summary.slice(0, 240),
      url: `${KAP}/tr/Bildirim/${a.disclosureIndex}`,
      source: byMkk ? 'KAP · MKK' : `KAP · ${KAP_CLASS_LABEL[cls] ?? (cls || 'Bildirim')}`,
      publishedAt: iso,
      critical: crit.critical,
      criticalReason: crit.reason,
      isKap: true,
      kapClass: cls,
      kapIndex: a.disclosureIndex,
    });
  }
  return { items, status: 'ok' };
}

function buildQuery(symbol: string, name: string | null): string {
  const parts: string[] = [];
  if (name && name.length >= 3) {
    const cleaned = name
      .replace(/\b(A\.?Ş\.?|T\.?A\.?Ş\.?|SAN(AYİ|AYI)?\.?|TİC(ARET)?\.?|VE|HOLDİNG|HOLDING|LTD\.?|ŞTİ\.?)\b/gi, ' ')
      .replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = cleaned.split(' ').filter((w) => w.length > 1).slice(0, 3).join(' ');
    if (words) parts.push(`"${words}"`);
  }
  parts.push(symbol);
  return `(${parts.join(' OR ')}) (borsa OR KAP OR hisse OR bildirim)`;
}

async function fetchGoogleItems(symbol: string, name: string | null): Promise<{ items: SymbolNewsItem[]; status: string }> {
  const q = buildQuery(symbol, name);
  const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=tr&gl=TR&ceid=TR:tr`;
  const r = await fetchWithTimeout(rss, { headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  } }, 12000);
  if (!r || !r.ok) return { items: [], status: `news HTTP ${r?.status ?? 'timeout'}` };
  const xml = await r.text();
  const now = Date.now();
  const items: SymbolNewsItem[] = [];
  const seen = new Set<string>();
  for (const block of xml.match(/<item[^>]*>[\s\S]*?<\/item>/g) ?? []) {
    const rawTitle = extractXmlTag(block, 'title') ?? '';
    const link = extractXmlTag(block, 'link') ?? '';
    const pub = extractXmlTag(block, 'pubDate');
    if (!rawTitle || !link || !pub) continue;
    const d = new Date(pub);
    if (!Number.isFinite(d.getTime()) || now - d.getTime() > MAX_AGE_MS || d.getTime() > now + 7_200_000) continue;
    const { title, source } = splitGoogleTitle(rawTitle);
    const key = title.toLowerCase().replace(/[^a-zçğıöşü0-9]+/g, ' ').trim().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    const desc = extractXmlTag(block, 'description') ?? '';
    const crit = detectCritical(title, desc);
    items.push({
      id: `sym-${symbol}-${d.getTime()}-${key.slice(0, 20)}`, title, summary: desc.slice(0, 240), url: link,
      source: source ?? 'Google News', publishedAt: d.toISOString(), critical: crit.critical, criticalReason: crit.reason,
      isKap: /\bKAP\b|kamuyu ayd[ıi]nlatma|özel durum a[çc][ıi]klamas[ıi]/i.test(`${title} ${desc}`),
    });
  }
  return { items, status: 'ok' };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, params, waitUntil }) => {
  const symbol = String(params.symbol ?? '').toUpperCase().trim();
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
    return new Response(JSON.stringify({ ok: false, error: 'Geçersiz sembol' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') ?? '').slice(0, 80) || null;
  const max = Math.min(60, Math.max(5, parseInt(url.searchParams.get('max') ?? '30', 10) || 30));
  const force = url.searchParams.get('force') === '1';

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cv', '2'); // 29 Eki 2026: KAP birincil kaynak
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  if (!force) { const hit = await cache.match(cacheKey); if (hit) return hit; }

  const [kap, news] = await Promise.all([
    fetchKapItems(symbol).catch((e) => ({ items: [] as SymbolNewsItem[], status: `kap: ${e instanceof Error ? e.message : String(e)}` })),
    fetchGoogleItems(symbol, name).catch((e) => ({ items: [] as SymbolNewsItem[], status: `news: ${e instanceof Error ? e.message : String(e)}` })),
  ]);
  const items = [...kap.items, ...news.items];
  // Kritik üstte, sonra tarih
  items.sort((a, b) => Number(b.critical) - Number(a.critical) || b.publishedAt.localeCompare(a.publishedAt));
  const data = items.slice(0, max);

  const ttl = data.length === 0 ? 120 : 600;
  const resp = new Response(
    JSON.stringify({ ok: true, symbol, count: data.length, kapCount: kap.items.length, asOf: new Date().toISOString(), sources: { kap: kap.status, news: news.status }, items: data }),
    { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=1800` } },
  );
  if (!force) waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
  return resp;
};
