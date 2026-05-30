// Reddit sentiment — Supabase Edge Function üzerinden.
import { callEdgeFunction, getSupabase } from '../supabase';
import type { SentimentMention } from '../types';

interface RedditFnResp {
  ok: boolean;
  recorded: number;
  mentions: Array<{
    symbol: string;
    count: number;
    sentiment: 'positive' | 'neutral' | 'negative';
  }>;
}

export async function triggerRedditScan(symbols: string[]): Promise<RedditFnResp | null> {
  return callEdgeFunction<RedditFnResp>('reddit-mentions', { symbols });
}

/** Son 24 saatte kaydedilmiş Reddit mention'larını sembol başına topla. */
export async function loadRedditSentiment(): Promise<SentimentMention[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await sb
    .from('sentiment_mentions')
    .select('symbol, count, sentiment, last_change')
    .eq('source', 'reddit')
    .gte('window_end', since);
  if (error || !data) return [];
  // Sembol başına son kaydı al (en yüksek count)
  const map = new Map<string, SentimentMention>();
  for (const r of data as Array<{ symbol: string; count: number; sentiment: 'positive' | 'neutral' | 'negative'; last_change: number | null }>) {
    const existing = map.get(r.symbol);
    if (!existing || r.count > existing.count) {
      map.set(r.symbol, {
        symbol: r.symbol,
        count: r.count,
        sentiment: r.sentiment,
        lastChange: r.last_change ?? undefined,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}
