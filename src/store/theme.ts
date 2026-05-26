/**
 * Theme store — dark (default) / light toggle.
 * html.light class'i kullanilir (Tailwind darkMode: 'class').
 * Tercih localStorage'a persist edilir; ilk yuklemede class set edilir.
 */
import { create } from 'zustand';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'fa.theme';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* sessizce */
  }
  return 'dark';
}

function applyClass(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: readInitial(),
  setTheme: (t) => {
    applyClass(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* sessizce */
    }
    set({ theme: t });
  },
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));

/** Uygulamanin baslamasinda <html>'e mevcut tema class'ini yap. */
export function initTheme() {
  applyClass(readInitial());
}
