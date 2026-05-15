/**
 * Cloudflare Pages Function — Çoklu kaynaklı haber aggregator.
 *
 * RSS feed'lerinden Türkçe finans haberlerini birleştirir.
 * CORS engelinden bağımsız (server-side fetch).
 *
 * Kaynaklar:
 *   - Anadolu Ajansı (Ekonomi)
 *   - Mynet Finans
 *   - BloombergHT
 *   - Yahoo Finance (genel piyasa)
 *
 * Tarayıcı GET /api/news?max=20 çağırır → bu function tüm kaynakları paralel çeker,
 * tarih bazında sıralar, JSON döner.
 */

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
  symbols: string[];
  importance: number;
}

interface RssSource {
  name: string;
  url: string;
}

const SOURCES: RssSource[] = [
  // Anadolu Ajansı — ekonomi
  { name: 'AA Ekonomi',   url: 'https://www.aa.com.tr/tr/rss/default?cat=ekonomi' },
  // BloombergHT — anasayfa (genelinde finans)
  { name: 'BloombergHT',  url: 'https://www.bloomberght.com/rss' },
  // Mynet Finans
  { name: 'Mynet Finans', url: 'https://www.mynet.com/finans/rss/' },
  // Yahoo Finance — küresel piyasa
  { name: 'Yahoo Finance', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EDJI,%5EIXIC,USDTRY=X&region=US&lang=en-US' },
];

// Basit BIST sembol algılayıcı
const BIST_SYMBOLS = [
  'AKBNK','GARAN','ISCTR','YKBNK','HALKB','VAKBN','KCHOL','SAHOL','TKFEN','DOHOL','ALARK',
  'ASELS','OTKAR','EREGL','KRDMD','SISE','PETKM','CIMSA','AKCNS','TUPRS','ENJSA','ZOREN','AKSEN',
  'TOASO','FROTO','DOAS','KARSN','THYAO','PGSUS','BIMAS','MGROS','SOKM','MAVI','ULKER',
  'TCELL','TTKOM','TURGG','ARCLK','VESTL','BJKAS','GSDHO','FENER','TRGYO','HEKTS','ENKAI',
];

function detectSymbols(text: string): string[] {
  const upper = text.toUpperCase();
  return BIST_SYMBOLS.filter((s) => new RegExp(`\\b${s}\\b`).test(upper));
}

function scoreImportance(title: string, summary: string): number {
  const text = `${title} ${summary}`.toLowerCase();
  let score = 4;
  if (/i̇halesi|sözleşme|anlaşma|imzala|imzalan/.test(text)) score += 2;
  if (/milyar|büyük|kapasite|yatırım|fabrika/.test(text)) score += 1;
  if (/iflas|kayıp|zarar|açıklama|skandal/.test(text)) score += 2;
  if (/merkez bankası|tcmb|faiz kararı|enflasyon/.test(text)) score += 2;
  if (/bist|borsa istanbul|kap/.test(text)) score += 1;
  return Math.min(10, score);
}

// XML escape karakterlerini çöz
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '') // strip HTML tag'leri
    .trim();
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1]) : null;
}

/** Tek bir RSS feed'ini parse et — basit regex tabanlı (Workers'da DOMParser yok). */
function parseRss(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];
  // <item>...</item> blokları
  const itemMatches = xml.match(/<item[^>]*>[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemMatches) {
    const title = extractTag(block, 'title') ?? '';
    const link = extractTag(block, 'link') ?? '';
    const description = extractTag(block, 'description') ?? '';
    const pubDate = extractTag(block, 'pubDate') ?? extractTag(block, 'dc:date') ?? new Date().toISOString();
    if (!title || !link) continue;
    const publishedAt = (() => {
      try {
        const d = new Date(pubDate);
        return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
      } catch { return new Date().toISOString(); }
    })();
    const summary = description.slice(0, 280);
    items.push({
      id: `${sourceName}-${publishedAt}-${title.slice(0, 30)}`,
      title,
      summary,
      url: link,
      source: sourceName,
      publishedAt,
      symbols: detectSymbols(`${title} ${summary}`),
      importance: scoreImportance(title, summary),
    });
  }
  return items;
}

async function fetchSource(src: RssSource, timeoutMs = 6000): Promise<NewsItem[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(src.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HaneFinansBot/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    clearTimeout(t);
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRss(xml, src.name);
  } catch {
    return [];
  }
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const max = Math.min(parseInt(url.searchParams.get('max') ?? '30', 10) || 30, 60);
  const queryFilter = url.searchParams.get('q')?.toLowerCase() ?? '';

  // Tüm kaynaklardan paralel çek
  const results = await Promise.all(SOURCES.map((s) => fetchSource(s)));
  let combined: NewsItem[] = results.flat();

  // Query filtre (opsiyonel)
  if (queryFilter) {
    combined = combined.filter((n) =>
      n.title.toLowerCase().includes(queryFilter) ||
      n.summary.toLowerCase().includes(queryFilter),
    );
  }

  // Tarih → yeniden eskiye
  combined.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));

  // İlk N tane
  const data = combined.slice(0, max);

  return new Response(JSON.stringify({ ok: true, count: data.length, data }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
