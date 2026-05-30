/**
 * Push bildirim tercihleri — kullanıcı bazlı (localStorage).
 *
 * İki ayrı kategori:
 *  - pushAlerts: fiyat alarmları (varsayılan: açık)
 *  - pushNews: son dakika haberleri (varsayılan: kapalı — patlamayı önle)
 *
 * Anahtarlar `fa.push.<kind>.<userId>` formatında saklanır (PinnableAccordion'la
 * aynı namespace pattern). userId yoksa 'anon'.
 */

import { useAuth } from '@/store/auth';

export type PushPrefKind = 'alerts' | 'news';

function key(kind: PushPrefKind, userId: string | number | null | undefined): string {
  return `fa.push.${kind}.${userId ?? 'anon'}`;
}

const DEFAULTS: Record<PushPrefKind, boolean> = {
  alerts: true,
  news: false,
};

function read(kind: PushPrefKind, userId: string | number | null | undefined): boolean {
  try {
    const v = localStorage.getItem(key(kind, userId));
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* */ }
  return DEFAULTS[kind];
}

function write(kind: PushPrefKind, userId: string | number | null | undefined, value: boolean): void {
  try {
    localStorage.setItem(key(kind, userId), value ? '1' : '0');
  } catch { /* */ }
}

/**
 * React dışı (anlık) okuma — Watcher'lar tarafından kullanılır.
 * Aktif kullanıcı id'sini auth store'dan alır.
 */
export function isPushPrefEnabled(kind: PushPrefKind): boolean {
  const userId = useAuth.getState().user?.id ?? 'anon';
  return read(kind, userId);
}

/** Kullanıcı id'si bilinen durumda — Settings UI tarafından. */
export function getPushPref(kind: PushPrefKind, userId: string | number | null | undefined): boolean {
  return read(kind, userId);
}

/** Tercihi kaydet — Settings UI tarafından. */
export function setPushPref(kind: PushPrefKind, userId: string | number | null | undefined, value: boolean): void {
  write(kind, userId, value);
}
