/**
 * Cloudflare Pages Function — Briefing Agent (kapsamlı günlük rapor).
 *
 * GET /api/agents/briefing
 *
 * Sıralama (kullanıcı talebi):
 *   1. Türkiye (BIST 100 + USD/TRY) — başta
 *   2. Top hareketler (BIST gainer/loser)
 *   3. Döviz (EUR/TRY)
 *   4. Kıymetli Madenler (Ons + Gram TL)
 *   5. Watchlist (TELEGRAM_WATCHLIST env)
 *   6. TEFAS top 5 fonlar (yıllık)
 *   7. Makro yorum (Claude)
 *   8. Teknik sinyaller (Indicator Agent)
 *   9. Günün haberleri (News Agent)
 *  10. Sentiment (Sentiment Agent)
 *  11. ABD piyasaları (S&P, VIX, DXY, 10Y, Brent) — sonda
 */

interface Env {
  TELEGRAM_WATCHLIST?: string;  // virgüllü BIST sembol listesi
}

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

interface MacroSnapshot { label: string; value: number; changePct: number; unit?: string; }
interface MacroResult {
  ok: boolean;
  riskScore?: number;
  riskLabel?: string;
  headline?: string;
  commentary?: string;
  snapshot?: MacroSnapshot[];
}
interface NewsResult {
  ok: boolean;
  stories?: Array<{ rank: number; title: string; summary: string; impact: string; symbols: string[]; }>;
}
interface SentimentResult {
  ok: boolean;
  items?: Array<{ symbol: string; score: number; label: string; }>;
}
interface IndicatorResult {
  ok: boolean;
  signals?: Array<{ symbol: string; strength: number; label: string; reasons: string[]; }>;
}

