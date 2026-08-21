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
  // === Türkçe finans kaynakları ===
  // Anadolu Ajansı — ekonomi
  { name: 'AA Ekonomi',     url: 'https://www.aa.com.tr/tr/rss/default?cat=ekonomi' },
  // BloombergHT — finans
  { name: 'BloombergHT',    url: 'https://www.bloomberght.com/rss' },
  // Mynet Finans
  { name: 'Mynet Finans',   url: 'https://www.mynet.com/finans/rss/' },
  // Habertürk Ekonomi
  { name: 'Habertürk',      url: 'https://www.haberturk.com/rss/kategori/ekonomi.xml' },
  // CNN Türk Ekonomi
  { name: 'CNN Türk',       url: 'https://www.cnnturk.com/feed/rss/ekonomi/news' },
  // Hürriyet Ekonomi
  { name: 'Hürriyet',       url: 'https://www.hurriyet.com.tr/rss/ekonomi' },
  // Sabah Ekonomi
  { name: 'Sabah',          url: 'https://www.sabah.com.tr/rss/ekonomi.xml' },
  // Dünya Gazetesi (finansal)
  { name: 'Dünya Gazetesi', url: 'https://www.dunya.com/rss?xml=ekonomi' },
  // Milliyet Ekonomi
  { name: 'Milliyet',       url: 'https://www.milliyet.com.tr/rss/rssNew/ekonomiRss.xml' },
  // Sözcü ekonomi
  { name: 'Sozcu',          url: 'https://www.sozcu.com.tr/feed/?cat=ekonomi' },

  // NOT: Investing.com, Reuters, FT, CNBC, WSJ, Bloomberg (EN) gibi INGILIZCE
  // kaynaklar TR kitlemize uygun degil — kullanici talebiyle whitelistten
  // cikarildi. Sadece TR finans kaynaklari tutuluyor.
];

// Ekstra savunma: RSS sonucu yine ingilizce domain icerebilir (Mynet
// Reuters mirror gibi). Bunlari da filtrele.
const BLOCKED_DOMAINS = new Set([
  'investing.com', 'tr.investing.com', 'reuters.com', 'bloomberg.com',
  'wsj.com', 'ft.com', 'cnbc.com', 'forbes.com',
]);
function isBlockedNewsDomain(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    return BLOCKED_DOMAINS.has(host);
  } catch {
    return false;
  }
}
function isTurkishText(text: string): boolean {
  if (!text) return false;
  return /[ığüşöçİĞÜŞÖÇ]/.test(text) ||
    /\b(ve|veya|için|ile|bir|bu|yatırım|borsa|hisse|fon|piyasa|banka|ekonomi|şirket|fiyat|açıklama|enflasyon|faiz)\b/i.test(text);
}

// Piyasa dışı içerik (şans oyunu, magazin, spor, astroloji vs.) — haber akışında yer almamalı.
// Kullanıcı geri bildirimi: "on numara sayısal vb şans oyunları verilerinin gelmesine gerek yok.
// daha can alıcı ana piyasaları ekonomik ve siyasi durumları etkileyecek haber akışı gelmeli"
const OFFTOPIC_PATTERNS: RegExp[] = [
  // Şans oyunları
  /\b(on\s?numara|sayısal\s?loto|sayisal\s?loto|süper\s?loto|super\s?loto|çılgın\s?sayısal|cilgin\s?sayisal|şans\s?topu|sans\s?topu|piyango|milli\s?piyango|iddaa|spor\s?toto|çeyrek\s?altın\s?çekiliş|çekiliş|cekilis|kazanan\s?numaralar|kazanan\s?rakam|talih\s?kuşu|talih\s?kusu|misli|tuttur|bilyoner)\b/i,
  // Magazin/dizi/reyting
  /\b(magazin|dizi\s?reyting|reyting|kısmetse\s?olur|survivor|yarışma|dedikodu|paparazzi|sevgili|nişan|nisan\s?töreni|boşanma|bosanma|düğün|dugun|kırmızı\s?halı|kirmizi\s?hali|sansasyon)\b/i,
  // Spor (futbol maçı, transfer vs.) — ekonomik değil
  /\b(gol\s?dakikaları|maç\s?sonucu|derbi|transfer\s?bombası|fikstür|puan\s?durumu|kupa\s?maçı|penaltı\s?atıcı|penalti|liglerde\s?bugün|milli\s?takım\s?maçı)\b/i,
  // Astroloji/burç
  /\b(burç\s?yorum|burc\s?yorum|astroloji|yıldıznamesi|yildiznamesi|günlük\s?burç|gunluk\s?burc|haftalık\s?burç|haftalik\s?burc|aylık\s?burç|aylik\s?burc)\b/i,
  // Diğer OFF-topic (yemek tarifi, sağlık öneri, çocuk isim vs.)
  /\b(yemek\s?tarifi|bebek\s?ismi|çocuk\s?ismi|cocuk\s?ismi|zayıflama\s?diyet|zayiflama\s?diyet|cilt\s?bakımı|cilt\s?bakimi|makyaj\s?ipucu|saç\s?bakımı|sac\s?bakimi)\b/i,
];
function isOfftopicNews(text: string): boolean {
  if (!text) return false;
  return OFFTOPIC_PATTERNS.some((p) => p.test(text));
}

