import type { DailySnapshot } from './types';

const SNAPSHOT_KEY = 'fa.scalp.dailySnapshots.v1';
export const SNAPSHOT_MAX_DAYS = 14;

export function loadSnapshots(): DailySnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as DailySnapshot[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveSnapshots(snaps: DailySnapshot[]): void {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snaps)); } catch { /* */ }
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}
