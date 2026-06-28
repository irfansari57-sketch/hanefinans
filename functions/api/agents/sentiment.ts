/**
 * Cloudflare Pages Function — Sentiment Agent
 *
 * POST /api/agents/sentiment
 * Body: { symbols?: string[]; maxNews?: number }  (symbols vermezsen popüler BIST setini kullanır)
 *
 * Akış:
 *   1) Aynı origin'deki /api/news'i çağır (RSS aggregate)
 *   2) Sembollere göre filtrele (news[].symbols zaten populated)
 *   3) Claude Haiku ile her (symbol, headline) için sentiment skoru üret
 *   4) Sembol bazında ortala, yapılandırılmış JSON döner
 *
 * Edge cache 1 saat — agent her sayfada tetiklendiğinde tekrar tekrar çağrılmasın.
 */

interface Env {
  ANTHROPIC_API_KEY?: string;
}

interface NewsItem {
  id: string;
  title: string;
  source: string;
  symbols: string[];
  publishedAt: string;
}

interface SentimentItem {
  symbol: string;
  score: number;         // -1 (negatif) ... +1 (pozitif)
  label: 'positive' | 'neutral' | 'negative';
  newsCount: number;
  rationale: string;     // 1 cümle Türkçe özet
  samples: Array<{ title: string; source: string; score: number; label: string }>;
}

interface AnthropicResponse {
  content: Array<{ text: string; type: string }>;
}

const DEFAULT_SYMBOLS = [
  'THYAO', 'GARAN', 'AKBNK', 'ISCTR', 'YKBNK', 'HALKB', 'VAKBN',
  'ASELS', 'EREGL', 'KCHOL', 'SAHOL', 'TUPRS', 'BIMAS', 'MGROS',
  'SISE', 'PETKM', 'TOASO', 'FROTO', 'TCELL', 'TTKOM', 'ARCLK', 'PGSUS',
];

function jsonResponse(data: unknown, status = 200, ttlSec = 3600): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${ttlSec}`,
    },
  });
}

/** Aynı origin'den /api/news çek */
async function fetchInternalNews(request: Request, maxNews: number): Promise<NewsItem[]> {
  const origin = new URL(request.url).origin;
  const r = await fetch(`${origin}/api/news?max=${maxNews}`);
  if (!r.ok) return [];
  const j = (await r.json()) as { ok: boolean; data?: NewsItem[] };
  return j.ok && Array.isArray(j.data) ? j.data : [];
}

/** Claude'dan dönen JSON dizisini güvenle parse et — bazen markdown ile sarmalanır */
function parseClaudeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    // ```json bloğu içinden çıkart
    const m = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (m) {
      try { return JSON.parse(m[1]) as T; } catch { /* fall through */ }
    }
    // İlk [ ... son ] bloğu
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)) as T; } catch { /* fall through */ }
    }
    return null;
  }
}