// Basit BIST sembol algılayıcı
const BIST_SYMBOLS = [
  'AKBNK','GARAN','ISCTR','YKBNK','HALKB','VAKBN','KCHOL','SAHOL','TKFEN','DOHOL','ALARK',
  'ASELS','OTKAR','EREGL','KRDMD','SISE','PETKM','CIMSA','AKCNS','TUPRS','ENJSA','ZOREN','AKSEN',
  'TOASO','FROTO','DOAS','KARSN','THYAO','PGSUS','BIMAS','MGROS','SOKM','MAVI','ULKER',
  'TCELL','TTKOM','TURGG','ARCLK','VESTL','BJKAS','GSDHO','FENER','TRGYO','HEKTS','ENKAI',
];

// Şirket adı → ticker mapping. RSS başlıkları genelde ticker yerine şirket
// adı kullanır ("Türk Hava Yolları rekor kâr"). Bu mapping ile sembolü
// yakalayabiliyoruz. Anahtarlar normalize (Türkçe karakter → ASCII, küçük harf).
const COMPANY_TO_SYMBOL: Record<string, string[]> = {
  'turk hava yollari': ['THYAO'],
  'thy ': ['THYAO'],
  'garanti bbva': ['GARAN'],
  'garanti bankasi': ['GARAN'],
  'akbank': ['AKBNK'],
  'yapi kredi': ['YKBNK'],
  'yapi ve kredi': ['YKBNK'],
  'halkbank': ['HALKB'],
  'vakifbank': ['VAKBN'],
  'is bankasi': ['ISCTR'],
  'isbank': ['ISCTR'],
  'turkiye is bankasi': ['ISCTR'],
  'koc holding': ['KCHOL'],
  'sabanci': ['SAHOL'],
  'tupras': ['TUPRS'],
  'eregli demir': ['EREGL'],
  'eregli celik': ['EREGL'],
  'bim ': ['BIMAS'],
  'bim a.s': ['BIMAS'],
  'migros': ['MGROS'],
  'aselsan': ['ASELS'],
  'turkcell': ['TCELL'],
  'turk telekom': ['TTKOM'],
  'arcelik': ['ARCLK'],
  'ford otosan': ['FROTO'],
  'tofas': ['TOASO'],
  'pegasus': ['PGSUS'],
  'petkim': ['PETKM'],
  'sise cam': ['SISE'],
  'sisecam': ['SISE'],
  'cimsa': ['CIMSA'],
  'akcansa': ['AKCNS'],
  'enerjisa': ['ENJSA'],
  'enjisa': ['ENJSA'],
  'alarko': ['ALARK'],
  'aksa enerji': ['AKSEN'],
  'dogan holding': ['DOHOL'],
  'kardemir': ['KRDMD'],
  'otokar': ['OTKAR'],
  'karsan': ['KARSN'],
  'dogus otomotiv': ['DOAS'],
  'sok marketler': ['SOKM'],
  'sokm market': ['SOKM'],
  'ulker': ['ULKER'],
  'mavi giyim': ['MAVI'],
  'tekfen': ['TKFEN'],
  'besiktas': ['BJKAS'],
  'fenerbahce': ['FENER'],
  'galatasaray': ['GSRAY'],
  'torunlar gyo': ['TRGYO'],
  'hektas': ['HEKTS'],
  'enka insaat': ['ENKAI'],
  'tav havalimanlari': ['TAVHL'],
  'turk hava': ['THYAO'],
  'merkez bankasi': ['XU100'], // TCMB → BIST 100'ü etkiler
  'tcmb': ['XU100'],
  // Sektörel — genel kullanım
  'bist 100': ['XU100'],
  'bist100': ['XU100'],
  'borsa istanbul': ['XU100'],
};

