/**
 * Ekonomik takvim event hatirlaticilari.
 *
 * Client-side: localStorage'a {eventId, triggerAt, title, time} kaydedilir.
 * Layout/Watcher component periyodik kontrol eder; trigger zamani geldiginde
 * Notification API ile bildirim gosterir + uyari sayaci artirir.
 *
 * Backend push entegrasyonu sonraki adim — su an icin tarayici acikken calisir.
 */

const STORAGE_KEY = 'fa.calendarReminders';
const LEAD_TIME_MS = 60 * 60 * 1000;  // 1 saat once

export interface CalendarReminder {
  eventId: string;
  eventTitle: string;
  eventDate: string;          // ISO YYYY-MM-DD
  eventTime?: string;         // HH:mm Istanbul
  triggerAt: number;          // epoch ms
  createdAt: number;
  fired?: boolean;
}

/** Bir olayin olacağı zamanı epoch ms olarak hesapla. */
export function eventEpoch(date: string, time?: string): number {
  // time yoksa o gunun 10:00 saatini varsay (TR is saati)
  const t = time ?? '10:00';
  const isoLocal = `${date}T${t}:00+03:00`;  // Istanbul
  return Date.parse(isoLocal);
}

export function loadReminders(): CalendarReminder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as CalendarReminder[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveReminders(list: CalendarReminder[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

/** Belirli olay icin hatirlaci var mi? */
export function hasReminder(eventId: string): boolean {
  return loadReminders().some((r) => r.eventId === eventId && !r.fired);
}

/** Hatirlaci ekle (1 saat once). Geri donusu: ekleme basarili mi. */
export function addReminder(opts: {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventTime?: string;
}): { ok: true; reminder: CalendarReminder } | { ok: false; reason: string } {
  const eventMs = eventEpoch(opts.eventDate, opts.eventTime);
  if (Number.isNaN(eventMs)) return { ok: false, reason: 'Gecersiz tarih' };
  const triggerAt = eventMs - LEAD_TIME_MS;
  if (triggerAt < Date.now()) {
    return { ok: false, reason: 'Olay icin son 1 saat icindeyiz veya gectik' };
  }
  const reminders = loadReminders();
  if (reminders.some((r) => r.eventId === opts.eventId)) {
    return { ok: false, reason: 'Bu olay icin zaten hatirlatici var' };
  }
  const reminder: CalendarReminder = {
    eventId: opts.eventId,
    eventTitle: opts.eventTitle,
    eventDate: opts.eventDate,
    eventTime: opts.eventTime,
    triggerAt,
    createdAt: Date.now(),
  };
  saveReminders([...reminders, reminder]);
  return { ok: true, reminder };
}

export function removeReminder(eventId: string): void {
  saveReminders(loadReminders().filter((r) => r.eventId !== eventId));
}

/** Tetik zamani gelen ve henuz firelanmamis hatirlaticilari fire et. */
export async function tickReminders(): Promise<void> {
  const reminders = loadReminders();
  const now = Date.now();
  let changed = false;
  for (const r of reminders) {
    if (r.fired) continue;
    if (now < r.triggerAt) continue;
    if (now > r.triggerAt + 6 * 60 * 60 * 1000) {
      // 6 saat gecmis — zaten kacti, sadece fired olarak isaretle
      r.fired = true;
      changed = true;
      continue;
    }
    // Notification API ile bildirim
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification('Ekonomik Takvim Hatirlaticisi', {
            body: `${r.eventTitle} — 1 saat icinde aciklanacak (${r.eventTime ?? ''})`,
            icon: '/icon.svg',
            tag: `calendar-${r.eventId}`,
          });
        }
      }
    } catch { /* notification gosterilmedi — sessizce gec */ }
    r.fired = true;
    changed = true;
  }
  if (changed) saveReminders(reminders);
}

/** Notification permission iste. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}
