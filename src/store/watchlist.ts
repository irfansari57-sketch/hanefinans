import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { activityRepo } from '@/data/repositories';

interface WatchlistState {
  symbols: string[];
  add: (symbol: string) => void;
  remove: (symbol: string) => void;
  toggle: (symbol: string) => boolean;
  reorder: (next: string[]) => void;
  has: (symbol: string) => boolean;
}

const DEFAULT_WATCHLIST = ['THYAO', 'ASELS', 'GARAN', 'SISE', 'KCHOL'];

export const useWatchlist = create<WatchlistState>()(
  persist(
    (set, get) => ({
      symbols: DEFAULT_WATCHLIST,
      add: (symbol) => {
        const s = symbol.trim().toUpperCase();
        if (!s || get().symbols.includes(s)) return;
        set({ symbols: [...get().symbols, s] });
        activityRepo.log({ type: 'watchlist-add', symbol: s }).catch(() => {});
      },
      remove: (symbol) => {
        const s = symbol.trim().toUpperCase();
        if (!get().symbols.includes(s)) return;
        set({ symbols: get().symbols.filter((x) => x !== s) });
        activityRepo.log({ type: 'watchlist-remove', symbol: s }).catch(() => {});
      },
      toggle: (symbol) => {
        const s = symbol.trim().toUpperCase();
        if (!s) return false;
        const exists = get().symbols.includes(s);
        if (exists) {
          set({ symbols: get().symbols.filter((x) => x !== s) });
          activityRepo.log({ type: 'watchlist-remove', symbol: s }).catch(() => {});
          return false;
        }
        set({ symbols: [...get().symbols, s] });
        activityRepo.log({ type: 'watchlist-add', symbol: s }).catch(() => {});
        return true;
      },
      reorder: (next) => set({ symbols: [...next] }),
      has: (symbol) => get().symbols.includes(symbol.trim().toUpperCase()),
    }),
    {
      name: 'fa.watchlist.v1',
    },
  ),
);