interface ClaudeSentimentRow {
  symbol: string;
  headline: string;
  score: number;
  label: string;
  rationale?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ ok: false, error: 'ANTHROPIC_API_KEY env not set' }, 503, 60);
  }

  let body: { symbols?: string[]; maxNews?: number } = {};
  try { body = await request.json(); } catch { /* boş body de OK */ }

  const symbols = (body.symbols && body.symbols.length > 0
    ? body.symbols
    : DEFAULT_SYMBOLS
  ).map((s) => s.toUpperCase()).slice(0, 30);
  const maxNews = Math.min(80, Math.max(20, body.maxNews ?? 50));

  // 1) Haberleri çek
  const news = await fetchInternalNews(request, maxNews);
  if (news.length === 0) {
    return jsonResponse({ ok: false, error: 'Haber çekilemedi (/api/news boş)' }, 502, 60);
  }

  // 2) Sembol başına haberleri eşle (her sembol için max 3 manşet)
  const symbolToTitles = new Map<string, NewsItem[]>();
  for (const n of news) {
    for (const sym of n.symbols ?? []) {
      const S = sym.toUpperCase();
      if (!symbols.includes(S)) continue;
      const list = symbolToTitles.get(S) ?? [];
      if (list.length < 3) list.push(n);
      symbolToTitles.set(S, list);
    }
  }
  // Filtre: hiç haberi olmayan sembolleri at
  const symbolsWithNews = Array.from(symbolToTitles.keys());
  if (symbolsWithNews.length === 0) {
    return jsonResponse({
      ok: true,
      generatedAt: new Date().toISOString(),
      model: 'none',
      items: [] as SentimentItem[],
      note: 'Verilen sembollerden hiçbirine ait haber bulunamadı.',
    }, 200, 300);
  }

  // 3) Claude için flat (symbol, headline) listesi oluştur
  type Row = { symbol: string; headline: string; source: string };
  const rows: Row[] = [];
  for (const [sym, items] of symbolToTitles) {
    for (const it of items) {
      rows.push({ symbol: sym, headline: it.title, source: it.source });
    }
  }

  // Prompt — yapılandırılmış JSON çıktısı dayatıyoruz
  const promptInput = rows.map((r, i) => `${i + 1}. [${r.symbol}] ${r.headline}`).join('\n');

  const prompt = `Sen Türkçe konuşan bir finansal sentiment analistisin. Aşağıdaki BIST hissesi-manşet çiftleri için her satıra ayrı sentiment skoru ver.

ÇİFTLER:
${promptInput}

KURALLAR:
- score: -1.0 (çok negatif) ile +1.0 (çok pozitif) arasında ondalık
- label: "positive" (score>0.2), "neutral" (-0.2..0.2), veya "negative" (score<-0.2)
- rationale: 1 kısa Türkçe cümle (en fazla 15 kelime)
- Skandallar, zarar, ihlal, gerileme → negatif
- Yatırım, kâr, ihracat, sözleşme, büyüme → pozitif
- Yönetim değişikliği, beklenen rapor → nötr

ÇIKTI: SADECE JSON dizi, başında [ sonunda ]. Markdown yok, açıklama yok. Format:
[{"symbol":"THYAO","headline":"...","score":0.6,"label":"positive","rationale":"..."}, ...]`;

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
      return jsonResponse({
        ok: false,
        error: `Anthropic API ${r.status}: ${errText.slice(0, 200)}`,
      }, 502, 60);
    }
    const json = (await r.json()) as AnthropicResponse;
    claudeText = json.content?.[0]?.text ?? '';
  } catch (e) {
    return jsonResponse({ ok: false, error: `Anthropic fetch error: ${(e as Error).message}` }, 500, 30);
  }

  const parsed = parseClaudeJson<ClaudeSentimentRow[]>(claudeText);
  if (!parsed || !Array.isArray(parsed)) {
    return jsonResponse({
      ok: false,
      error: 'Claude çıktısı parse edilemedi',
      rawSnippet: claudeText.slice(0, 300),
    }, 502, 60);
  }

  // 4) Sembol bazında agrega — ortalama skor, en olumlu/olumsuz örnek
  const bySymbol = new Map<string, SentimentItem>();
  for (const row of parsed) {
    if (!row.symbol || !Number.isFinite(row.score)) continue;
    const S = String(row.symbol).toUpperCase();
    const existing = bySymbol.get(S);
    const sample = {
      title: String(row.headline ?? ''),
      source: rows.find((x) => x.symbol === S && x.headline === row.headline)?.source ?? '',
      score: row.score,
      label: row.label ?? 'neutral',
    };
    if (!existing) {
      bySymbol.set(S, {
        symbol: S,
        score: row.score,
        label: scoreToLabel(row.score),
        newsCount: 1,
        rationale: row.rationale ?? '',
        samples: [sample],
      });
    } else {
      const avg = (existing.score * existing.newsCount + row.score) / (existing.newsCount + 1);
      existing.score = avg;
      existing.label = scoreToLabel(avg);
      existing.newsCount += 1;
      existing.samples.push(sample);
      // En son row'un rationale'ını mutlak skoru en yüksek olan saklasın
      if (Math.abs(row.score) > Math.abs(existing.score - row.score)) {
        existing.rationale = row.rationale ?? existing.rationale;
      }
    }
  }

  const items = Array.from(bySymbol.values())
    .sort((a, b) => b.score - a.score);

  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    model: 'claude-haiku-4-5',
    sourceNewsCount: news.length,
    items,
  }, 200, 3600);
};

function scoreToLabel(score: number): 'positive' | 'neutral' | 'negative' {
  if (score > 0.2) return 'positive';
  if (score < -0.2) return 'negative';
  return 'neutral';
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
