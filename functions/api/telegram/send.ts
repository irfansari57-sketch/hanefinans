/**
 * Cloudflare Pages Function — kullanıcının Telegram'ına mesaj gönderir.
 *
 * POST /api/telegram/send
 * Body: { chatId: string, text: string, parseMode?: 'HTML' | 'Markdown' }
 *
 * TELEGRAM_BOT_TOKEN env'den okunur (Cloudflare Pages dashboard'unda set edilmeli).
 * Frontend chat_id'yi kullanıcıdan alır (Settings sayfası) ve localStorage'da tutar.
 *
 * Kullanım: fiyat alarmı tetiklendiğinde, AI analiz hazır olduğunda, vs.
 */

interface Env {
  TELEGRAM_BOT_TOKEN?: string;
}

interface SendRequest {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return json({ ok: false, error: 'TELEGRAM_BOT_TOKEN env not set' }, 503);
  }

  let body: SendRequest;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  if (!body.chatId || !body.text) {
    return json({ ok: false, error: 'chatId ve text zorunlu' }, 400);
  }

  // chat_id basit doğrulama — sayısal veya @kanalAdi
  if (!/^-?\d+$|^@[a-zA-Z0-9_]+$/.test(body.chatId.trim())) {
    return json({ ok: false, error: 'Geçersiz chat_id formatı' }, 400);
  }

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: body.chatId.trim(),
        text: body.text.slice(0, 4000),
        parse_mode: body.parseMode ?? 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const result = (await r.json()) as TelegramApiResponse;
    if (!result.ok) {
      return json({ ok: false, error: result.description ?? 'Telegram API hatası' }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}
