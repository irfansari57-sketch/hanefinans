/**
 * Kullanıcı Telegram entegrasyonu — chat_id localStorage'da tutulur.
 * Fiyat alarmı tetiklendiğinde, AI analiz hazır olduğunda vs.
 * Pages Function /api/telegram/send üzerinden bot token server-side kullanılır.
 */

const STORAGE_KEY = 'fa.telegram.chatId';

export function getTelegramChatId(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setTelegramChatId(chatId: string | null): void {
  try {
    if (!chatId || !chatId.trim()) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, chatId.trim());
    }
  } catch {
    /* ignore */
  }
}

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Kullanıcının kayıtlı Telegram chat_id'sine mesaj gönderir.
 * chat_id yoksa sessizce skip eder (ok: false).
 */
export async function sendTelegram(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<TelegramSendResult> {
  const chatId = getTelegramChatId();
  if (!chatId) return { ok: false, error: 'chat_id yapılandırılmamış' };

  try {
    const r = await fetch('/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, text, parseMode }),
    });
    const j = (await r.json()) as TelegramSendResult;
    return j;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Fiyat alarmı tetiklendiğinde otomatik tetiklenecek helper. */
export async function notifyPriceAlert(symbol: string, direction: 'above' | 'below', threshold: number, currentPrice: number): Promise<void> {
  const text =
    `🔔 <b>${symbol}</b> alarmı tetiklendi\n` +
    `Hedef: ${direction === 'above' ? '≥' : '≤'} ${threshold}₺\n` +
    `Mevcut fiyat: <b>${currentPrice.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}₺</b>\n\n` +
    `<a href="https://hanefinans.net/stock/${symbol}">Detay sayfası →</a>`;
  await sendTelegram(text);
}
