/**
 * Frontend client — /api/agents/search Pages Function.
 * Voyage AI + cosine similarity ile haber semantic araması.
 */

import type { NewsItem } from '@/data/types';

export interface SmartSearchResult {
  item: NewsItem;
  similarity: number;
}

export interface SmartSearchResponse {
  ok: boolean;
  query?: string;
  results?: SmartSearchResult[];
  totalSearched?: number;
  model?: string;
  error?: string;
}

export async function smartSearch(query: string, maxResults = 10): Promise<SmartSearchResponse | null> {
  if (!query || query.trim().length < 2) return null;
  try {
    const r = await fetch('/api/agents/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: query.trim(), maxResults }),
    });
    if (!r.ok) {
      // Hata cevabı geldi ama JSON ise içeriği döndür
      const ct = r.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        return (await r.json()) as SmartSearchResponse;
      }
      return null;
    }
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null;
    return (await r.json()) as SmartSearchResponse;
  } catch {
    return null;
  }
}
