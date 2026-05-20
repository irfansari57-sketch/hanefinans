/**
 * Cloudflare Pages Function — Briefing Agent (4-in-1 ozet).
 *
 * GET /api/agents/briefing
 *
 * Paralel olarak macro, news, sentiment, indicator agent'larini cagirir.
 * Cikti: JSON (sections) + Telegram Markdown text (cron/daily-report tarafindan kullanilir).
 * Edge cache 30 dk.
 */

interface BriefingResponse {
  ok: boolean;
  generatedAt: string;
  text: string;
  sections: {
    macro?: unknown;
    news?: unknown;
    sentiment?: unknown;
    indicator?: unknown;
  };
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

async function callAgent<T>(origin: string, path: string, body?: unknown, method = 'POST'): Promise<T | null> {
  try {
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    };
    if (method === 'POST') init.body = JSON.stringify(body ?? {});
    const r = await fetch(`${origin}${path}`, init);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

interface MacroResult {
  ok: boolean;
  riskScore?: number;
  riskLabel?: string;
  headline?: string;
  commentary?: string;
  snapshot?: Array<{ label: string; value: number; changePct: number; unit?: string }>;
}

interface NewsResult {
  ok: boolean;
  stories?: Array<{
    rank: number;
    title: string;
    summary: string;
    impact: string;
    symbols: string[];
  }>;
}

interface SentimentResult {
  ok: boolean;
  items?: Array<{
    symbol: string;
    score: number;
    label: string;
  }>;
}

interface IndicatorResult {
  ok: boolean;
  signals?: Array<{
    symbol: string;
    strength: number;
    label: string;
    reasons: string[];
  }>;
}

function arrow(pct: number): string {
  if (pct >= 0.05) return '🟢';
  if (pct <= -0.05) return '🔴';
  return '➡️';
}

function fmt(v: number, dec = 2): string {
  return v.toLocaleString('tr-TR', { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

function impactEmoji(impact: string): string {
  if (impact === 'pozitif') return '🟢';
  if (impact === 'negatif') return '🔴';
  return '⚪';
}

function buildBriefingText(parts: {
  macro: MacroResult | null;
  news: NewsResult | null;
  sentiment: SentimentResult | null;
  indicator: IndicatorResult | null;
}): string {
  const date = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' });
  const lines: string[] = [];
  lines.push(`📊 *Hane Finans Brifingi*`);
  lines.push(`_${date}_`);
  lines.push('');

  // MAKRO
  if (parts.macro?.ok) {
    const m = parts.macro;
    const riskEmoji = m.riskLabel === 'düşük' ? '🟢'
      : m.riskLabel === 'orta' ? '🟡'
      : m.riskLabel === 'yüksek' ? '🟠'
      : m.riskLabel === 'çok yüksek' ? '🔴'
      : '⚪';
    lines.push(`${riskEmoji} *MAKRO* — risk: ${m.riskLabel ?? '?'} (${m.riskScore ?? '?'}/100)`);
    if (m.headline) lines.push(`_${m.headline}_`);
    if (m.commentary) {
      const trimmed = m.commentary.length > 280 ? m.commentary.slice(0, 277) + '...' : m.commentary;
      lines.push(trimmed);
    }
    if (m.snapshot && m.snapshot.length > 0) {
      lines.push('');
      // Ana makro göstergeler (precious metals + döviz HARIÇ — alt bölümde)
      const excludeLabels = new Set(['Altın', 'Gümüş', 'USD/TRY', 'EUR/TRY']);
      const mainIndicators = m.snapshot.filter((s) => !excludeLabels.has(s.label)).slice(0, 5);
      for (const s of mainIndicators) {
        const sign = s.changePct >= 0 ? '+' : '';
        const unit = s.unit ? ` ${s.unit}` : '';
        lines.push(`${arrow(s.changePct)} ${s.label}: ${fmt(s.value)}${unit} (${sign}${fmt(s.changePct)}%)`);
      }
    }
    lines.push('');

    // --- DÖVİZ ---
    const usdTryEntry = m.snapshot?.find((s) => s.label === 'USD/TRY');
    const eurTryEntry = m.snapshot?.find((s) => s.label === 'EUR/TRY');
    if (usdTryEntry || eurTryEntry) {
      lines.push('💱 *DÖVİZ*');
      if (usdTryEntry) {
        const sign = usdTryEntry.changePct >= 0 ? '+' : '';
        lines.push(`${arrow(usdTryEntry.changePct)} USD/TRY: ${fmt(usdTryEntry.value)}₺ (${sign}${fmt(usdTryEntry.changePct)}%)`);
      }
      if (eurTryEntry) {
        const sign = eurTryEntry.changePct >= 0 ? '+' : '';
        lines.push(`${arrow(eurTryEntry.changePct)} EUR/TRY: ${fmt(eurTryEntry.value)}₺ (${sign}${fmt(eurTryEntry.changePct)}%)`);
      }
      lines.push('');
    }

    // --- KIYMETLİ MADENLER (Ons + Gram TL) ---
    const onsAltin = m.snapshot?.find((s) => s.label === 'Altın');
    const onsGumus = m.snapshot?.find((s) => s.label === 'Gümüş');
    const usdTry = usdTryEntry?.value;
    if (onsAltin || onsGumus) {
      lines.push('🥇 *KIYMETLİ MADENLER*');
      const OUNCE_TO_GRAM = 31.1034768;
      if (onsAltin) {
        const sign = onsAltin.changePct >= 0 ? '+' : '';
        lines.push(`${arrow(onsAltin.changePct)} Ons Altın: ${fmt(onsAltin.value)} \$/oz (${sign}${fmt(onsAltin.changePct)}%)`);
        if (usdTry) {
          const gramAltinTl = (onsAltin.value / OUNCE_TO_GRAM) * usdTry;
          lines.push(`   ↳ Gram Altın: ${fmt(gramAltinTl, 0)}₺`);
        }
      }
      if (onsGumus) {
        const sign = onsGumus.changePct >= 0 ? '+' : '';
        lines.push(`${arrow(onsGumus.changePct)} Ons Gümüş: ${fmt(onsGumus.value)} \$/oz (${sign}${fmt(onsGumus.changePct)}%)`);
        if (usdTry) {
          const gramGumusTl = (onsGumus.value / OUNCE_TO_GRAM) * usdTry;
          lines.push(`   ↳ Gram Gümüş: ${fmt(gramGumusTl, 2)}₺`);
        }
      }
      lines.push('');
    }
  }

  // INDICATOR
  if (parts.indicator?.ok && parts.indicator.signals && parts.indicator.signals.length > 0) {
    const strong = parts.indicator.signals.filter((s) => Math.abs(s.strength) >= 30);
    if (strong.length > 0) {
      lines.push('⚡ *TEKNİK SİNYALLER*');
      const buys = strong.filter((s) => s.strength > 0).slice(0, 3);
      const sells = strong.filter((s) => s.strength < 0).slice(0, 3);
      for (const s of buys) {
        lines.push(`🟢 *${s.symbol}* ${s.label.toUpperCase()}: ${s.reasons[0] ?? ''}`);
      }
      for (const s of sells) {
        lines.push(`🔴 *${s.symbol}* ${s.label.toUpperCase()}: ${s.reasons[0] ?? ''}`);
      }
      lines.push('');
    }
  }

  // NEWS
  if (parts.news?.ok && parts.news.stories && parts.news.stories.length > 0) {
    lines.push('📰 *GÜNÜN HABERLERİ*');
    for (const s of parts.news.stories.slice(0, 3)) {
      const e = impactEmoji(s.impact);
      const syms = s.symbols.length > 0 ? ` [${s.symbols.slice(0, 3).join(',')}]` : '';
      lines.push(`${e} *${s.rank}.* ${s.title}${syms}`);
      const sum = s.summary.length > 100 ? s.summary.slice(0, 97) + '...' : s.summary;
      lines.push(`   _${sum}_`);
    }
    lines.push('');
  }

  // SENTIMENT
  if (parts.sentiment?.ok && parts.sentiment.items && parts.sentiment.items.length > 0) {
    const pos = parts.sentiment.items.filter((i) => i.label === 'positive').slice(0, 3);
    const neg = [...parts.sentiment.items].filter((i) => i.label === 'negative').sort((a, b) => a.score - b.score).slice(0, 3);
    if (pos.length > 0 || neg.length > 0) {
      lines.push('🗣 *SENTIMENT*');
      if (pos.length > 0) {
        const tags = pos.map((p) => `*${p.symbol}* (+${p.score.toFixed(2)})`).join(', ');
        lines.push(`🟢 Olumlu: ${tags}`);
      }
      if (neg.length > 0) {
        const tags = neg.map((n) => `*${n.symbol}* (${n.score.toFixed(2)})`).join(', ');
        lines.push(`🔴 Olumsuz: ${tags}`);
      }
      lines.push('');
    }
  }

  lines.push('🌐 Detaylı: hanefinans.net/panel');

  let text = lines.join('\n');
  if (text.length > 4000) text = text.slice(0, 3997) + '...';
  return text;
}

export const onRequest: PagesFunction = async ({ request }) => {
  const origin = new URL(request.url).origin;

  const [macro, news, sentiment, indicator] = await Promise.all([
    callAgent<MacroResult>(origin, '/api/agents/macro'),
    callAgent<NewsResult>(origin, '/api/agents/news', { maxStories: 5 }),
    callAgent<SentimentResult>(origin, '/api/agents/sentiment'),
    callAgent<IndicatorResult>(origin, '/api/agents/indicator'),
  ]);

  const text = buildBriefingText({ macro, news, sentiment, indicator });

  const data: BriefingResponse = {
    ok: true,
    generatedAt: new Date().toISOString(),
    text,
    sections: {
      macro: macro ?? undefined,
      news: news ?? undefined,
      sentiment: sentiment ?? undefined,
      indicator: indicator ?? undefined,
    },
  };

  return jsonResponse(data, 200, 1800);
};
