// Hane Finans — Telegram bildirim gönderici
// Çağrı: invoke('telegram-send', { text: 'metin', parseMode?: 'Markdown' | 'HTML' })
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
//
// chat_id alma:
//   1) Telegram'da kendi botunla bir kez konuş ("/start")
//   2) Tarayıcıda: https://api.telegram.org/bot<TOKEN>/getUpdates
//   3) Yanıttaki "chat":{"id":12345} değeri senin chat_id'in

import { handleCors, jsonResponse } from '../_shared/cors.ts';

interface SendBody {
  text: string;
  parseMode?: 'Markdown' | 'HTML';
  disableWebPagePreview?: boolean;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token) return jsonResponse({ error: 'TELEGRAM_BOT_TOKEN tanımlı değil' }, 500);
  if (!chatId) return jsonResponse({ error: 'TELEGRAM_CHAT_ID tanımlı değil' }, 500);

  const body = (await req.json().catch(() => ({}))) as SendBody;
  if (!body.text) return jsonResponse({ error: 'text gerekli' }, 400);

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const params = new URLSearchParams({
    chat_id: chatId,
    text: body.text,
  });
  if (body.parseMode) params.set('parse_mode', body.parseMode);
  if (body.disableWebPagePreview) params.set('disable_web_page_preview', 'true');

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!r.ok) {
    const errText = await r.text();
    return jsonResponse({ error: `Telegram hatası: ${errText}` }, 502);
  }

  const j = await r.json();
  return jsonResponse({ ok: true, telegram: j });
});
