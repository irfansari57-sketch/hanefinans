/**
 * Cloudflare Pages Function — News Agent.
 *
 * POST /api/agents/news
 * Body: { maxNews?: number; maxStories?: number }
 *
 * Akış:
 *   1) /api/news çağrılır (8 Türkçe RSS aggregate, 40+ haber)
 *   2) Claude Haiku ile günün top 5 BIST-ilgili önemli haber özetlenir
 *   3) Her hikaye için 2 cümle Türkçe özet + etkilenen semboller + kategori
 *
 * Edge cache 30 dk. Mock haberde Claude çağırmaz.
 */

interface Env {
  ANTHROPIC_API_KEY?: string;
}

interface NewsItem {
  id: string;
  title: string;
  source: string;
  symbols: string[];
  importance: number;
  publishedAt: string;
  url?: string;
}

interface NewsStory {
  rank: number;
  title: string;          // Claude'un yeniden ifade ettiği başlık
  summary: string;        // 2 cümle Türkçe özet
  category: 'piyasa' | 'şirket' | 'makro' | 'düzenleme' | 'jeopolitik';
  impact: 'pozitif' | 'negatif' | 'nötr';
  symbols: string[];      // ilgili BIST sembolleri (varsa)
  sourceTitle: string;    // orijinal manşet
  sourceName: string;
  sourceUrl?: string;
}

interface AgentResponse {
  ok: boolean;
  generatedAt: string;
  model: string;
  sourceNewsCount?: number;
  stories: NewsStory[];
  error?: string;
}

interface AnthropicResponse {
  content: Array<{ text: string; type: string }>;
}

function jsonResponse(data: unknown, status = 200, ttlSec = 1800): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${ttlSec}`,
    },
  });
}

async function fetchInternalNews(request: Request, max: number): Promise<NewsItem[]> {
  const origin = new URL(request.url).origin;
  const r = await fetch(`${origin}/api/news?max=${max}`);
  if (!r.ok) return [];
  const j = (await r.json()) as { ok: boolean; data?: NewsItem[] };
  return j.ok && Array.isArray(j.data) ? j.data : [];
}

function parseClaudeJson<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { /* */ }
  const m = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (m) { try { return JSON.parse(m[1]) as T; } catch { /* */ } }
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)) as T; } catch { /* */ }
  }
  return null;
}

interface ClaudeNewsRow {
  rank: number;
  title: string;
  summary: string;
  category: string;
  impact: string;
  symbols: string[];
  sourceIndex: number; // hangi orijinal haber referans
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ ok: false, error: 'ANTHROPIC_API_KEY env not set' }, 503, 60);
  }

  let body: { maxNews?: number; maxStories?: number } = {};
  try { body = await request.json(); } catch { /* boş OK */ }

  const maxNews = Math.min(60, Math.max(20, body.maxNews ?? 40));
  const maxStories = Math.min(10, Math.max(3, body.maxStories ?? 5));

  const news = await fetchInternalNews(request, maxNews);
  if (news.length === 0) {
    return jsonResponse({ ok: false, error: '/api/news boş döndü' }, 502, 60);
  }

  // Önemli olanlardan başla — importance + recency
  const sorted = [...news]
    .sort((a, b) => {
      const aRecent = new Date(a.publishedAt).getTime();
      const bRecent = new Date(b.publishedAt).getTime();
      // Skor: importance × 2 + recency hours (son 24 saat ön plana)
      const aScore = (a.importance ?? 5) * 2 + Math.max(0, 24 - (Date.now() - aRecent) / 3600000) * 0.1;
      const bScore = (b.importance ?? 5) * 2 + Math.max(0, 24 - (Date.now() - bRecent) / 3600000) * 0.1;
      return bScore - aScore;
    })
    .slice(0, Math.min(20, maxNews)); // Claude'a en fazla 20 manşet ver

  const promptInput = sorted.map((n, i) => {
    const syms = (n.symbols && n.symbols.length > 0) ? ` [${n.symbols.join(',')}]` : '';
    return `${i}. ${n.title}${syms} — ${n.source}`;
  }).join('\n');

  const prompt = `Sen Türkçe konuşan kıdemli bir finans editörüsün. Aşağıdaki haber listesinden BIST yatırımcıları için en önemli ${maxStories} hikayeyi seç ve özetle.

HABER LİSTESİ (0-tabanlı index):
${promptInput}

GÖREV:
- En etkili ${maxStories} haberi seç (BIST, makroekonomi, şirket gelişmeleri öncelikli)
- Spor/magazin/skandal gibi finansla ilgisiz haberleri at
- Her hikaye için 2 cümlelik Türkçe özet yaz
- Etkilenen BIST sembolleri varsa belirt

ÇIKTI: SADECE JSON dizi, başında [ sonunda ]. Her eleman:
{
  "rank": 1,
  "title": "yeniden yazılmış kısa başlık",
  "summary": "2 cümle Türkçe özet",
  "category": "piyasa" | "şirket" | "makro" | "düzenleme" | "jeopolitik",
  "impact": "pozitif" | "negatif" | "nötr",
  "symbols": ["THYAO"],
  "sourceIndex": 3
}

Markdown yok, açıklama yok. Sadece JSON dizi.`;

  let claudeText = '';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      return jsonResponse({ ok: false, error: `Anthropic API ${r.status}: ${errText.slice(0, 200)}` }, 502, 60);
    }
    const json = (await r.json()) as AnthropicResponse;
    claudeText = json.content?.[0]?.text ?? '';
  } catch (e) {
    return jsonResponse({ ok: false, error: `Anthropic fetch: ${(e as Error).message}` }, 500, 30);
  }

  const parsed = parseClaudeJson<ClaudeNewsRow[]>(claudeText);
  if (!parsed || !Array.isArray(parsed)) {
    return jsonResponse({
      ok: false,
      error: 'Claude JSON parse edilemedi',
      rawSnippet: claudeText.slice(0, 300),
    }, 502, 60);
  }

  const stories: NewsStory[] = parsed
    .filter((p) => Number.isFinite(p.sourceIndex) && p.sourceIndex >= 0 && p.sourceIndex < sorted.length)
    .map((p) => {
      const src = sorted[p.sourceIndex];
      return {
        rank: p.rank,
        title: p.title || src.title,
        summary: p.summary || '',
        category: (['piyasa', 'şirket', 'makro', 'düzenleme', 'jeopolitik'].includes(p.category) ? p.category : 'piyasa') as NewsStory['category'],
        impact: (['pozitif', 'negatif', 'nötr'].includes(p.impact) ? p.impact : 'nötr') as NewsStory['impact'],
        symbols: Array.isArray(p.symbols) ? p.symbols.map((s) => s.toUpperCase()).slice(0, 5) : [],
        sourceTitle: src.title,
        sourceName: src.source,
        sourceUrl: src.url,
      };
    })
    .slice(0, maxStories);

  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    model: 'claude-haiku-4-5',
    sourceNewsCount: news.length,
    stories,
  }, 200, 1800);
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
