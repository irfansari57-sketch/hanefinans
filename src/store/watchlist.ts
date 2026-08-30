import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { activityRepo } from '@/data/repositories';
import { track } from '@/lib/telemetry';
import {
  cloudAddWatch,
  cloudRemoveWatch,
  cloudFetchWatchlist,
  cloudReplaceWatchlist,
} from '@/data/watchlistSync';

/**
 * Zustand watchlist store — D1 sync entegrasyonlu.
 *
 * DAVRANIS:
 *  - Anonim: sadece localStorage (fa.watchlist.v1). Cloud API'ye deginmez.
 *  - Login sonrasi: syncFromCloud() cloud snapshot ile store'u tazeler.
 *    add/remove -> Optimistic UI (store hemen guncellenir) + fire-and-forget
 *    cloud POST/DELETE. Basarisiz olursa toast/rollback yok (basit izlem).
 *
 * Migration: ilk login'de useAuth effect'i migrateToCloud() cagirir —
 * eger cloud bos + local doluysa localStorage listesi cloud'a POST replace.
 */

interface WatchlistState {
  symbols: string[];
  /** True ise cloud sync aktif (login). False iken sadece localStorage. */
  cloudEnabled: boolean;
  add: (symbol: string) => void;
  remove: (symbol: string) => void;
  toggle: (symbol: string) => boolean;
  reorder: (next: string[]) => void;
  has: (symbol: string) => boolean;
  /** Layout auth effect'inde cagirilir — cloudEnabled ac/kapa + snapshot cek. */
  syncFromCloud: () => Promise<void>;
  /** Ilk login'de local -> cloud migrate. Cloud dolu ise idempotent (skip). */
  migrateToCloud: () => Promise<void>;
  /** Login cikinca cloud'u kapat — bir sonraki login'e kadar sadece local. */
  disableCloud: () => void;
}

const DEFAULT_WATCHLIST = ['THYAO', 'ASELS', 'GARAN', 'SISE', 'KCHOL'];

export const useWatchlist = create<WatchlistState>()(
  persist(
    (set, get) => ({
      symbols: DEFAULT_WATCHLIST,
      cloudEnabled: false,
      add: (symbol) => {
        const s = symbol.trim().toUpperCase();
        if (!s || get().symbols.includes(s)) return;
        set({ symbols: [...get().symbols, s] });
        activityRepo.log({ type: 'watchlist-add', symbol: s }).catch(() => {});
        track('watchlist.add', { symbol: s });
        // Cloud sync (fire-and-forget) — sadece login iken
        if (get().cloudEnabled) {
          cloudAddWatch(s).catch(() => {});
        }
      },
      remove: (symbol) => {
        const s = symbol.trim().toUpperCase();
        if (!get().symbols.includes(s)) return;
        set({ symbols: get().symbols.filter((x) => x !== s) });
        activityRepo.log({ type: 'watchlist-remove', symbol: s }).catch(() => {});
        track('watchlist.remove', { symbol: s });
        if (get().cloudEnabled) {
          cloudRemoveWatch(s).catch(() => {});
        }
      },
      toggle: (symbol) => {
        const s = symbol.trim().toUpperCase();
        if (!s) return false;
        const exists = get().symbols.includes(s);
        if (exists) {
          set({ symbols: get().symbols.filter((x) => x !== s) });
          activityRepo.log({ type: 'watchlist-remove', symbol: s }).catch(() => {});
          track('watchlist.remove', { symbol: s });
          if (get().cloudEnabled) cloudRemoveWatch(s).catch(() => {});
          return false;
        }
        set({ symbols: [...get().symbols, s] });
        activityRepo.log({ type: 'watchlist-add', symbol: s }).catch(() => {});
        track('watchlist.add', { symbol: s });
        if (get().cloudEnabled) cloudAddWatch(s).catch(() => {});
        return true;
      },
      reorder: (next) => {
        set({ symbols: [...next] });
        // Reorder cloud'a replace olarak flush edilir (position kolonu icin)
        if (get().cloudEnabled) {
          cloudReplaceWatchlist([...next]).catch(() => {});
        }
      },
      has: (symbol) => get().symbols.includes(symbol.trim().toUpperCase()),

      // ---- Cloud sync (Layout auth effect'inde tetiklenir) ----
      syncFromCloud: async () => {
        set({ cloudEnabled: true });
        const cloud = await cloudFetchWatchlist();
        if (cloud.length === 0) return; // Cloud bos — local'i koru (migrate ayri call)
        const cloudSymbols = cloud
          .sort((a, b) => a.position - b.position || a.added_at - b.added_at)
          .map((c) => c.symbol);
        set({ symbols: cloudSymbols });
      },
      migrateToCloud: async () => {
        const cloud = await cloudFetchWatchlist();
        if (cloud.length > 0) return; // Cloud dolu — migrate atla (cloud authoritative)
        const local = get().symbols;
        if (local.length === 0) return;
        await cloudReplaceWatchlist(local);
      },
      disableCloud: () => {
        set({ cloudEnabled: false });
      },
    }),
    {
      name: 'fa.watchlist.v1',
      // cloudEnabled persist edilmesin — her session baslangicinda auth'a gore hesaplansin
      partialize: (state) => ({ symbols: state.symbols }),
    },
  ),
);
