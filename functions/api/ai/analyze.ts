/**
 * Cloudflare Pages Function — Hisse için AI analiz üretir.
 *
 * POST /api/ai/analyze
 * Body: { symbol, name, price, changePct, rsi, macd, trend, sector, news[] }
 *
 * Anthropic Claude API'sini kullanır.
 * Maliyeti düşük tutmak için Haiku modeli.
 */

import { getAuthedUser, type Env as AuthEnv } from '../auth/_utils';
import { checkAiGate } from './_gate';

interface Env extends AuthEnv {
  ANTHROPIC_API_KEY?: string;
}

interface AnalyzeRequest {
  symbol: string;
  name?: string;
  price: number;
  changePct: number;
  rsi?: number;
  macd?: 'bullish' | 'bearish' | 'neutral';
  trend?: 'long' | 'short' | 'neutral';
  emaPositions?: Array<{ period: number; above: boolean }>;
  sector?: string;
  news?: Array<{ title: string; source: string }>;
}

interface AnthropicResponse {
  content: Array<{ text: string; type: string }>;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // AI gate — sadece admin (aiForAllUsers kapalı iken)
  const auth = await getAuthedUser(request, env).catch(() => null);
  const gate = checkAiGate(auth);
  if (!gate.allowed) {
    return new Response(JSON.stringify({ ok: false, ...gate.errorBody }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY env not set' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: AnalyzeRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.symbol || !Number.isFinite(body.price)) {
    return new Response(JSON.stringify({ ok: false, error: 'symbol ve price zorunlu' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const newsLine = body.news && body.news.length > 0
    ? body.news.slice(0, 3).map((n) => `- ${n.title} (${n.source})`).join('\n')
    : 'Bu sembolle ilgili güncel haber yok.';

  const emaLine = body.emaPositions && body.emaPositions.length > 0
    ? body.emaPositions.map((e) => `EMA${e.period}: ${e.above ? 'üstünde' : 'altında'}`).join(', ')
    : 'EMA verisi yok';

  const prompt = `Sen Türkçe konuşan kıdemli bir finansal analistsin. Aşağıdaki BIST hissesi için 120-180 kelimelik kısa ama yoğun bir teknik+temel analiz yaz.

HİSSE: ${body.symbol}${body.name ? ` (${body.name})` : ''}
${body.sector ? `Sektör: ${body.sector}` : ''}
Fiyat: ${body.price.toFixed(2)}₺ (${body.changePct >= 0 ? '+' : ''}${body.changePct.toFixed(2)}% bugün)

TEKNİK GÖSTERGELER:
${body.rsi != null ? `- RSI(14): ${body.rsi.toFixed(1)}` : ''}
${body.macd ? `- MACD: ${body.macd}` : ''}
${body.trend ? `- Trend: ${body.trend}` : ''}
- EMA Pozisyonları: ${emaLine}

SON HABERLER:
${newsLine}

ANALİZ FORMATI:
1. Tek paragraf, akıcı Türkçe
2. Mevcut durumun değerlendirmesi
3. Risk faktörleri
4. Kısa vadeli yön beklentisi
5. Yatırım tavsiyesi DEĞİL — sadece bilgi amaçlı uyarısı

Hemen analiz yaz, başlık/marka olmadan:`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return new Response(JSON.stringify({ ok: false, error: `Anthropic API error ${r.status}: ${errText.slice(0, 200)}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const json = (await r.json()) as AnthropicResponse;
    const text = json.content?.[0]?.text ?? '';

    return new Response(JSON.stringify({
      ok: true,
      symbol: body.symbol,
      analysis: text,
      model: 'claude-3-5-haiku-latest',
      generatedAt: new Date().toISOString(),
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // 1 saat cache
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// CORS preflight
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
