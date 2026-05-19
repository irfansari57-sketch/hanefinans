/**
 * Frontend client — /api/agents/sentiment Pages Function'a istek atar.
 * Claude Haiku ile BIST hisseleri için haber sentiment skoru.
 */

export interface SentimentAgentSample {
  title: string;
  source: string;
  score: number;
  label: string;
}

export interface SentimentAgentItem {
  symbol: string;
  score: number;          // -1.0 ... +1.0
  label: 'positive' | 'neutral' | 'negative';
  newsCount: number;
  rationale: string;
  samples: SentimentAgentSample[];
}

export interface SentimentAgentResponse {
  ok: boolean;
  generatedAt: string;
  model: string;
  sourceNewsCount?: number;
  items: SentimentAgentItem[];
  error?: string;
  note?: string;
}

const TTL_MS = 30 * 60_000; // 30 dk frontend cache
let _cache: { data: SentimentAgentResponse; t: number } | null = null;

/**
 * Sentiment agent'ı çağır. symbols boşsa default 22 BIST major listesi kullanılır.
 * Dev sunucuda Pages Functions yoksa null döner — caller mock'a düşer.
 */
export async function runSentimentAgent(opts: {
  symbols?: string[];
  maxNews?: number;
  force?: boolean;
} = {}): Promise<SentimentAgentResponse | null> {
  if (!opts.force && _cache && Date.now() - _cache.t < TTL_MS) {
    return _cache.data;
  }
  try {
    const r = await fetch('/api/agents/sentiment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        symbols: opts.symbols,
        maxNews: opts.maxNews ?? 50,
      }),
    });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null; // dev'de Pages Functions yok
    const data = (await r.json()) as SentimentAgentResponse;
    _cache = { data, t: Date.now() };
    return data;
  } catch {
    return null;
  }
}

export function sentimentTone(label: string): 'success' | 'danger' | 'slate' {
  if (label === 'positive') return 'success';
  if (label === 'negative') return 'danger';
  return 'slate';
}
