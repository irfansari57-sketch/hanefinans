// Telegram Bot API — Vite dev proxy üzerinden (token frontend'te görünmez).
// Proxy: /api/telegram/* → https://api.telegram.org/bot<TOKEN>/*

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const CHAT_ID = (env.VITE_TELEGRAM_CHAT_ID ?? '').trim();

export const isTelegramConfigured = () => !!CHAT_ID;

export async function sendTelegramMessage(
  text: string,
  opts: { parseMode?: 'Markdown' | 'HTML'; silent?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  if (!CHAT_ID) return { ok: false, error: 'TELEGRAM_CHAT_ID tanımlı değil' };

  const body = new URLSearchParams({ chat_id: CHAT_ID, text });
  if (opts.parseMode) body.set('parse_mode', opts.parseMode);
  if (opts.silent) body.set('disable_notification', 'true');

  try {
    const r = await fetch('/api/telegram/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!r.ok) {
      const txt = await r.text();
      return { ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 200)}` };
    }
    const j = (await r.json()) as { ok: boolean; description?: string };
    return j.ok ? { ok: true } : { ok: false, error: j.description ?? 'Bilinmeyen Telegram hatası' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
