/**
 * Portföy Sağlık Skoru — 0-100 arası deterministik skor + AI özet.
 *
 * GET  /api/ai/portfolio-health           → kullanıcının en son skorunu döner (cache)
 * POST /api/ai/portfolio-health           → yeni skor hesaplar, cache'e yazar
 *
 * Skor kompozisyonu (6 metrik, toplam 100):
 *   - Çeşitlilik (25p)          : Sektör HHI (Herfindahl-Hirschman Index)
 *   - Konsantrasyon (20p)       : En büyük pozisyon oranı
 *   - Risk uyumu (20p)          : Kayıtlı risk profili vs portföy volatilitesi
 *   - Getiri (15p)              : 30-günlük getiri vs BIST 100
 *   - TEFAS erişilebilirlik (10p): Kapalı fon oranı (düşük iyi)
 *   - Likidite (10p)            : Küçük pozisyon sayısı (fazlaysa parçalanmış)
 *
 * AI özeti (Anthropic Haiku): skoru okur, 2-3 cümle özet + 3 somut öneri üretir.
 * Aynı gün içinde tekrar hesaplama D1 cache'inden döner (Anthropic maliyeti kes).
 */

import { getAuthedUser, type Env as AuthEnv } from '../auth/_utils';
import { checkAiGate } from './_gate';

interface Env extends AuthEnv {
  DB?: D1Database;
  ANTHROPIC_API_KEY?: string;
}

interface Position {
  symbol: string;
  name?: string;
  sector?: string;
  kind: 'stock' | 'fund';
  lot: number;
  avgPrice: number;
  currentPrice?: number;
  tefasOpen?: boolean; // fon için: TEFAS'ta işleme açık mı
  changePct30d?: number; // 30 günlük getiri %
  changePctDaily?: number;
}

interface ScoreBreakdown {
  diversity: { score: number; max: 25; detail: { sectorCount: number; hhi: number } };
  concentration: { score: number; max: 20; detail: { largestShare: number } };
  risk: { score: number; max: 20; detail: { profileMatch: string; volatility?: number } };
  returns: { score: number; max: 15; detail: { avg30d: number; bist30d?: number } };
  tefas: { score: number; max: 10; detail: { closedFunds: number; totalFunds: number } };
  liquidity: { score: number; max: 10; detail: { tinyPositions: number; totalValue: number } };
}

interface HealthScoreResponse {
  ok: boolean;
  score?: number;
  color?: 'green' | 'yellow' | 'orange' | 'red';
  label?: string;
  breakdown?: ScoreBreakdown;
  aiSummary?: string;
  aiSuggestions?: string[];
  asOf?: string;
  fromCache?: boolean;
  error?: string;
}

interface CalcInput {
  positions: Position[];
  totalValue: number;
  riskProfileTolerance?: 'low' | 'medium' | 'high' | null;
  bist30d?: number;
}

// ============================================================================
// Deterministik skor hesabı
// ============================================================================

