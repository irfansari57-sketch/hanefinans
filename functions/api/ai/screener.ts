/**
 * Cloudflare Pages Function â€” DoÄŸal dil sorgudan filter spec Ã¼retir.
 * POST /api/ai/screener
 *
 * MINIMUM VERSION: auth/quota/rate-limit KALDIRILDI. Sadece Anthropic call.
 * AmaÃ§: 502 crash'i Ã§Ã¶zmek â€” hangi dependency kÄ±rÄ±yorsa onu ayÄ±klamak.
 * Ã–zellikler sonraki commit'lerde tek tek geri eklenecek.
 */

interface Env {
  ANTHROPIC_API_KEY?: string;
}

interface AnthropicResponse {
  content?: Array<{ text: string; type: string }>;
}

const STOCK_FIELDS = `HISSE ALANLARI (dataset='stocks'):
- symbol, name, sector, price, changePct
- r1g (bugun %), r1h (1 hafta %), r1a (1 ay %), r3a (3 ay %), r6a (6 ay %), r1y (1 yil %)`;

const FUND_FIELDS = `FON ALANLARI (dataset='funds'):
- code, name, category
- day, week, month, threeMonth, sixMonth, ytd, year`;

const SYSTEM_PROMPT = `Sen Turk yatirimcisi icin dogal dil sorgularini yapilandirilmis filtreye ceviren bir yardimcisin.

${STOCK_FIELDS}

${FUND_FIELDS}

KURALLAR:
1) dataset mutlaka 'stocks' veya 'funds'. Belirsizse hisse varsay.
2) Operatorler: '>', '>=', '<', '<=', '=', '!=', 'includes', 'in'.
3) Sektor/kategori icin 'includes' veya '=' kullan.
4) "En iyi/en yuksek" -> sort dir='desc'. "En dusuk" -> 'asc'.
5) "top N", "en iyi N" -> limit=N. Belirtilmemisse hisse 20, fon 10.
6) "%5" -> 5, "%5'ten fazla" -> > 5, "%5+" -> >= 5.
7) explanation Turkce ozet (max 100 kar).
8) BIST 100 / XU100 -> scope:"XU100". BIST 30 / XU030 -> scope:"XU030".

CIKTI: SADECE gecerli JSON, baska metin yok. Ornek:
{"dataset":"stocks","filters":[{"field":"r1a","op":">=","value":5}],"sort":{"field":"r1a","dir":"desc"},"limit":20,"explanation":"Son 1 ayda %5+ getirili hisseler"}`;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY not set' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }

    let body: { query?: string; dataset?: 'stocks' | 'funds' };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const userQuery = (body?.query ?? '').trim();
    if (!userQuery) {
      return new Response(JSON.stringify({ ok: false, error: 'query zorunlu' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const safeQuery = userQuery.slice(0, 500);
    const datasetHint = body.dataset ? `\n\n(Kullanici ipucu: dataset='${body.dataset}'.)` : '';

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Sorgu: "${safeQuery}"${datasetHint}\n\nJSON dondur:` },
        ],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text().catch(() => '');
      return new Response(JSON.stringify({
        ok: false,
        error: `Anthropic ${anthropicResp.status}`,
        detail: errText.slice(0, 300),
      }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const aiRes = (await anthropicResp.json()) as AnthropicResponse;
    const raw = aiRes?.content?.[0]?.text?.trim() ?? '';

    let jsonText = raw;
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonText = codeBlock[1].trim();
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonText = jsonText.slice(firstBrace, lastBrace + 1);
    }

    let spec: {
      dataset?: 'stocks' | 'funds';
      filters?: unknown[];
      sort?: { field: string; dir: 'asc' | 'desc' };
      limit?: number;
      explanation?: string;
      scope?: string;
    };
    try {
      spec = JSON.parse(jsonText);
    } catch {
      return new Response(JSON.stringify({
        ok: false,
        error: 'LLM JSON parse hatasi',
        raw: raw.slice(0, 300),
      }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!spec.dataset || !Array.isArray(spec.filters)) {
      return new Response(JSON.stringify({
        ok: false, error: 'Gecersiz spec yapisi', spec,
      }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (spec.dataset !== 'stocks' && spec.dataset !== 'funds') spec.dataset = 'stocks';
    if (!spec.limit || spec.limit > 100) spec.limit = spec.dataset === 'stocks' ? 20 : 10;

    return new Response(JSON.stringify({
      ok: true,
      spec,
      model: 'claude-3-5-haiku-latest',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (outerErr) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'screener_uncaught',
      message: (outerErr as Error)?.message ?? String(outerErr),
      stack: ((outerErr as Error)?.stack ?? '').split('\n').slice(0, 3).join(' | '),
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
