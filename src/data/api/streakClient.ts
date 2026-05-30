/**
 * Streak client — günlük ziyaret serisi.
 * Layout'tan günde 1 kez ping atar; sonuç global store'da tutulur.
 */

export interface StreakState {
  current: number;
  longest: number;
  total: number;
  isNewDay: boolean;
  brokeStreak?: boolean;
  anon?: boolean;
}

export async function pingStreak(): Promise<StreakState | null> {
  try {
    const r = await fetch('/api/streak/ping', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!r.ok) return null;
    const data = await r.json() as { ok: boolean } & StreakState;
    if (!data.ok) return null;
    return {
      current: data.current,
      longest: data.longest,
      total: data.total,
      isNewDay: data.isNewDay,
      brokeStreak: data.brokeStreak,
      anon: data.anon,
    };
  } catch {
    return null;
  }
}

/**
 * Achievement seviyesi (rozet) — streak'in temsil ettiği seviye.
 *  - 0: hiç streak yok
 *  - 1-2: 🌱 başlangıç
 *  - 3-6: 🔥 alev
 *  - 7-13: 💥 patlama
 *  - 14-29: ⚡ yıldırım
 *  - 30-99: 🚀 roket
 *  - 100+: 👑 efsane
 */
export function streakLevel(current: number): { emoji: string; label: string; color: string } {
  if (current >= 100) return { emoji: '👑', label: 'Efsane', color: 'text-warning' };
  if (current >= 30) return { emoji: '🚀', label: 'Roket', color: 'text-accent' };
  if (current >= 14) return { emoji: '⚡', label: 'Yıldırım', color: 'text-accent' };
  if (current >= 7) return { emoji: '💥', label: 'Patlama', color: 'text-warning' };
  if (current >= 3) return { emoji: '🔥', label: 'Alev', color: 'text-warning' };
  if (current >= 1) return { emoji: '🌱', label: 'Başlangıç', color: 'text-success' };
  return { emoji: '·', label: '', color: 'text-slate-500' };
}