function computeScore(input: CalcInput): { totalScore: number; breakdown: ScoreBreakdown } {
  const { positions, totalValue, riskProfileTolerance, bist30d = 0 } = input;

  // ---- Değerler ----
  const posValues = positions.map((p) => (p.currentPrice ?? p.avgPrice) * p.lot);
  const sumValue = posValues.reduce((a, b) => a + b, 0) || totalValue || 1;
  const weights = posValues.map((v) => v / sumValue);

  // ---- 1. Çeşitlilik (25p) — HHI + sektör sayısı ----
  const sectorMap = new Map<string, number>();
  positions.forEach((p, i) => {
    const sec = p.sector || 'Bilinmiyor';
    sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + weights[i]);
  });
  const sectorShares = Array.from(sectorMap.values());
  const hhi = sectorShares.reduce((sum, s) => sum + s * s, 0); // 0-1, düşük iyi
  // HHI 0.1 (10 eşit sektör) = tam puan; HHI 1 (tek sektör) = 0 puan
  const diversityRaw = Math.max(0, Math.min(1, (1 - hhi) / 0.9));
  const diversityScore = diversityRaw * 25;

  // ---- 2. Konsantrasyon (20p) — En büyük pozisyon ----
  const largestShare = Math.max(...weights);
  // <%15 tam puan; %50+ = 0 puan
  const concentrationRaw = Math.max(0, Math.min(1, (0.5 - largestShare) / 0.35));
  const concentrationScore = concentrationRaw * 20;

  // ---- 3. Risk uyumu (20p) — profile göre ----
  // Yaklaşım: yüksek risk profili → daha yüksek çeşitlendirilmemişe tolerans.
  // Düşük risk profili → çok çeşitlendirilmişe tam puan.
  let riskScore = 15; // default (profile yoksa varsayılan orta)
  let profileMatch = 'Profil yok';
  if (riskProfileTolerance === 'low') {
    // Düşük risk profili → HHI < 0.2, konsantrasyon < %20 iyi
    riskScore = ((1 - hhi) * 10) + ((0.3 - largestShare) * 33.33);
    riskScore = Math.max(0, Math.min(20, riskScore));
    profileMatch = riskScore > 15 ? 'Uygun' : riskScore > 10 ? 'Kısmen' : 'Uyumsuz';
  } else if (riskProfileTolerance === 'medium') {
    riskScore = ((1 - hhi) * 8) + ((0.4 - largestShare) * 30);
    riskScore = Math.max(0, Math.min(20, riskScore));
    profileMatch = riskScore > 15 ? 'Uygun' : riskScore > 10 ? 'Kısmen' : 'Uyumsuz';
  } else if (riskProfileTolerance === 'high') {
    // Yüksek risk kabul edilebilir → konsantrasyon daha az önemli
    riskScore = 12 + ((0.6 - largestShare) * 13.33);
    riskScore = Math.max(0, Math.min(20, riskScore));
    profileMatch = riskScore > 15 ? 'Uygun' : 'Kısmen';
  }

  // ---- 4. Getiri (15p) — 30 günlük ortalama vs BIST ----
  const returnsPositions = positions.filter((p) => Number.isFinite(p.changePct30d));
  const avg30d = returnsPositions.length > 0
    ? returnsPositions.reduce((s, p, _i) => s + (p.changePct30d ?? 0) * (weights[positions.indexOf(p)] || 0), 0) /
      returnsPositions.reduce((s, p) => s + (weights[positions.indexOf(p)] || 0), 0)
    : 0;
  // BIST'i geçmek tam puan; -5% altı 0 puan
  const relPerf = avg30d - (bist30d || 0);
  const returnRaw = Math.max(0, Math.min(1, (relPerf + 5) / 10));
  const returnScore = returnRaw * 15;

  // ---- 5. TEFAS erişilebilirlik (10p) ----
  const funds = positions.filter((p) => p.kind === 'fund');
  const closedFunds = funds.filter((p) => p.tefasOpen === false).length;
  const totalFunds = funds.length;
  // Tüm fonlar açık → tam puan; %50+ kapalı → 0 puan
  const closedRatio = totalFunds > 0 ? closedFunds / totalFunds : 0;
  const tefasRaw = Math.max(0, 1 - closedRatio * 2);
  const tefasScore = tefasRaw * 10;

  // ---- 6. Likidite (10p) — küçük pozisyon sayısı ----
  const totalValueTL = sumValue;
  const tinyPositions = posValues.filter((v) => v < totalValueTL * 0.03).length; // %3'ten küçük pozisyonlar
  // 0-2 küçük OK; 5+ = 0 puan
  const liquidityRaw = Math.max(0, Math.min(1, (5 - tinyPositions) / 5));
  const liquidityScore = liquidityRaw * 10;

  // ---- Toplam ----
  const totalScore = Math.round(
    diversityScore + concentrationScore + riskScore + returnScore + tefasScore + liquidityScore,
  );

  const breakdown: ScoreBreakdown = {
    diversity: {
      score: Math.round(diversityScore * 10) / 10,
      max: 25,
      detail: { sectorCount: sectorMap.size, hhi: Math.round(hhi * 1000) / 1000 },
    },
    concentration: {
      score: Math.round(concentrationScore * 10) / 10,
      max: 20,
      detail: { largestShare: Math.round(largestShare * 1000) / 10 }, // %
    },
    risk: {
      score: Math.round(riskScore * 10) / 10,
      max: 20,
      detail: { profileMatch },
    },
    returns: {
      score: Math.round(returnScore * 10) / 10,
      max: 15,
      detail: { avg30d: Math.round(avg30d * 100) / 100, bist30d: Math.round(bist30d * 100) / 100 },
    },
    tefas: {
      score: Math.round(tefasScore * 10) / 10,
      max: 10,
      detail: { closedFunds, totalFunds },
    },
    liquidity: {
      score: Math.round(liquidityScore * 10) / 10,
      max: 10,
      detail: { tinyPositions, totalValue: Math.round(totalValueTL) },
    },
  };

  return { totalScore: Math.max(0, Math.min(100, totalScore)), breakdown };
}

