/**
 * Streak global store — günlük seri sayacı + last ping cache.
 *
 * Layout mount'unda günde 1 kez ping atar; sonuç burada tutulur.
 * Sidebar / Header bu store'dan dinler.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { pingStreak, type StreakState } from '@/data/api/streakClient';

interface StreakStore extends StreakState {
  /** Son başarılı ping'in unix ms zamanı (cache TTL kontrolü). */
  lastPingMs: number;
  /** Bugün ping atıldı mı (kullanıcı state'e göre). */
  pingedToday: () => boolean;
  /** Günde 1 kez ping at — idempotent. */
  refreshIfNeeded: () => Promise<void>;
  /** Manuel refresh (logout/login sonrası). */
  refresh: () => Promise<void>;
  /** Logout'ta sıfırla. */
  reset: () => void;
}

const initialState: StreakState & { lastPingMs: number } = {
  current: 0,
  longest: 0,
  total: 0,
  isNewDay: false,
  lastPingMs: 0,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const useStreak = create<StreakStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      pingedToday: () => {
        const ms = get().lastPingMs;
        if (!ms) return false;
        // Aynı takvim günü mü (Europe/Istanbul ~ UTC+3 yaklaşık)
        const istOffset = 3 * 60 * 60 * 1000;
        const today = Math.floor((Date.now() + istOffset) / DAY_MS);
        const lastDay = Math.floor((ms + istOffset) / DAY_MS);
        return today === lastDay;
      },
      refreshIfNeeded: async () => {
        if (get().pingedToday()) return;
        await get().refresh();
      },
      refresh: async () => {
        const r = await pingStreak();
        if (r) {
          set({
            current: r.current,
            longest: r.longest,
            total: r.total,
            isNewDay: r.isNewDay,
            brokeStreak: r.brokeStreak,
            anon: r.anon,
            lastPingMs: Date.now(),
          });
        }
      },
      reset: () => set({ ...initialState }),
    }),
    {
      name: 'fa.streak.v1',
      partialize: (s) => ({
        current: s.current,
        longest: s.longest,
        total: s.total,
        lastPingMs: s.lastPingMs,
      }),
    },
  ),
);
