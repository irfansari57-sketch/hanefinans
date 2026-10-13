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
  critical?: boolean;
  criticalReason?: string;
}

/**
 * Kritik finansal bildirim tespiti — yatırımcıyı birebir ilgilendiren,
 * fiyatı anında etkileyen olaylar. Eşleşme bulunursa importance=10, critical=true.
 */
const CRITICAL_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(konkordato)\b/i, reason: 'Konkordato' },
  { re: /\b(iflas(?:\s+erteleme)?|iflas\s+istedi|iflas\s+basvurusu|iflas\s+başvuru|iflas\s+kararı|iflas\s+karari)\b/i, reason: 'İflas' },
  { re: /\b(kayy[ıi]m|kayyum\s+atan)\b/i, reason: 'Kayyım' },
  { re: /\b(tedbir\s+karar|ihtiyati\s+tedbir|tedbirli\s+pazar)\b/i, reason: 'Tedbir' },
  { re: /\b(haciz\s+karar|haczedild)\b/i, reason: 'Haciz' },
  { re: /\b(delisting|borsadan\s+çıkar|kottan\s+çıkar|borsadan\s+cikar|kottan\s+cikar)\b/i, reason: 'Borsadan Çıkarma' },
  { re: /\b(spk\s+(?:ceza|para\s+cezas|idari\s+para)|sermaye\s+piyasası\s+kurulu\s+ceza)\b/i, reason: 'SPK Cezası' },
  { re: /\b(muvazaa|manip[üu]lasyon\s+iddia|insider\s+trading|içeriden\s+öğrenen|iceriden\s+ogrenen)\b/i, reason: 'Manipülasyon' },
  { re: /\b(bedelsiz\s+sermaye\s+artırım|bedelsiz\s+sermaye\s+artirim)\b/i, reason: 'Bedelsiz Sermaye' },
  { re: /\b(pay\s+geri\s+alım|pay\s+geri\s+alim|buyback)\b/i, reason: 'Pay Geri Alımı' },
  { re: /\b(halka\s+arz\s+(?:başvuru|basvuru|izahname|onay))\b/i, reason: 'Halka Arz' },
  { re: /\b(profit\s+warning|kar\s+uyarı|kar\s+uyari|rekor\s+zarar|dönem\s+zararı|donem\s+zarari)\b/i, reason: 'Kar Uyarısı' },
  { re: /\b(önemli\s+nitelikte\s+işlem|onemli\s+nitelikte\s+islem)\b/i, reason: 'Önemli Nitelikte İşlem' },
];

