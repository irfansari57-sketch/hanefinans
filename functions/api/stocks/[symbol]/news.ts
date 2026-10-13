/**
 * GET /api/stocks/:symbol/news?name=<Şirket Adı>&max=20
 *
 * Hisse başına haber + KAP gelişmeleri (13 Eki 2026, Faz 2 #4).
 *
 * Neden Google News RSS: KAP'ın web arayüzü otomasyona kapalı (bot koruması),
 * resmi API yok; FVT'de hisse-haber uç noktası yok. Google News 2 haftalık arşiv +
 * tüm TR finans sitelerini kapsıyor ve KAP bildirimlerini yansıtan haberleri
 * (Paratic, Hisse.net, BorsaGündem, Ekonomim…) tek sorguda getiriyor.
 *
 * Sorgu: "<Şirket Adı>" OR <SYMBOL> + (borsa OR KAP OR hisse) — şirket adı
 * istemciden gelir (bistAll.ts), yoksa sadece sembol.
 *
 * Çıktı: {ok, symbol, items:[{id,title,summary,url,source,publishedAt,critical,criticalReason,isKap}], asOf}
 * Edge cache 10 dk; boş sonuç 60 sn; hata no-store.
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
  /** Başlık/özet KAP bildirimi olduğunu söylüyor mu */
  isKap: boolean;
}

const MAX_AGE_MS = 21 * 24 * 3_600_000; // Google News arşiv penceresi

function buildQuery(symbol: string, name: string | null): string {
  const parts: string[] = [];
  if (name && name.length >= 3) {
    // "ŞOK MARKETLER TİCARET A.Ş." → "Şok Marketler" (hukuki ekleri at)
    const cleaned = name
      .replace(/\b(A\.?Ş\.?|T\.?A\.?Ş\.?|SAN(AYİ|AYI)?\.?|TİC(ARET)?\.?|VE|HOLDİNG|HOLDING|LTD\.?|ŞTİ\.?)\b/gi, ' ')
      .replace(/[.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = cleaned.split(' ').filter((w) => w.length > 1).slice(0, 3).join(' ');
    if (words) parts.push(`"${words}"`);
  }
  parts.push(symbol);
  return `(${parts.join(' OR ')}) (borsa OR KAP OR hisse OR bildirim)`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, params }) => {
  const symbol = String(params.symbol ?? '').toUpperCase().trim();
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
    return new Response(JSON.stringify({ ok: false, error: 'Geçersiz sembol' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') ?? '').slice(0, 80) || null;
  const max = Math.min(40, Math.max(5, parseInt(url.searchParams.get('max') ?? '20', 10) || 20));

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cv', '1');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const q = buildQuery(symbol, name);
  const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=tr&gl=TR&ceid=TR:tr`;

  const r = await fetchWithTimeout(
    rss,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
    },
    15000,
  );
  if (!r || !r.ok) {
    return new Response(JSON.stringify({ ok: false, error: `Google News ${r?.status ?? 'timeout'}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

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
      id: `sym-${symbol}-${d.getTime()}-${key.slice(0, 20)}`,
      title,
      summary: desc.slice(0, 240),
      url: link,
      source: source ?? 'Google News',
      publishedAt: d.toISOString(),
      critical: crit.critical,
      criticalReason: crit.reason,
      isKap: /\bKAP\b|kamuyu ayd[ıi]nlatma|özel durum a[çc][ıi]klamas[ıi]|bildirim/i.test(`${title} ${desc}`),
    });
  }

  // Kritik üstte, sonra tarih
  items.sort((a, b) => Number(b.critical) - Number(a.critical) || b.publishedAt.localeCompare(a.publishedAt));
  const data = items.slice(0, max);

  const ttl = data.length === 0 ? 60 : 600;
  const resp = new Response(
    JSON.stringify({ ok: true, symbol, query: q, count: data.length, asOf: new Date().toISOString(), source: 'Google News', items: data }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=1800`,
      },
    },
  );
  cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ });
  return resp;
};