function scoreToColor(score: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

function scoreToLabel(score: number): string {
  if (score >= 80) return 'Güçlü';
  if (score >= 60) return 'Orta';
  if (score >= 40) return 'Zayıf';
  return 'Riskli';
}

// ============================================================================
// Anthropic ile AI özet + öneriler
// ============================================================================

interface AnthropicMessage {
  content: Array<{ text?: string; type: string }>;
}

async function generateAiSummary(
  score: number,
  breakdown: ScoreBreakdown,
  positionCount: number,
  apiKey: string,
): Promise<{ summary: string; suggestions: string[] } | null> {
  const prompt = `Sen Türk yatırımcı için portföy analisti asistansın. Aşağıdaki portföy sağlık skoruna bakıp:
1) 2-3 cümle özet (skorun anlamı, en zayıf 1-2 metrik)
2) 3 somut, uygulanabilir öneri (madde madde)

Portföy pozisyon sayısı: ${positionCount}
Toplam skor: ${score}/100 (${scoreToLabel(score)})

Metrik detay:
- Çeşitlilik: ${breakdown.diversity.score}/25 (${breakdown.diversity.detail.sectorCount} sektör, HHI ${breakdown.diversity.detail.hhi})
- Konsantrasyon: ${breakdown.concentration.score}/20 (en büyük pozisyon %${breakdown.concentration.detail.largestShare})
- Risk uyumu: ${breakdown.risk.score}/20 (${breakdown.risk.detail.profileMatch})
- Getiri: ${breakdown.returns.score}/15 (30g ort %${breakdown.returns.detail.avg30d}, BIST %${breakdown.returns.detail.bist30d})
- TEFAS erişim: ${breakdown.tefas.score}/10 (${breakdown.tefas.detail.closedFunds}/${breakdown.tefas.detail.totalFunds} kapalı fon)
- Likidite: ${breakdown.liquidity.score}/10 (${breakdown.liquidity.detail.tinyPositions} küçük pozisyon)

Sadece JSON formatında dön:
{"summary": "...", "suggestions": ["...", "...", "..."]}

Kural: yatırım tavsiyesi değil, portföy hijyeni gözlemi olsun. "Öneri" değil "gözlem" tonunda.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) {
      console.warn('[portfolio-health] Anthropic HTTP', resp.status);
      return null;
    }
    const data = (await resp.json()) as AnthropicMessage;
    const text = data.content?.[0]?.text ?? '';
    // Extract JSON from text (Anthropic bazen "İşte JSON: ..." diye başlar)
    const m = text.match(/\{[\s\S]*"summary"[\s\S]*"suggestions"[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as { summary?: string; suggestions?: string[] };
    if (!parsed.summary || !Array.isArray(parsed.suggestions)) return null;
    return {
      summary: parsed.summary,
      suggestions: parsed.suggestions.slice(0, 3),
    };
  } catch (e) {
    console.warn('[portfolio-health] AI fail:', (e as Error).message);
    return null;
  }
}

// ============================================================================
// Endpoint
// ============================================================================

function jsonResp(body: HealthScoreResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** YYYY-MM-DD Istanbul */
function istanbulToday(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

/** GET — en son skoru cache'ten döner */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return jsonResp({ ok: false, error: 'Servis kullanılamıyor' }, 503);
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResp({ ok: false, error: 'Giriş gerekli' }, 401);

  const row = await env.DB
    .prepare(
      `SELECT total_score, diversity_score, concentration_score, risk_score, return_score,
              tefas_score, liquidity_score, breakdown_json, ai_summary, ai_suggestions_json, as_of
       FROM portfolio_health_scores
       WHERE user_id = ?
       ORDER BY as_of DESC LIMIT 1`,
    )
    .bind(user.id)
    .first<{
      total_score: number;
      breakdown_json: string;
      ai_summary?: string;
      ai_suggestions_json?: string;
      as_of: string;
    }>();

  if (!row) return jsonResp({ ok: true, fromCache: false });

  const breakdown = JSON.parse(row.breakdown_json) as ScoreBreakdown;
  const suggestions = row.ai_suggestions_json ? (JSON.parse(row.ai_suggestions_json) as string[]) : undefined;

  return jsonResp({
    ok: true,
    score: row.total_score,
    color: scoreToColor(row.total_score),
    label: scoreToLabel(row.total_score),
    breakdown,
    aiSummary: row.ai_summary ?? undefined,
    aiSuggestions: suggestions,
    asOf: row.as_of,
    fromCache: true,
  });
};

/** POST — yeni skor hesaplar. Body: { positions, riskProfileTolerance?, bist30d? } */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return jsonResp({ ok: false, error: 'Servis kullanılamıyor' }, 503);
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResp({ ok: false, error: 'Giriş gerekli' }, 401);

  // AI gate — Anthropic'i sadece admin çağırabilir (aiForAllUsers kapalı iken).
  const gate = checkAiGate(user as unknown as Parameters<typeof checkAiGate>[0]);
  if (!gate.allowed) return jsonResp({ ok: false, ...gate.errorBody }, 403);

  let body: CalcInput;
  try {
    body = await request.json();
  } catch {
    return jsonResp({ ok: false, error: 'Geçersiz istek' }, 400);
  }

  if (!body.positions || body.positions.length === 0) {
    return jsonResp({ ok: false, error: 'Portföy boş' }, 400);
  }

  const asOf = istanbulToday();

  // Cache kontrol — bugünkü skor var mı?
  const cached = await env.DB
    .prepare('SELECT total_score, breakdown_json, ai_summary, ai_suggestions_json FROM portfolio_health_scores WHERE user_id = ? AND as_of = ?')
    .bind(user.id, asOf)
    .first<{
      total_score: number;
      breakdown_json: string;
      ai_summary?: string;
      ai_suggestions_json?: string;
    }>();

  if (cached) {
    const breakdown = JSON.parse(cached.breakdown_json) as ScoreBreakdown;
    return jsonResp({
      ok: true,
      score: cached.total_score,
      color: scoreToColor(cached.total_score),
      label: scoreToLabel(cached.total_score),
      breakdown,
      aiSummary: cached.ai_summary ?? undefined,
      aiSuggestions: cached.ai_suggestions_json ? JSON.parse(cached.ai_suggestions_json) : undefined,
      asOf,
      fromCache: true,
    });
  }

  // Yeni hesapla
  const totalValue = body.positions.reduce((s, p) => s + (p.currentPrice ?? p.avgPrice) * p.lot, 0);
  const { totalScore, breakdown } = computeScore({
    positions: body.positions,
    totalValue,
    riskProfileTolerance: body.riskProfileTolerance,
    bist30d: body.bist30d ?? 0,
  });

  // AI özet
  let aiSummary: string | undefined;
  let aiSuggestions: string[] | undefined;
  if (env.ANTHROPIC_API_KEY) {
    const ai = await generateAiSummary(totalScore, breakdown, body.positions.length, env.ANTHROPIC_API_KEY);
    if (ai) {
      aiSummary = ai.summary;
      aiSuggestions = ai.suggestions;
    }
  }

  // Cache'e yaz
  try {
    await env.DB
      .prepare(
        `INSERT INTO portfolio_health_scores
          (user_id, as_of, total_score, diversity_score, concentration_score, risk_score,
           return_score, tefas_score, liquidity_score, breakdown_json,
           ai_summary, ai_suggestions_json, position_snapshot_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.id,
        asOf,
        totalScore,
        breakdown.diversity.score,
        breakdown.concentration.score,
        breakdown.risk.score,
        breakdown.returns.score,
        breakdown.tefas.score,
        breakdown.liquidity.score,
        JSON.stringify(breakdown),
        aiSummary ?? null,
        aiSuggestions ? JSON.stringify(aiSuggestions) : null,
        JSON.stringify(body.positions.map((p) => ({ symbol: p.symbol, lot: p.lot, avgPrice: p.avgPrice }))),
        Date.now(),
      )
      .run();
  } catch (e) {
    console.warn('[portfolio-health] cache write fail:', (e as Error).message);
  }

  return jsonResp({
    ok: true,
    score: totalScore,
    color: scoreToColor(totalScore),
    label: scoreToLabel(totalScore),
    breakdown,
    aiSummary,
    aiSuggestions,
    asOf,
    fromCache: false,
  });
};