function detectCritical(title: string, summary: string): { critical: boolean; reason?: string } {
  const text = `${title} ${summary}`;
  for (const { re, reason } of CRITICAL_PATTERNS) {
    if (re.test(text)) return { critical: true, reason };
  }
  return { critical: false };
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

  // === KAP / BIST-özel kaynaklar (11 Eki 2026 eklendi) ===
  // Yatırımcıyı birebir ilgilendiren konkordato/iflas/tedbir gibi
  // KAP bildirimlerini en hızlı yakalayan Türkçe borsa haberleri.
  { name: 'Paratic',        url: 'https://paratic.com/feed/' },
  { name: 'BorsaGundem',    url: 'https://www.borsagundem.com.tr/rss/haberler.xml' },
  { name: 'UzmanPara',      url: 'https://uzmanpara.milliyet.com.tr/rss/hisse-haberleri-tum' },

  // === Google News kritik event aramaları — RSS feed'leri saat/gün rotasyonu
  // yaparken Google News 2 hafta geriye dönük sonuç verir. Konkordato,
  // iflas, kayyım, SPK ceza gibi yatırımcı için kritik olayları garantili
  // yakalar — kaynağı site önemsiz, haber yakalanır.
  { name: 'Google News · Konkordato',
    url: 'https://news.google.com/rss/search?q=konkordato+(KAP+OR+borsa+OR+hisse)&hl=tr&gl=TR&ceid=TR:tr' },
  { name: 'Google News · İflas/Kayyım',
    url: 'https://news.google.com/rss/search?q=(iflas+OR+kayy%C4%B1m)+(borsa+OR+KAP+OR+hisse)&hl=tr&gl=TR&ceid=TR:tr' },
  { name: 'Google News · SPK/Tedbir',
    url: 'https://news.google.com/rss/search?q=(SPK+ceza+OR+tedbirli+pazar+OR+%22borsadan+%C3%A7%C4%B1kar%22)&hl=tr&gl=TR&ceid=TR:tr' },

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
  // 11 Eki 2026 güçlendirildi: BJKAS/FENER/GSRAY BIST sembolleri olduğundan takım
  // adlarını doğrudan değil, futbol-özel verblerle birlikte eşle.
  /\b(gol\s?dakikaları|maç\s?sonucu|derbi|transfer\s?bombası|fikstür|puan\s?durumu|kupa\s?maçı|penaltı\s?atıcı|penalti|liglerde\s?bugün|milli\s?takım\s?maçı)\b/i,
  /\b(S[üu]per\s?Lig|Trendyol\s?S[üu]per|1\.\s?Lig|TFF\s?[12]\.\s?Lig|UEFA|[ŞS]ampiyonlar\s?Ligi|Avrupa\s?Ligi|Konferans\s?Ligi)\b/i,
  /\b(ligde\s+(?:ilk|son|ikinci|birinci|[üu]ç[üu]nc[üu]|d[öo]rd[üu]nc[üu])\s*s[ıi]ra)\b/i,
  /\b(evinde|deplasmanda|sahas[ıi]nda)\s+[A-ZÇŞĞİÖÜ][a-zÀ-ɏ]+(spor|FK|SK)\b/,
  /\b(Kocaelispor|Trabzonspor|Ba[şs]ak[şs]ehir|G[öo]ztepe|Antalyaspor|Konyaspor|Alanyaspor|Samsunspor|Adanaspor|Gaziantep\s?FK|Kayserispor|Rizespor|Sivasspor|Ankarag[üu]c[üu]|Malatyaspor|Pendikspor|Bodrum\s?FK|Hatayspor|Eyüpspor|Çaykur\s?Rize)\b/i,
  /\b(teknik\s+direkt[öo]r|kalecisi|golc[üu]s[üu]|forma\s+giy|hat.?trick|sar[ıi]\s?k[ıi]rm[ıi]z[ıi]|siyah\s?beyazl[ıi]|lacivert\s?beyaz)\b/i,
  /\b(hata\s+yapmad[ıi]|galip\s+gel|ma[ğg]lup\s+ol|beraberlik(?:le|\s+ayr[ıi]ld)|golle\s+kazand|skor\s+\d)\b/i,
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
  // --- Mid-cap / konkordato riskli isimler (11 Eki 2026 geniş liste) ---
  'alves kablo': ['ALVES'],
  'alves ': ['ALVES'],
  'alvs': ['ALVES'],
  'turk traktor': ['TTRAK'],
  'anadolu efes': ['AEFES'],
  'coca cola icecek': ['CCOLA'],
  'cocacola icecek': ['CCOLA'],
  'logo yazilim': ['LOGO'],
  'netas telekom': ['NETAS'],
  'kordsa': ['KORDS'],
  'brisa': ['BRISA'],
  'goodyear': ['GOODY'],
  'otokar otomotiv': ['OTKAR'],
  'temapol': ['TMPOL'],
  'yunsa': ['YUNSA'],
  'yesil yapi': ['YYAPI'],
  'yesil gyo': ['YGGYO'],
  'ihlas ev aletleri': ['IHEVA'],
  'ihlas holding': ['IHLAS'],
  'ihlas yayin': ['IHYAY'],
  'desa deri': ['DESA'],
  'ersu gida': ['ERSU'],
  'avod kurutulmus': ['AVOD'],
  'adese alisveris': ['ADESE'],
  'martı otel': ['MAALT'],
  'marti otel': ['MAALT'],
  'metemtur': ['METUR'],
  'alarko carrier': ['ALCAR'],
  'emek elektrik': ['EMKEL'],
  'altinyag': ['ALYAG'],
  'bagfas': ['BAGFS'],
  'gersan elektrik': ['GEREL'],
  'is yatirim': ['ISMEN'],
  'yapi kredi yatirim': ['YKBNK'],
  'ziraat yatirim': ['ZRGYO'],
  'turkiye sinai kalkinma': ['TSKB'],
  'tsk': ['TSKB'],
  'albaraka turk': ['ALBRK'],
  'kuveyt turk': ['KUVVA'],
  'odea bank': ['ODAS'],
  'odas elektrik': ['ODAS'],
  'ayen enerji': ['AYEN'],
  'margun enerji': ['MAGEN'],
  'goldas kuyumculuk': ['GOLDS'],
  'altin yapi': ['ALYAG'],
  'quagen tasarim': ['QUAGR'],
  'quagen': ['QUAGR'],
  'penguen gida': ['PENGD'],
  'penguen': ['PENGD'],
  'orcay': ['ORCAY'],
  'orcay cay': ['ORCAY'],
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
    .replace(/&nbsp;/g, ' ')
    // Numeric entity'ler: &#8217; (’), &#8220; (“), &#x2019; vb.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
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
    const pubDate = extractTag(block, 'pubDate') ?? extractTag(block, 'dc:date') ?? extractTag(block, 'published') ?? null;
    if (!title || !link) continue;
    // 13 Eki 2026: Tarihsiz item'ı "şimdi" diye damgalama — eski haber taze
    // görünür. Tarih yoksa veya parse edilemiyorsa item'ı at.
    if (!pubDate) continue;
    const parsedDate = new Date(pubDate);
    if (!Number.isFinite(parsedDate.getTime())) continue;
    const publishedAt = parsedDate.toISOString();
    const summary = description.slice(0, 280);
    const crit = detectCritical(title, summary);
    const baseImportance = scoreImportance(title, summary);
    items.push({
      id: `${sourceName}-${publishedAt}-${title.slice(0, 30)}`,
      title,
      summary,
      url: link,
      source: sourceName,
      publishedAt,
      symbols: detectSymbols(`${title} ${summary}`),
      importance: crit.critical ? 10 : baseImportance,
      critical: crit.critical,
      criticalReason: crit.reason,
    });
  }
  return items;
}

