/**
 * POST /api/ai/deep-analyze
 *
 * Hisse icin premium AI derin analiz.
 * Tier: Elite limitsiz, Pro 2/ay, Free 403 (paywall).
 * Cache: 24 saat D1 — ayni sembol icin AI tekrar cagrilmaz.
 *
 * Body: { symbol, name?, price, changePct, sector?, rsi?, macd?, ema?: {5,8,21,55}, news?: [{title, source, date}] }
 * Response: { ok, content_md, cached, quota: { used, limit, remaining } }
 */

import { getAuthedUser, type Env as AuthEnv } from '../auth/_utils';

interface Env extends AuthEnv {
  ANTHROPIC_API_KEY?: string;
}

interface DeepAnalyzeRequest {
  symbol: string;
  name?: string;
  price: number;
  changePct: number;
  sector?: string;
  rsi?: number;
  macd?: 'bullish' | 'bearish' | 'neutral';
  trend?: 'long' | 'short' | 'neutral';
  ema?: { period: number; above: boolean }[];
  // Son ceyrek finansallari (varsa)
  financials?: {
    revenue?: number;       // milyon TL
    revenueChange?: number; // YoY %
    netIncome?: number;     // milyon TL
    eps?: number;
    pe?: number;
    pb?: number;
  };
  news?: { title: string; source: string; date?: string }[];
  // Sektor karsilastirmasi (ortalama getiri)
  sectorAvg?: {
    r1a?: number;
    r3a?: number;
    r1y?: number;
  };
  // Makro durum (BIST 100 + USD/TRY + faiz)
  macro?: {
    bist100Change?: number;
    usdTryChange?: number;
    policyRate?: number;
    inflation?: number;
  };
}

interface AnthropicResponse {
  content: Array<{ text: string; type: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}

const PRO_MONTHLY_LIMIT = 2;
const CACHE_HOURS = 24;
const MODEL = 'claude-3-5-sonnet-latest';

function startOfMonth(): number {
  const now = new Date();
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), 1) - 3 * 60 * 60 * 1000;
}

function buildPrompt(req: DeepAnalyzeRequest): string {
  const newsLine = req.news && req.news.length > 0
    ? req.news.slice(0, 5).map((n) => `- ${n.title} (${n.source}${n.date ? `, ${n.date}` : ''})`).join('\n')
    : 'Son donemde onemli haber yok.';

  const emaLine = req.ema && req.ema.length > 0
    ? req.ema.map((e) => `EMA${e.period}: ${e.above ? 'ust' : 'alt'}`).join(', ')
    : 'EMA bilgisi yok';

  const finLine = req.financials
    ? `Hasılat: ${req.financials.revenue?.toFixed(0) ?? '?'}M TL (YoY ${req.financials.revenueChange?.toFixed(1) ?? '?'}%), Net Kar: ${req.financials.netIncome?.toFixed(0) ?? '?'}M TL, EPS: ${req.financials.eps?.toFixed(2) ?? '?'}, F/K: ${req.financials.pe?.toFixed(1) ?? '?'}, PD/DD: ${req.financials.pb?.toFixed(2) ?? '?'}`
    : 'Finansal veri yok';

  const sectorLine = req.sectorAvg
    ? `Sektor ort. getiri — 1A: ${req.sectorAvg.r1a?.toFixed(1) ?? '?'}%, 3A: ${req.sectorAvg.r3a?.toFixed(1) ?? '?'}%, 1Y: ${req.sectorAvg.r1y?.toFixed(1) ?? '?'}%`
    : 'Sektor karsilastirmasi yok';

  const macroLine = req.macro
    ? `BIST 100: ${req.macro.bist100Change?.toFixed(2) ?? '?'}%, USD/TRY: ${req.macro.usdTryChange?.toFixed(2) ?? '?'}%, Politika Faizi: ${req.macro.policyRate?.toFixed(2) ?? '?'}%, TUFE: ${req.macro.inflation?.toFixed(1) ?? '?'}%`
    : 'Makro veri yok';

  return `Sen kidemli bir Turk finansal analistsin. Asagidaki BIST hissesi icin PREMIUM kapsamli derin analiz yaz (Elite kullanici icin).

HISSE: ${req.symbol}${req.name ? ` (${req.name})` : ''}
${req.sector ? `Sektor: ${req.sector}` : ''}
Fiyat: ${req.price.toFixed(2)} TL (${req.changePct >= 0 ? '+' : ''}${req.changePct.toFixed(2)}% bugun)

TEKNIK GOSTERGELER:
${req.rsi != null ? `- RSI(14): ${req.rsi.toFixed(1)}` : '- RSI: yok'}
${req.macd ? `- MACD: ${req.macd}` : '- MACD: yok'}
${req.trend ? `- Trend: ${req.trend}` : '- Trend: yok'}
- EMA: ${emaLine}

FINANSALLAR:
${finLine}

SEKTOR KARSILAS:
${sectorLine}

MAKRO:
${macroLine}

SON HABERLER (max 5):
${newsLine}

CIKTI FORMATI (Markdown, Turkce, 600-900 kelime, 5 bolum):

## 1. Genel Degerlendirme
2-3 paragraf: hissenin mevcut konumu, teknik+temel ozet, kisa-orta vadeli bakis acisi.

## 2. Teknik Analiz
RSI/MACD/EMA degerlendirmesi, destek-direnc seviyeleri, momentum durumu.

## 3. Sektor & Makro Konum
Sektor ortalamasiyla karsilastirma. Mevcut makro (faiz, kur, enflasyon) hisseyi nasil etkiliyor.

## 4. Risk Faktorleri (3-5 madde)
Kritik riskler: \`-\` ile baslayan madde isareti.

## 5. Senaryo Analizi
- **Iyimser:** + Hedef fiyat aralığı (~%X)
- **Baz:** + Hedef fiyat aralığı (~%X)
- **Kotumser:** + Hedef fiyat aralığı (~%X)

SAYISAL HEDEFLER vermekten cekinme — bu Elite kullanici icin premium icerik. Yatirim tavsiyesi degildir uyarısını sona ekle.`;
}

