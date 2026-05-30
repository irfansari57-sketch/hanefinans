/**
 * Cloudflare Pages Function — Kullanıcı geri bildirimi alır, admin Telegram'a yollar.
 *
 * POST /api/feedback
 * Body: { message, email?, page? }
 */

interface Env {
  TELEGRAM_BOT_TOKEN?: string;
  VITE_TELEGRAM_CHAT_ID?: string;
}

interface FeedbackRequest {
  message: string;
  email?: string;
  page?: string;
  userAgent?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: FeedbackRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.message || body.message.trim().length < 5) {
    return new Response(JSON.stringify({ ok: false, error: 'Mesaj en az 5 karakter olmalı' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Telegram admin'e yolla
  if (env.TELEGRAM_BOT_TOKEN && env.VITE_TELEGRAM_CHAT_ID) {
    const text = `📩 *Yeni Geri Bildirim*

${body.email ? `*Email:* ${body.email}\n` : ''}*Sayfa:* ${body.page || '—'}
${body.userAgent ? `*Tarayıcı:* ${body.userAgent.slice(0, 80)}\n` : ''}

*Mesaj:*
${body.message.slice(0, 1500)}`;

    try {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.VITE_TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });
    } catch {
      // Telegram başarısız olsa bile feedback alındı sayılır
    }
  }

  return new Response(JSON.stringify({ ok: true, message: 'Geri bildirimin alındı, teşekkürler!' }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
