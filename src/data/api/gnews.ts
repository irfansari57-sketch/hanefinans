import { API_KEYS } from './keys';
import type { NewsItem } from '../types';

interface GNewsArticle {
  title: string;
  description: string;
  content: string;
  url: string;
  image: string;
  publishedAt: string;
  source: { name: string; url: string };
}
interface GNewsResponse {
  totalArticles: number;
  articles: GNewsArticle[];
}

const BASE = 'https://gnews.io/api/v4';

const TR_FINANCE_WHITELIST: Record<string, string> = {
  'bloomberght.com': 'BloombergHT',
  'aa.com.tr': 'AA',
  'dunya.com': 'Dunya',
  'hurriyet.com.tr': 'Hurriyet',
  'sabah.com.tr': 'Sabah',
  'ntv.com.tr': 'NTV',
  'haberturk.com': 'Haberturk',
  'milliyet.com.tr': 'Milliyet',
  'cumhuriyet.com.tr': 'Cumhuriyet',
  'sozcu.com.tr': 'Sozcu',
  'cnnturk.com': 'CNN Turk',
  'trthaber.com': 'TRT Haber',
  'finansgundem.com': 'Finans Gundem',
  'parametre.com.tr': 'Parametre',
  'paraanaliz.com': 'Para Analiz',
  'bigpara.hurriyet.com.tr': 'BigPara',
  'piyasarehberi.com': 'Piyasa Rehberi',
  'borsagundem.com': 'Borsa Gundem',
  'patronlardunyasi.com': 'Patronlar Dunyasi',
  'ekonomim.com': 'Ekonomim',
  'investaz.com.tr': 'InvestAZ',
  'bbc.com': 'BBC Turkce',
  'tr.euronews.com': 'Euronews TR',
};

const BLACKLIST_DOMAINS = new Set([
  'investing.com', 'tr.investing.com', 'reuters.com', 'bloomberg.com',
  'wsj.com', 'ft.com', 'cnbc.com', 'forbes.com', 'businessinsider.com',
  'marketwatch.com', 'seekingalpha.com', 'yahoo.com', 'finance.yahoo.com',
  'fxstreet.com', 'fxempire.com',
]);

function getDomain(urlString: string): string {
  try {
    const u = new URL(urlString);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function looksTurkish(text: string): boolean {
  if (!text) return false;
  const trKeywords = /\b(ve|veya|olarak|icin|ile|bir|bu|su|ne|ama|yatirim|borsa|hisse|fon|dolar|kurus|TL|milyon|milyar|piyasa|banka|ekonomi|sirket|aciklama|hedef|fiyat|satis|alim|getiri|buyume|enflasyon|faiz|merkez|para|doviz|kar|zarar)\b/i;
  const trChars = /[igusocIGUSOC]/;
  return trKeywords.test(text) || trChars.test(text);
}

function mapSource(article: GNewsArticle): string {
  const domain = getDomain(article.url);
  const wl = TR_FINANCE_WHITELIST[domain];
  if (wl) return wl;
  const parts = domain.split('.');
  if (parts.length > 2) {
    const parent = parts.slice(-2).join('.');
    if (TR_FINANCE_WHITELIST[parent]) return TR_FINANCE_WHITELIST[parent];
  }
  return article.source?.name?.slice(0, 16) || domain.split('.')[0] || 'Diger';
}

function detectSymbols(text: string, knownSymbols: string[]): string[] {
  const upper = text.toUpperCase();
  return knownSymbols.filter((s) => new RegExp(`\\b${s}\\b`).test(upper));
}

function scoreImportance(article: GNewsArticle): number {
  const text = `${article.title} ${article.description}`.toLowerCase();
  let score = 4;
  if (/ihale|sozlesme|anlasma|imzala/.test(text)) score += 2;
  if (/milyar|buyuk|kapasite|yatirim/.test(text)) score += 1;
  if (/iflas|kayip|zarar|aciklama/.test(text)) score += 1;
  const domain = getDomain(article.url);
  if (TR_FINANCE_WHITELIST[domain]) score += 1;
  return Math.min(10, score);
}

export async function fetchNewsGNews(opts: {
  query?: string;
  symbols?: string[];
  max?: number;
}): Promise<NewsItem[] | null> {
  if (!API_KEYS.gnews) return null;
  const query = opts.query ?? 'BIST OR borsa istanbul OR KAP OR bankacilik OR ekonomi OR TCMB';
  const requested = Math.min((opts.max ?? 25) * 2, 50);
  try {
    const url = `${BASE}/search?q=${encodeURIComponent(query)}&lang=tr&country=tr&max=${requested}&apikey=${API_KEYS.gnews}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as GNewsResponse;
    const known = opts.symbols ?? [];

    const filtered = json.articles.filter((a) => {
      const domain = getDomain(a.url);
      if (BLACKLIST_DOMAINS.has(domain)) return false;
      if (TR_FINANCE_WHITELIST[domain]) return true;
      if (/\.tr$/.test(domain) || /\/turkce/i.test(a.url)) return true;
      const blob = `${a.title} ${a.description ?? ''}`;
      return looksTurkish(blob);
    });

    const targetCount = opts.max ?? 25;
    return filtered.slice(0, targetCount).map((a, i) => ({
      id: `gnews-${a.publishedAt}-${i}`,
      source: mapSource(a),
      symbols: detectSymbols(`${a.title} ${a.description}`, known),
      importance: scoreImportance(a),
      title: a.title,
      summary: a.description ?? a.content?.slice(0, 200) ?? '',
      publishedAt: new Date(a.publishedAt).toISOString(),
      url: a.url,
    }));
  } catch {
    return null;
  }
}
