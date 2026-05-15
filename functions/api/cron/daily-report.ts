/**
 * Cloudflare Pages Function — Günlük piyasa raporu Telegram'a otomatik gönderir.
 *
 * GitHub Actions cron tarafından sabah 08:00 TR (05:00 UTC) çağrılır.
 * Auth: X-Cron-Secret header'ında CRON_SECRET env var ile eşleşmeli.
 *
 * Çalışma:
 *  1) Yahoo Finance'ten BIST 100, BIST 30, USD/TRY, EUR/TRY, Brent, gümüş, altın
 *  2) Markdown formatlı Türkçe rapor üretir
 *  3) TELEGRAM_DAILY_RECIPIENTS (virgülle ayrılmış chat ID listesi) ya da
 *     VITE_TELEGRAM_CHAT_ID (admin) — TELEGRAM_BOT_TOKEN ile her birine gönderir
 */

interface Env {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_DAILY_RECIPIENTS?: string; // virgüllü liste
  VITE_TELEGRAM_CHAT_ID?: string;
  CRON_SECRET?: string;
}

interface YahooMeta {
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
}

async function fetchYahoo(symbol: string): Promise<{ price: number; changePct: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { chart: { result?: Array<{ meta?: YahooMeta }> } };
    const meta = j.chart.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
    return {
      price: meta.regularMarketPrice,
      changePct: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
    };
  } catch {
    return null;
  }
}

function fmt(v: number, dec = 2): string {
  return v.toLocaleString('tr-TR', { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

function row(label: string, q: { price: number; changePct: number } | null, prefix = '', suffix = ''): string {
  if (!q) return `${label}: —`;
  const ar = q.changePct >= 0.05 ? '🟢' : q.changePct <= -0.05 ? '🔴' : '➡️';
  return `${ar} ${label}: ${prefix}${fmt(q.price)}${suffix} (${q.changePct >= 0 ? '+' : ''}${fmt(q.changePct)}%)`;
}

async function buildReport(): Promise<string> {
  const [bist100, bist30, usd, eur, brent, gold, silver] = await Promise.all([
    fetchYahoo('XU100.IS'),
    fetchYahoo('XU030.IS'),
    fetchYahoo('USDTRY=X'),
    fetchYahoo('EURTRY=X'),
    fetchYahoo('BZ=F'),
    fetchYahoo('GC=F'),
    fetchYahoo('SI=F'),
  ]);

  const date = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' });
  const lines: string[] = [];
  lines.push(`📊 *Günlük Piyasa Raporu*`);
  lines.push(`_${date} • 08:00_`);
  lines.push('');
  lines.push('*BORSA*');
  lines.push(row('BIST 100', bist100));
  lines.push(row('VIOP 30 (XU030)', bist30));
  lines.push('');
  lines.push('*DÖVİZ*');
  lines.push(row('USD/TRY', usd, '₺'));
  lines.push(row('EUR/TRY', eur, '₺'));
  lines.push('');
  lines.push('*EMTİA*');
  lines.push(row('Brent Petrol', brent, '$'));
  lines.push(row('Ons Altın', gold, '$'));
  lines.push(row('Ons Gümüş', silver, '$'));
  lines.push('');
  lines.push('🌐 Detaylı analiz: hanefinans.net/morning');

  return lines.join('\n');
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  // Auth: secret header
  if (!env.CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'CRON_SECRET env not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  const provided = request.headers.get('X-Cron-Secret');
  if (provided !== env.CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: 'TELEGRAM_BOT_TOKEN missing' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Alıcı listesi: TELEGRAM_DAILY_RECIPIENTS (virgüllü) + admin (VITE_TELEGRAM_CHAT_ID)
  const recipients = new Set<string>();
  if (env.TELEGRAM_DAILY_RECIPIENTS) {
    env.TELEGRAM_DAILY_RECIPIENTS.split(',').map((s) => s.trim()).filter(Boolean).forEach((id) => recipients.add(id));
  }
  if (env.VITE_TELEGRAM_CHAT_ID) recipients.add(env.VITE_TELEGRAM_CHAT_ID);
  if (recipients.size === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'No recipients configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const text = await buildReport();
  const results = await Promise.all(
    Array.from(recipients).map(async (chatId) => ({
      chatId,
      ok: await sendTelegram(env.TELEGRAM_BOT_TOKEN!, chatId, text),
    })),
  );

  const okCount = results.filter((r) => r.ok).length;
  return new Response(JSON.stringify({
    ok: okCount > 0,
    sent: okCount,
    total: results.length,
    results,
    reportPreview: text.slice(0, 200),
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