/** Türkçe karakterleri ASCII'ye normalize et + küçük harfe çevir. */
function normalizeTr(s: string): string {
  return s
    .toLowerCase()
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/Ş/g, 's')
    .replace(/Ç/g, 'c')
    .replace(/Ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/Ö/g, 'o');
}

function detectSymbols(text: string): string[] {
  const upper = text.toUpperCase();
  const normalized = normalizeTr(text);
  const found = new Set<string>();
  // 1) Ticker eşleşmesi (TÜRK HAVA YOLLARI gibi tam kelime)
  for (const s of BIST_SYMBOLS) {
    if (new RegExp(`\\b${s}\\b`).test(upper)) found.add(s);
  }
  // 2) Şirket adı eşleşmesi (substring match — normalize edilmiş üzerinde)
  for (const [companyName, symbols] of Object.entries(COMPANY_TO_SYMBOL)) {
    if (normalized.includes(companyName)) {
      for (const sym of symbols) found.add(sym);
    }
  }
  return Array.from(found);
}

function scoreImportance(title: string, summary: string): number {
  const text = `${title} ${summary}`.toLowerCase();
  let score = 4;

  // --- Yuksek etkili global makro (piyasa hareket ettirir) ---
  if (/\b(fed|fomc|powell|jerome powell|ecb|lagarde|boj|boe|pboc)\b/.test(text)) score += 3;
  if (/(faiz karari|faiz indirim|faiz artis|interest rate decision|rate cut|rate hike)/.test(text)) score += 3;
  if (/(enflasyon|cpi|ppi|nfp|non.?farm|payroll|gdp|gsyih|issizlik|jobs report)/.test(text)) score += 2;

  // --- Yuksek etkili lokal makro ---
  if (/(merkez bankasi|tcmb|ppk|para politikasi kurulu)/.test(text)) score += 3;
  if (/(kapasite kullanim|sanayi uretim|imalat pmi|tuik|bist 100|xu100)/.test(text)) score += 1;

  // --- Doviz / emtia / piyasa hareketi ---
  if (/\b(dolar\/tl|usd\/try|euro\/tl|eur\/try|kur|swap|cds|risk primi)\b/.test(text)) score += 2;
  if (/(altin|gold|gumus|silver|brent|wti|petrol|natural gas|dogalgaz|bakir|copper)/.test(text)) score += 2;
  if (/(vix|volatility|panik|sert dusus|sert yukselis|cokus|rally|all.?time high|rekor)/.test(text)) score += 2;

  // --- Sirket / piyasa olayi ---
  if (/(ihale|sozlesme|anlasma|imzala|imzalan|m&a|satin alma|birlesme|takeover)/.test(text)) score += 2;
  if (/(milyar|big deal|kapasite|yatirim|fabrika|tahvil ihraci|bono ihraci|ipo|halka arz)/.test(text)) score += 1;
  if (/(iflas|kayip|zarar|skandal|bankruptcy|profit warning|kar uyari|temettu)/.test(text)) score += 2;
  if (/(downgrade|upgrade|rating|moody|fitch|s&p|kredi notu|nota indir|nota yukselt)/.test(text)) score += 2;
  if (/(spk|sermaye piyasasi|kap|bist|borsa istanbul|kar payi|kar paylasimi)/.test(text)) score += 1;

  // --- Jeopolitik / kriz (yuksek volatilite tetikleyici) ---
  if (/(savas|war|saldiri|attack|kriz|crisis|yaptirim|sanction|tariff|gumruk vergisi|trade war)/.test(text)) score += 2;
  if (/(opec|opec\+|enerji krizi|energy crisis|durgunluk|resesyon|recession)/.test(text)) score += 2;

  // --- Acil son dakika sinyali ---
  if (/(son dakika|breaking|flash|acil|urgent)/.test(text)) score += 2;

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

  // INGILIZCE icerik ele — domain blacklist + dil heuristic
  combined = combined.filter((n) => {
    if (isBlockedNewsDomain(n.url)) return false;
    // Eger baslik + summary'de tamamen TR-disi karakter varsa ele
    const blob = `${n.title} ${n.summary ?? ''}`;
    if (!blob.trim()) return false;
    // Kisa basliklarda heuristic yetersiz olabilir — bu yuzden sadece
    // baslik 30+ karakter ve TR-isareti yoksa ele
    if (blob.length > 30 && !isTurkishText(blob)) return false;
    // Piyasa dısı içerik (şans oyunu, magazin, spor, astroloji, life-style) — ele
    if (isOfftopicNews(blob)) return false;
    return true;
  });

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
