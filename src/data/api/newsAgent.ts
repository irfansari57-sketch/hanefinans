/**
 * Frontend client — /api/agents/news Pages Function.
 * Claude Haiku ile günün top 5 BIST-ilgili haberi.
 */

export interface NewsAgentStory {
  rank: number;
  title: string;
  summary: string;
  category: 'piyasa' | 'şirket' | 'makro' | 'düzenleme' | 'jeopolitik';
  impact: 'pozitif' | 'negatif' | 'nötr';
  symbols: string[];
  sourceTitle: string;
  sourceName: string;
  sourceUrl?: string;
}

export interface NewsAgentResponse {
  ok: boolean;
  generatedAt: string;
  model: string;
  sourceNewsCount?: number;
  stories: NewsAgentStory[];
  error?: string;
}

const TTL_MS = 30 * 60_000;
let _cache: { data: NewsAgentResponse; t: number } | null = null;

export async function runNewsAgent(opts: {
  maxStories?: number;
  force?: boolean;
} = {}): Promise<NewsAgentResponse | null> {
  if (!opts.force && _cache && Date.now() - _cache.t < TTL_MS) {
    return _cache.data;
  }
  try {
    const r = await fetch('/api/agents/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ maxStories: opts.maxStories ?? 5 }),
    });
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null;
    // ok:false JSON cevabini da dondur, widget gercek hata mesajini gostersin
    const data = (await r.json()) as NewsAgentResponse;
    _cache = { data, t: Date.now() };
    return data;
  } catch {
    return null;
  }
}

export function impactTone(impact: string): 'success' | 'danger' | 'slate' {
  if (impact === 'pozitif') return 'success';
  if (impact === 'negatif') return 'danger';
  return 'slate';
}

export function categoryEmoji(cat: string): string {
  switch (cat) {
    case 'piyasa': return '📈';
    case 'şirket': return '🏢';
    case 'makro': return '🌍';
    case 'düzenleme': return '⚖️';
    case 'jeopolitik': return '🛡️';
    default: return '📰';
  }
}
