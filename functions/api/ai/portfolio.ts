/**
 * Cloudflare Pages Function — Portföy için AI analiz üretir.
 *
 * POST /api/ai/portfolio
 * Body: { positions[], totalValue, totalCost, totalPnlPct, dailyPnlPct, marketContext? }
 *
 * Claude Haiku 4.5 ile risk profili + öneri üretir.
 */

interface Env {
  ANTHROPIC_API_KEY?: string;
}

interface PortfolioRequest {
  positions: Array<{
    symbol: string;
    name?: string;
    sector?: string;
    lot: number;
    avgPrice: number;
    currentPrice?: number;
    pnlPct?: number;
    changePct?: number;
  }>;
  totalValue: number;
  totalCost: number;
  totalPnlPct: number;
  dailyPnlPct: number;
  marketContext?: {
    bist100Change?: number;
    usdTryChange?: number;
  };
}

interface AnthropicResponse {
  content: Array<{ text: string; type: string }>;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY env not set' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: PortfolioRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.positions || body.positions.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'Portföy boş' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Sektör dağılımını hesapla
  const sectorMap = new Map<string, number>();
  for (const p of body.positions) {
    if (!p.currentPrice) continue;
    const val = p.lot * p.currentPrice;
    const sec = p.sector || 'Diğer';
    sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + val);
  }
  const sectorBreakdown = Array.from(sectorMap.entries())
    .map(([sec, val]) => `- ${sec}: %${((val / body.totalValue) * 100).toFixed(1)}`)
    .join('\n');

  const positionLines = body.positions
    .slice(0, 20)
    .map((p) => {
      const pnlStr = p.pnlPct != null ? `, K/Z %${p.pnlPct.toFixed(2)}` : '';
      const todayStr = p.changePct != null ? `, bugün %${p.changePct.toFixed(2)}` : '';
      return `- ${p.symbol} (${p.name ?? ''}) — ${p.lot} lot @ ${p.avgPrice}₺${pnlStr}${todayStr}`;
    })
    .join('\n');

  const prompt = `Sen Türkçe konuşan kıdemli bir portföy yöneticisisin. Aşağıdaki bireysel yatırımcı portföyü için 180-220 kelimelik kapsamlı analiz yaz.

PORTFÖY ÖZETİ:
- Toplam değer: ${body.totalValue.toFixed(2)}₺
- Toplam maliyet: ${body.totalCost.toFixed(2)}₺
- Toplam K/Z: %${body.totalPnlPct.toFixed(2)}
- Bugünkü değişim: %${body.dailyPnlPct.toFixed(2)}
- Pozisyon sayısı: ${body.positions.length}

SEKTÖR DAĞILIMI:
${sectorBreakdown}

POZİSYONLAR:
${positionLines}

${body.marketContext ? `PİYASA BAĞLAMI:
- BIST 100 bugün: ${body.marketContext.bist100Change?.toFixed(2)}%
- USD/TRY bugün: ${body.marketContext.usdTryChange?.toFixed(2)}%` : ''}

ANALİZ KAPSAMI:
1. Genel risk profili (düşük/orta/yüksek) + neden
2. Sektör çeşitlendirmesi değerlendirmesi
3. Performans yorumu (BIST'e göre üst/alt)
4. En riskli 1-2 pozisyon (varsa kayıpta olanlar, aşırı yoğunlaşmalar)
5. Somut 2-3 aksiyon önerisi (rebalance, profit-taking, stop loss)

Akıcı Türkçe, yatırım tavsiyesi değil bilgi amaçlı uyarısı sonda. Madde işaretleri kullanma, paragraf halinde yaz:`;

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
        max_tokens: 700,
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
      analysis: text,
      model: 'claude-3-5-haiku-latest',
      generatedAt: new Date().toISOString(),
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
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

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
