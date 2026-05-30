/**
 * Kullanıcı Telegram entegrasyonu — chat_id localStorage'da user.id ile namespace'lenir.
 *
 * GÜVENLIK NOTU (Mayıs 2026):
 *   Eski sürümde chat_id global anahtarda saklanıyordu (`fa.telegram.chatId`).
 *   Aynı tarayıcıda farklı kullanıcı login olunca önceki kullanıcının chat_id'si
 *   yeni kullanıcıya görünüyordu (cross-user kontaminasyon). Tüm bildirimler
 *   yanlış Telegram'a gidiyordu.
 *
 *   Fix: chat_id artık `fa.telegram.chatId.<userId>` formatında saklanır.
 *   Anonim (login değil) kullanıcı chat_id okuyamaz ve yazamaz.
 *   Modül yüklenince eski global anahtar otomatik temizlenir.
 */

import { useAuth } from '@/store/auth';

const LEGACY_GLOBAL_KEY = 'fa.telegram.chatId';
const USER_PREFIX = 'fa.telegram.chatId.';

// Modül yüklenir yüklenmez eski global anahtarı temizle (her sayfa açılışında)
try { localStorage.removeItem(LEGACY_GLOBAL_KEY); } catch { /* ignore */ }

/** Aktif kullanıcının user-specific localStorage anahtarını üret. */
function userKey(): string | null {
  const user = useAuth.getState().user;
  if (!user || user.id == null) return null;
  return `${USER_PREFIX}${user.id}`;
}

export function getTelegramChatId(): string | null {
  try {
    const uk = userKey();
    if (!uk) return null; // Anonim → chat_id gösterme
    const v = localStorage.getItem(uk);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setTelegramChatId(chatId: string | null): void {
  try {
    const uk = userKey();
    if (!uk) return; // Anonim → kaydetme
    if (!chatId || !chatId.trim()) {
      localStorage.removeItem(uk);
    } else {
      localStorage.setItem(uk, chatId.trim());
    }
    // Cross-user kontaminasyona karşı eski global anahtarı yine temizle
    localStorage.removeItem(LEGACY_GLOBAL_KEY);
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
 * chat_id yoksa (anonim veya henüz ayarlanmamış) sessizce skip eder.
 */
export async function sendTelegram(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<TelegramSendResult> {
  const chatId = getTelegramChatId();
  if (!chatId) return { ok: false, error: 'chat_id yapılandırılmamış (login gerekli)' };

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
