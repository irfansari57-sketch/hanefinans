/**
 * Cloudflare Pages Function — Smart Search (semantic news arama).
 *
 * POST /api/agents/search
 * Body: { query: string; maxNews?: number; maxResults?: number }
 *
 * Akıs:
 *   1) /api/news'den son N haberi cek
 *   2) Voyage AI ile query + tum haber basliklarini batch embed et
 *   3) Cosine similarity hesapla, top K dondur
 *
 * On-the-fly hesaplama (no Vectorize) — ~50ms latency Voyage call,
 * ~$0.00005 per arama (1M token = $0.02 voyage-3-lite).
 */

interface Env {
  VOYAGE_API_KEY?: string;
}

interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  source: string;
  symbols: string[];
  importance: number;
  publishedAt: string;
  url?: string;
}

interface SearchResult {
  item: NewsItem;
  similarity: number;     // 0-1
}

interface SearchResponse {
  ok: boolean;
  query?: string;
  results?: SearchResult[];
  totalSearched?: number;
  model?: string;
  error?: string;
}

function jsonResponse(data: SearchResponse, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

async function fetchInternalNews(origin: string, max: number): Promise<NewsItem[]> {
  try {
    const r = await fetch(`${origin}/api/news?max=${max}`);
    if (!r.ok) return [];
    const j = (await r.json()) as { ok: boolean; data?: NewsItem[] };
    return j.ok && Array.isArray(j.data) ? j.data : [];
  } catch {
    return [];
  }
}

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { total_tokens?: number };
}

async function voyageEmbed(apiKey: string, texts: string[]): Promise<number[][] | null> {
  try {
    const r = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'voyage-3-lite',
        input: texts,
        input_type: 'document',
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as VoyageResponse;
    if (!Array.isArray(j.data)) return null;
    // index garantili olmayabilir — index sirasi ile sirala
    return j.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  } catch {
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.VOYAGE_API_KEY) {
    return jsonResponse({ ok: false, error: 'VOYAGE_API_KEY env not set' }, 503);
  }

  let body: { query?: string; maxNews?: number; maxResults?: number } = {};
  try { body = await request.json(); } catch { /* */ }

  const query = (body.query ?? '').trim();
  if (!query || query.length < 2) {
    return jsonResponse({ ok: false, error: 'query required (min 2 char)' }, 400);
  }
  const maxNews = Math.min(80, Math.max(20, body.maxNews ?? 50));
  const maxResults = Math.min(20, Math.max(3, body.maxResults ?? 10));

  // Haberleri çek
  const origin = new URL(request.url).origin;
  const news = await fetchInternalNews(origin, maxNews);
  if (news.length === 0) {
    return jsonResponse({ ok: false, error: '/api/news bos dondu' }, 502);
  }

  // Embedding metinleri hazırla: 0 = query, 1..N = news titles + summary
  const texts: string[] = [query];
  for (const n of news) {
    const t = n.summary ? `${n.title}\n${n.summary}` : n.title;
    texts.push(t.slice(0, 500)); // her dokuman max 500 char
  }

  const embeddings = await voyageEmbed(env.VOYAGE_API_KEY, texts);
  if (!embeddings || embeddings.length !== texts.length) {
    return jsonResponse({ ok: false, error: 'Voyage embedding basarisiz' }, 502);
  }

  const queryVec = embeddings[0];
  const results: SearchResult[] = news.map((item, i) => ({
    item,
    similarity: cosineSimilarity(queryVec, embeddings[i + 1]),
  }));

  // Sırala — en yüksek benzerlik üstte
  results.sort((a, b) => b.similarity - a.similarity);

  return jsonResponse({
    ok: true,
    query,
    results: results.slice(0, maxResults),
    totalSearched: news.length,
    model: 'voyage-3-lite',
  }, 200);
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
