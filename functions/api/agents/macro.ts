/**
 * Cloudflare Pages Function — Macro Agent.
 *
 * POST /api/agents/macro
 *
 * Akış:
 *   1) Yahoo proxy üzerinden makro göstergeler çekilir (USD/TRY, BIST, Brent, VIX vs.)
 *   2) Mevcutsa TR CDS de eklenir (/api/tr-cds)
 *   3) Claude Haiku ile günlük risk skoru + 1 paragraf Türkçe yorum üretilir
 *   4) Yapılandırılmış JSON döner: { riskScore, riskLabel, drivers[], commentary }
 *
 * Edge cache 1 saat.
 */

interface Env {
  ANTHROPIC_API_KEY?: string;
}

interface MacroSnapshot {
  symbol: string;
  label: string;
  value: number;
  changePct: number;
  unit?: string;
}

interface AgentMacroResponse {
  ok: boolean;
  generatedAt: string;
  model: string;
  riskScore?: number;     // 0-100, 0 = sakin, 100 = panik
  riskLabel?: 'düşük' | 'orta' | 'yüksek' | 'çok yüksek';
  headline?: string;      // 1 cümle slogan
  commentary?: string;    // 1-2 paragraf
  drivers?: Array<{ name: string; impact: 'pozitif' | 'negatif' | 'nötr'; note: string }>;
  snapshot?: MacroSnapshot[];
  error?: string;
}

interface AnthropicResponse {
  content: Array<{ text: string; type: string }>;
}

