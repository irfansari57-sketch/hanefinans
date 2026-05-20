/**
 * Cloudflare Pages Function — Günlük piyasa raporu Telegram'a otomatik gönderir.
 *
 * GitHub Actions cron tarafından sabah 08:00 TR (05:00 UTC) çağrılır.
 * Auth: X-Cron-Secret header'ında CRON_SECRET env var ile eşleşmeli.
 *
 * v2: Mevcut /api/agents/briefing endpoint'ini çağırır — 4 ajan (macro+news+sentiment+indicator)
 * birleşik bir Markdown brifing üretir. Bu brifing Telegram'a yollanir.
 */

interface Env {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_DAILY_RECIPIENTS?: string;
  VITE_TELEGRAM_CHAT_ID?: string;
  CRON_SECRET?: string;
}

interface BriefingPayload {
  ok: boolean;
  text?: string;
  generatedAt?: string;
}

async function fetchBriefing(origin: string): Promise<string | null> {
  try {
    const r = await fetch(`${origin}/api/agents/briefing`, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as BriefingPayload;
    return j.ok && j.text ? j.text : null;
  } catch {
    return null;
  }
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

  // Briefing endpoint'ini çağır
  const origin = new URL(request.url).origin;
  const text = await fetchBriefing(origin);
  if (!text) {
    return new Response(JSON.stringify({ ok: false, error: 'Briefing endpoint cevap vermedi' }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }

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
