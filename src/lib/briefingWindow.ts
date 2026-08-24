/**
 * Telegram brifing pencere mantığı — saf fonksiyonlar.
 *
 * Cloudflare Pages Function (daily-report.ts) ve test'ler tarafından paylaşılır.
 * GitHub Actions free-tier cron gecikmelerinde "Sabah Raporu"nun akşam gönderilmesini
 * engellemek için kullanılır.
 */

export type BriefingSession = 'morning' | 'midday' | 'evening';

/** Session ID'sini normalize et — geçersizse 'morning'. */
export function normalizeSession(raw: string | null | undefined): BriefingSession {
  if (raw === 'midday' || raw === 'evening') return raw;
  return 'morning';
}

/** Brifing kendi başlığının altına eklenecek session alt başlığı (Markdown). */
export function sessionSubtitle(session: BriefingSession): string {
  if (session === 'midday') return '🕛 _Öğle Güncellemesi_';
  if (session === 'evening') return '🌆 _Kapanış Raporu_';
  return '🌅 _Sabah Raporu_';
}

/**
 * TR saatine göre o anda hangi session beklenir?
 * Pencereler:
 *   07:00–11:59 TR → morning
 *   12:00–15:59 TR → midday
 *   16:00–21:59 TR → evening
 *   diğer saatler → null (gönderme)
 */
export function expectedSessionForTrTime(d: Date = new Date()): BriefingSession | null {
  // UTC saatini TR saatine (+3) çevir
  const trHour = (d.getUTCHours() + 3) % 24;
  if (trHour >= 7 && trHour < 12) return 'morning';
  if (trHour >= 12 && trHour < 16) return 'midday';
  if (trHour >= 16 && trHour < 22) return 'evening';
  return null;
}

/** Cron'un session'ı ile gerçek TR saati uyumlu mu? */
export function isSessionInWindow(session: BriefingSession, d: Date = new Date()): boolean {
  const expected = expectedSessionForTrTime(d);
  return expected !== null && expected === session;
}

/**
 * Brifing metnine session alt başlığı yerleştir.
 * Brifing 1. satırı '📊 *InvestliQ Brifingi*', 2. satırı tarih içeriyor;
 * subtitle 3. satıra konur. Format bozulmuşsa fallback olarak en üste prepend.
 */
export function injectSessionSubtitle(text: string, session: BriefingSession): string {
  const subtitle = sessionSubtitle(session);
  const lines = text.split('\n');
  if (lines.length >= 2 && lines[0].includes('InvestliQ Brifingi')) {
    lines.splice(2, 0, subtitle);
  } else {
    lines.unshift(subtitle);
  }
  return lines.join('\n');
}