interface UserRow {
  tier: 'free' | 'pro' | 'elite';
  is_admin?: 0 | 1 | null;
}

async function checkProMonthlyQuota(db: D1Database, userId: number): Promise<number> {
  const start = startOfMonth();
  const row = await db
    .prepare(`SELECT COUNT(*) as cnt FROM deep_analyses WHERE user_id=? AND generated_at >= ?`)
    .bind(userId, start)
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

async function fetchCachedAnalysis(db: D1Database, symbol: string): Promise<{ content_md: string; generated_at: number } | null> {
  const cutoff = Date.now() - CACHE_HOURS * 60 * 60 * 1000;
  const row = await db
    .prepare(`SELECT content_md, generated_at FROM deep_analyses
              WHERE symbol=? AND generated_at >= ?
              ORDER BY generated_at DESC LIMIT 1`)
    .bind(symbol, cutoff)
    .first<{ content_md: string; generated_at: number }>();
  return row ?? null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY not set' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Auth check ---
  const auth = await getAuthedUser(request, env).catch(() => null);
  if (!auth?.user) {
    return new Response(JSON.stringify({
      ok: false, error: 'auth_required',
      message: 'Bu analiz icin giris yapmaniz gerekiyor. Pro veya Elite uyelik gerekli.',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const user = auth.user as UserRow & { id: number };
  const tier = user.tier;

  // --- AI Derin Analiz sadece ELITE uyelere acik (Free + Pro paywall) ---
  if (tier !== 'elite') {
    return new Response(JSON.stringify({
      ok: false, error: 'tier_required',
      message: 'AI Derin Analiz sadece Elite uyelere ozeldir (limitsiz analiz).',
      requiredTier: 'elite',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  // --- Parse body ---
  let body: DeepAnalyzeRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.symbol || !Number.isFinite(body.price)) {
    return new Response(JSON.stringify({ ok: false, error: 'symbol ve price zorunlu' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Cache check (24 saat) ---
  const cached = await fetchCachedAnalysis(env.DB, body.symbol);
  if (cached) {
    return new Response(JSON.stringify({
      ok: true,
      content_md: cached.content_md,
      cached: true,
      generated_at: cached.generated_at,
      quota: { used: 0, limit: -1, remaining: -1 }, // Elite = unlimited
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // --- AI call (Claude Sonnet) ---
  const prompt = buildPrompt(body);
  const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!aiResp.ok) {
    const errText = await aiResp.text();
    return new Response(JSON.stringify({
      ok: false, error: 'ai_failed',
      message: `AI servisinden cevap alinamadi (${aiResp.status})`,
      detail: errText.slice(0, 200),
    }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  const aiData = (await aiResp.json()) as AnthropicResponse;
  const contentMd = aiData.content?.[0]?.text?.trim();
  if (!contentMd) {
    return new Response(JSON.stringify({ ok: false, error: 'empty_response' }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }

  const generated_at = Date.now();
  const tokensInput = aiData.usage?.input_tokens ?? null;
  const tokensOutput = aiData.usage?.output_tokens ?? null;

  // --- D1 store ---
  await env.DB
    .prepare(`INSERT INTO deep_analyses
      (user_id, symbol, content_md, model_version, tokens_input, tokens_output, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(user.id, body.symbol, contentMd, MODEL, tokensInput, tokensOutput, generated_at)
    .run();

  // Elite = limitsiz, kota guncellemesi yok
  return new Response(JSON.stringify({
    ok: true,
    content_md: contentMd,
    cached: false,
    generated_at,
    quota: { used: 0, limit: -1, remaining: -1 },
  }), { headers: { 'Content-Type': 'application/json' } });
};
