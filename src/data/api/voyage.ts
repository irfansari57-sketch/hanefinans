import { callEdgeFunction } from '../supabase';
import type { NewsItem } from '../types';

interface MatchedNews {
  id: string;
  title: string;
  summary: string;
  source: string;
  symbols: string[];
  importance: number;
  published_at: string;
  similarity: number;
}

interface VoyageQueryResp {
  ok: boolean;
  matches: MatchedNews[];
}

interface VoyageIndexResp {
  ok: boolean;
  embedded: number;
}

/** Yeni haberleri toplu embedle (cron tarafından da çağrılabilir). */
export async function reindexNews(): Promise<number> {
  const r = await callEdgeFunction<VoyageIndexResp>('voyage-embed', { mode: 'index' });
  return r?.embedded ?? 0;
}

/** Semantik arama — sorgu metnine en yakın haberler. */
export async function semanticSearch(text: string, limit = 10): Promise<NewsItem[]> {
  const r = await callEdgeFunction<VoyageQueryResp>('voyage-embed', { mode: 'query', text, limit });
  if (!r || !r.matches) return [];
  return r.matches.map((m) => ({
    id: m.id,
    source: (m.source as NewsItem['source']) ?? 'Diğer',
    symbols: m.symbols,
    importance: m.importance,
    title: m.title,
    summary: m.summary,
    publishedAt: m.published_at,
  }));
}