const SYMBOLS: Array<{ sym: string; label: string; unit?: string }> = [
  { sym: '^GSPC',     label: 'S&P 500' },
  { sym: '^VIX',      label: 'VIX' },
  { sym: 'DX-Y.NYB',  label: 'DXY' },
  { sym: '^TNX',      label: 'ABD 10Y Faiz', unit: '%' },
  { sym: 'XU100.IS',  label: 'BIST 100' },
  { sym: 'BZ=F',      label: 'Brent', unit: '$/varil' },
  { sym: 'GC=F',      label: 'Altın', unit: '$/ons' },
  { sym: 'SI=F',      label: 'Gümüş', unit: '$/ons' },
  { sym: 'USDTRY=X',  label: 'USD/TRY' },
  { sym: 'EURTRY=X',  label: 'EUR/TRY' },
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

async function fetchYahoo(origin: string, sym: string): Promise<{ value: number; changePct: number } | null> {
  try {
    const url = `${origin}/api/yahoo/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number } }> } };
    const meta = j.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
    return {
      value: meta.regularMarketPrice,
      changePct: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
    };
  } catch {
    return null;
  }
}

async function fetchTrCds(origin: string): Promise<{ value: number; changePct?: number } | null> {
  try {
    const r = await fetch(`${origin}/api/tr-cds`);
    if (!r.ok) return null;
    const j = await r.json() as { ok: boolean; value?: number; changePct?: number };
    if (!j.ok || j.value == null) return null;
    return { value: j.value, changePct: j.changePct };
  } catch {
    return null;
  }
}

async function fetchTr10y(origin: string): Promise<{ value: number; changePct?: number } | null> {
  try {
    const r = await fetch(`${origin}/api/tr-10y`);
    if (!r.ok) return null;
    const j = await r.json() as { ok: boolean; value?: number; changePct?: number };
    if (!j.ok || j.value == null) return null;
    return { value: j.value, changePct: j.changePct };
  } catch {
    return null;
  }
}

function parseClaudeJson<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { /* */ }
  const m = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (m) { try { return JSON.parse(m[1]) as T; } catch { /* */ } }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)) as T; } catch { /* */ }
  }
  return null;
}

interface ClaudeMacroOutput {
  riskScore: number;
  riskLabel: string;
  headline: string;
  commentary: string;
  drivers: Array<{ name: string; impact: string; note: string }>;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ ok: false, error: 'ANTHROPIC_API_KEY env not set' }, 503, 60);
  }

  const origin = new URL(request.url).origin;

  // Makro verileri paralel çek
  const [yahooResults, trCds, tr10y] = await Promise.all([
    Promise.all(SYMBOLS.map(async (s) => {
      const r = await fetchYahoo(origin, s.sym);
      return r ? { symbol: s.sym, label: s.label, unit: s.unit, value: r.value, changePct: r.changePct } : null;
    })),
    fetchTrCds(origin),
    fetchTr10y(origin),
  ]);

  const snapshot: MacroSnapshot[] = yahooResults.filter((x): x is MacroSnapshot => x !== null);
  if (trCds) {
    snapshot.push({
      symbol: 'TR-CDS-5Y',
      label: 'TR 5Y CDS',
      value: trCds.value,
      changePct: trCds.changePct ?? 0,
      unit: 'bps',
    });
  }
  if (tr10y) {
    snapshot.push({
      symbol: 'TR-10Y-BOND',
      label: 'TR 10Y Tahvil',
      value: tr10y.value,
      changePct: tr10y.changePct ?? 0,
      unit: '%',
    });
  }

  if (snapshot.length < 3) {
    return jsonResponse({ ok: false, error: 'Yeterli makro veri çekilemedi' }, 502, 60);
  }

  // Claude için context oluştur
  const ctx = snapshot.map((s) => {
    const sign = s.changePct >= 0 ? '+' : '';
    const u = s.unit ? ` ${s.unit}` : '';
    return `- ${s.label}: ${s.value.toFixed(2)}${u} (${sign}${s.changePct.toFixed(2)}%)`;
  }).join('\n');

  const prompt = `Sen Türkçe konuşan kıdemli bir makro stratejistsin. Aşağıdaki güncel makro göstergeleri değerlendirerek BIST yatırımcıları için günlük risk briefingi üret.

GÜNCEL GÖSTERGELER:
${ctx}

GÖREV:
1. 0-100 arası "riskScore" üret (0 = sakin, 30 = düşük, 50 = orta, 70 = yüksek, 90+ = çok yüksek)
2. riskLabel: "düşük" | "orta" | "yüksek" | "çok yüksek"
3. 1 cümlelik "headline" (örn. "Risk-off baskı, TL varlıklara dikkat")
4. 1-2 paragraf "commentary" (Türkçe, akıcı, somut nedenler)
5. drivers: 2-4 ana sürücü, her biri {name, impact: pozitif|negatif|nötr, note: kısa Türkçe}

ÇIKTI: SADECE JSON object, başında { sonunda }. Markdown yok.
{
  "riskScore": 65,
  "riskLabel": "yüksek",
  "headline": "...",
  "commentary": "...",
  "drivers": [{ "name": "VIX", "impact": "negatif", "note": "..." }]
}`;

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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      return jsonResponse({ ok: false, error: `Anthropic ${r.status}: ${errText.slice(0, 200)}` }, 502, 60);
    }
    const json = (await r.json()) as AnthropicResponse;
    claudeText = json.content?.[0]?.text ?? '';
  } catch (e) {
    return jsonResponse({ ok: false, error: `Anthropic fetch: ${(e as Error).message}` }, 500, 30);
  }

  const parsed = parseClaudeJson<ClaudeMacroOutput>(claudeText);
  if (!parsed) {
    return jsonResponse({
      ok: false,
      error: 'Claude JSON parse edilemedi',
      rawSnippet: claudeText.slice(0, 300),
    }, 502, 60);
  }

  const validLabel = (l: string): AgentMacroResponse['riskLabel'] => {
    if (l === 'düşük' || l === 'orta' || l === 'yüksek' || l === 'çok yüksek') return l;
    return 'orta';
  };

  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    model: 'claude-haiku-4-5',
    riskScore: Math.max(0, Math.min(100, Math.round(parsed.riskScore ?? 50))),
    riskLabel: validLabel(parsed.riskLabel ?? 'orta'),
    headline: parsed.headline ?? '',
    commentary: parsed.commentary ?? '',
    drivers: Array.isArray(parsed.drivers) ? parsed.drivers.map((d) => ({
      name: String(d.name ?? ''),
      impact: (['pozitif', 'negatif', 'nötr'].includes(d.impact) ? d.impact : 'nötr') as 'pozitif' | 'negatif' | 'nötr',
      note: String(d.note ?? ''),
    })).slice(0, 5) : [],
    snapshot,
  }, 200, 3600);
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