interface YahooQuote { price: number; changePct: number; }
async function fetchYahooQuote(origin: string, symbol: string): Promise<YahooQuote | null> {
  try {
    const url = `${origin}/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number; } }> } };
    const meta = j.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
    return {
      price: meta.regularMarketPrice,
      changePct: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
    };
  } catch { return null; }
}

interface TefasFund { code: string; name: string; returns?: { '1y'?: number | null }; }
async function fetchTefasTop5(): Promise<Array<{ code: string; name: string; year: number }>> {
  try {
    const r = await fetch('https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/tefas.json');
    if (!r.ok) return [];
    const j = await r.json() as { funds?: TefasFund[] };
    if (!Array.isArray(j.funds)) return [];
    return j.funds
      .map((f) => ({ code: f.code, name: f.name, year: f.returns?.['1y'] ?? -Infinity }))
      .filter((f) => Number.isFinite(f.year))
      .sort((a, b) => b.year - a.year)
      .slice(0, 5);
  } catch { return []; }
}

// Popüler BIST sembolleri (top gainer/loser taraması için)
const BIST_POPULAR = [
  'THYAO', 'GARAN', 'AKBNK', 'ISCTR', 'YKBNK', 'HALKB', 'VAKBN',
  'ASELS', 'EREGL', 'KCHOL', 'SAHOL', 'TUPRS', 'BIMAS', 'MGROS',
  'SISE', 'PETKM', 'TOASO', 'FROTO', 'TCELL', 'TTKOM', 'ARCLK',
  'PGSUS', 'TAVHL', 'CIMSA', 'AKCNS', 'KRDMD', 'ENJSA', 'AKSEN',
  'KARSN', 'DOAS', 'SOKM', 'MAVI',
];

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
  bistTop: Array<{ symbol: string; price: number; changePct: number }>;
  watchlistQuotes: Array<{ symbol: string; price: number; changePct: number }>;
  tefasTop: Array<{ code: string; name: string; year: number }>;
}): string {
  const date = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' });
  const lines: string[] = [];
  lines.push(`📊 *Hane Finans Brifingi*`);
  lines.push(`_${date}_`);
  lines.push('');

  const snap = parts.macro?.snapshot ?? [];
  const find = (label: string) => snap.find((s) => s.label === label);

  // === 1) TÜRKİYE (BIST 100 + USD/TRY + TR Risk Primleri) ===
  const bist100 = find('BIST 100');
  const usdTryE = find('USD/TRY');
  const trCds   = find('TR 5Y CDS');
  const tr10y   = find('TR 10Y Tahvil');
  if (bist100 || usdTryE || trCds || tr10y) {
    lines.push('🇹🇷 *TÜRKİYE*');
    if (bist100) {
      const sign = bist100.changePct >= 0 ? '+' : '';
      lines.push(`${arrow(bist100.changePct)} BIST 100: ${fmt(bist100.value, 0)} (${sign}${fmt(bist100.changePct)}%)`);
    }
    if (usdTryE) {
      const sign = usdTryE.changePct >= 0 ? '+' : '';
      lines.push(`${arrow(usdTryE.changePct)} USD/TRY: ${fmt(usdTryE.value)}₺ (${sign}${fmt(usdTryE.changePct)}%)`);
    }
    if (trCds) {
      const sign = trCds.changePct >= 0 ? '+' : '';
      lines.push(`${arrow(trCds.changePct)} TR 5Y CDS: ${fmt(trCds.value)} bps (${sign}${fmt(trCds.changePct)}%)`);
    }
    if (tr10y) {
      const sign = tr10y.changePct >= 0 ? '+' : '';
      lines.push(`${arrow(tr10y.changePct)} TR 10Y Tahvil: ${fmt(tr10y.value)}% (${sign}${fmt(tr10y.changePct)}%)`);
    }
    lines.push('');
  }

  // === 2) TOP HAREKETLER (BIST gainer/loser) ===
  if (parts.bistTop.length >= 4) {
    const sorted = [...parts.bistTop].sort((a, b) => b.changePct - a.changePct);
    const gainers = sorted.slice(0, 3);
    const losers = sorted.slice(-3).reverse();
    lines.push('🔥 *TOP HAREKETLER (BIST)*');
    lines.push('🟢 _Yükselen:_');
    for (const s of gainers) {
      lines.push(`   *${s.symbol}* ${fmt(s.price)}₺ (+${fmt(s.changePct)}%)`);
    }
    lines.push('🔴 _Düşen:_');
    for (const s of losers) {
      lines.push(`   *${s.symbol}* ${fmt(s.price)}₺ (${fmt(s.changePct)}%)`);
    }
    lines.push('');
  }

  // === 3) DÖVİZ (EUR/TRY) ===
  const eurTry = find('EUR/TRY');
  if (eurTry) {
    const sign = eurTry.changePct >= 0 ? '+' : '';
    lines.push('💱 *DÖVİZ*');
    lines.push(`${arrow(eurTry.changePct)} EUR/TRY: ${fmt(eurTry.value)}₺ (${sign}${fmt(eurTry.changePct)}%)`);
    lines.push('');
  }

  // === 4) KIYMETLİ MADENLER ===
  const onsAltin = find('Altın');
  const onsGumus = find('Gümüş');
  const usdTry = usdTryE?.value;
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

  // === 5) WATCHLIST ===
  if (parts.watchlistQuotes.length > 0) {
    lines.push('👀 *WATCHLIST*');
    for (const w of parts.watchlistQuotes) {
      const sign = w.changePct >= 0 ? '+' : '';
      lines.push(`${arrow(w.changePct)} ${w.symbol}: ${fmt(w.price)}₺ (${sign}${fmt(w.changePct)}%)`);
    }
    lines.push('');
  }

  // === 6) TEFAS TOP 5 ===
  if (parts.tefasTop.length > 0) {
    lines.push('📈 *TEFAS TOP 5 (1Y)*');
    for (const f of parts.tefasTop) {
      const sign = f.year >= 0 ? '+' : '';
      const shortName = f.name.length > 35 ? f.name.slice(0, 32) + '...' : f.name;
      lines.push(`*${f.code}* ${sign}${fmt(f.year)}% — _${shortName}_`);
    }
    lines.push('');
  }

  // === 7) MAKRO RİSK + YORUM ===
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
      const trimmed = m.commentary.length > 260 ? m.commentary.slice(0, 257) + '...' : m.commentary;
      lines.push(trimmed);
    }
    lines.push('');
  }

  // === 8) TEKNİK SİNYALLER ===
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

  // === 9) HABER ===
  if (parts.news?.ok && parts.news.stories && parts.news.stories.length > 0) {
    lines.push('📰 *GÜNÜN HABERLERİ*');
    for (const s of parts.news.stories.slice(0, 3)) {
      const e = impactEmoji(s.impact);
      const syms = s.symbols.length > 0 ? ` [${s.symbols.slice(0, 3).join(',')}]` : '';
      lines.push(`${e} *${s.rank}.* ${s.title}${syms}`);
      const sum = s.summary.length > 90 ? s.summary.slice(0, 87) + '...' : s.summary;
      lines.push(`   _${sum}_`);
    }
    lines.push('');
  }

  // === 10) SENTIMENT ===
  if (parts.sentiment?.ok && parts.sentiment.items && parts.sentiment.items.length > 0) {
    const pos = parts.sentiment.items.filter((i) => i.label === 'positive').slice(0, 3);
    const neg = [...parts.sentiment.items].filter((i) => i.label === 'negative').sort((a, b) => a.score - b.score).slice(0, 3);
    if (pos.length > 0 || neg.length > 0) {
      lines.push('🗣 *SENTIMENT*');
      if (pos.length > 0) {
        const tags = pos.map((p) => `*${p.symbol}* (+${p.score.toFixed(2)})`).join(', ');
        lines.push(`🟢 ${tags}`);
      }
      if (neg.length > 0) {
        const tags = neg.map((n) => `*${n.symbol}* (${n.score.toFixed(2)})`).join(', ');
        lines.push(`🔴 ${tags}`);
      }
      lines.push('');
    }
  }

  // === 11) ABD PİYASALARI (sonda) ===
  const sp500 = find('S&P 500');
  const vix = find('VIX');
  const dxy = find('DXY');
  const tnx = find('ABD 10Y Faiz');
  const brent = find('Brent');
  if (sp500 || vix || dxy || tnx || brent) {
    lines.push('🇺🇸 *ABD / GLOBAL*');
    for (const s of [sp500, vix, dxy, tnx, brent]) {
      if (!s) continue;
      const sign = s.changePct >= 0 ? '+' : '';
      const unit = s.unit ? ` ${s.unit}` : '';
      lines.push(`${arrow(s.changePct)} ${s.label}: ${fmt(s.value)}${unit} (${sign}${fmt(s.changePct)}%)`);
    }
    lines.push('');
  }

  lines.push('🌐 Detay: hanefinans.net/panel');

  let text = lines.join('\n');
  if (text.length > 4000) text = text.slice(0, 3997) + '...';
  return text;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const origin = new URL(request.url).origin;

  // Watchlist sembollerini env'den oku
  const watchlistSymbols = (env.TELEGRAM_WATCHLIST ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  // Paralel fetch: agentlar + BIST tarama + Watchlist quotes + TEFAS
  const [macro, news, sentiment, indicator, bistQuotes, watchlistQuotes, tefasTop] = await Promise.all([
    callAgent<MacroResult>(origin, '/api/agents/macro'),
    callAgent<NewsResult>(origin, '/api/agents/news', { maxStories: 5 }),
    callAgent<SentimentResult>(origin, '/api/agents/sentiment'),
    callAgent<IndicatorResult>(origin, '/api/agents/indicator'),
    // BIST popüler için paralel quote fetch
    Promise.all(BIST_POPULAR.map(async (sym) => {
      const q = await fetchYahooQuote(origin, `${sym}.IS`);
      return q ? { symbol: sym, price: q.price, changePct: q.changePct } : null;
    })).then((arr) => arr.filter((x): x is { symbol: string; price: number; changePct: number } => x !== null)),
    // Watchlist
    Promise.all(watchlistSymbols.map(async (sym) => {
      const q = await fetchYahooQuote(origin, `${sym}.IS`);
      return q ? { symbol: sym, price: q.price, changePct: q.changePct } : null;
    })).then((arr) => arr.filter((x): x is { symbol: string; price: number; changePct: number } => x !== null)),
    // TEFAS
    fetchTefasTop5(),
  ]);

  const text = buildBriefingText({
    macro, news, sentiment, indicator,
    bistTop: bistQuotes,
    watchlistQuotes,
    tefasTop,
  });

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
