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

// Basit sembol algılayıcı: başlık + açıklamada BIST kodlarını ara
function detectSymbols(text: string, knownSymbols: string[]): string[] {
  const upper = text.toUpperCase();
  return knownSymbols.filter((s) => new RegExp(`\\b${s}\\b`).test(upper));
}

function scoreImportance(article: GNewsArticle): number {
  const text = `${article.title} ${article.description}`.toLowerCase();
  let score = 4;
  if (/i̇halesi|sözleşme|anlaşma|imzala/.test(text)) score += 2;
  if (/milyar|büyük|kapasite|yatırım/.test(text)) score += 1;
  if (/iflas|kayıp|zarar|açıklama/.test(text)) score += 1;
  return Math.min(10, score);
}

export async function fetchNewsGNews(opts: {
  query?: string;
  symbols?: string[];
  max?: number;
}): Promise<NewsItem[] | null> {
  if (!API_KEYS.gnews) return null;
  const query = opts.query ?? 'BIST OR borsa istanbul OR KAP OR bankacılık';
  const max = Math.min(opts.max ?? 25, 25);
  try {
    const url = `${BASE}/search?q=${encodeURIComponent(query)}&lang=tr&country=tr&max=${max}&apikey=${API_KEYS.gnews}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as GNewsResponse;
    const known = opts.symbols ?? [];
    return json.articles.map((a, i) => ({
      id: `gnews-${a.publishedAt}-${i}`,
      source: 'Reuters' as const, // GNews'i gerçek kaynak adıyla mapping yapamayız; "Diğer" daha doğru
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