async function fetchSource(src: RssSource, timeoutMs?: number): Promise<NewsItem[]> {
  // Google News RSS feed'leri 3-8sn alabilir, local kaynaklar 2-3sn.
  // Google News için 15sn, diğerleri için 6sn timeout.
  const isGoogleNews = src.url.includes('news.google.com');
  const actualTimeout = timeoutMs ?? (isGoogleNews ? 15000 : 6000);
  // Google News bot UA'yı bloklar — gerçek browser UA kullan
  const userAgent = isGoogleNews
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (compatible; HaneFinansBot/1.0)';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), actualTimeout);
    const r = await fetch(src.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': userAgent,
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

  // 13 Eki 2026: Tazelik filtresi — Google News RSS aramaları 2009'a kadar
  // eski sonuç dönebiliyor. Kritik haber en fazla 7 gün, normal haber en fazla
  // 3 gün eski olabilir. Gelecek tarihli (saat farkı toleransı 2sa) da elenir.
  const nowMs = Date.now();
  const MAX_AGE_CRITICAL_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_AGE_NORMAL_MS = 3 * 24 * 60 * 60 * 1000;
  const FUTURE_TOLERANCE_MS = 2 * 60 * 60 * 1000;
  combined = combined.filter((n) => {
    const t = +new Date(n.publishedAt);
    if (!Number.isFinite(t)) return false;
    if (t > nowMs + FUTURE_TOLERANCE_MS) return false;
    const age = nowMs - t;
    return age <= (n.critical ? MAX_AGE_CRITICAL_MS : MAX_AGE_NORMAL_MS);
  });

  // Tarih → yeniden eskiye
  combined.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));

  // 11 Eki 2026: Kritik haberleri (konkordato/iflas/SPK vs.) HER ZAMAN üstte
  // pinle, slice öncesi — böylece max=8 ile çağrılan panel'de de konkordato
  // haberi en üstte görünür, tarih kuyruğunun dışına düşmez.
  //
  // DEDUPE: Aynı criticalReason için sadece 1 bildirim göster. Google News
  // aynı olayı 5+ farklı kaynaktan getirebiliyor; kullanıcı tek rozet yeter.
  // En yeni (publishedAt desc sırada ilk gelen) tutulur.
  const seenReasons = new Set<string>();
  const criticalDedup: NewsItem[] = [];
  for (const n of combined) {
    if (!n.critical) continue;
    const key = n.criticalReason ?? 'critical';
    if (seenReasons.has(key)) continue;
    seenReasons.add(key);
    criticalDedup.push(n);
  }
  const rest = combined.filter((n) => !n.critical);
  const pinned = [...criticalDedup, ...rest];

  // İlk N tane
  const data = pinned.slice(0, max);

  return new Response(JSON.stringify({ ok: true, count: data.length, data }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
