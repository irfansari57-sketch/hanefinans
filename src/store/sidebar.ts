/**
 * Sol menü açık/kapalı — Design 03 ikon rayı (15 Eki 2026).
 * Kapalı: 64px, yalnız ikonlar (tooltip ile etiket). Açık: 256px.
 * Varsayılan: 1536px (2xl) altında kapalı, üstünde açık; kullanıcı bir kez
 * değiştirince tercih kalıcı (localStorage).
 */
import { create } from 'zustand';

const KEY = 'iq.sidebar';

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'open') return false;
    if (s === 'closed') return true;
  } catch { /* */ }
  return window.innerWidth < 1536;
}

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
  set: (collapsed: boolean) => void;
}

export const useSidebar = create<SidebarState>((set, get) => ({
  collapsed: readInitial(),
  set: (collapsed) => {
    try { localStorage.setItem(KEY, collapsed ? 'closed' : 'open'); } catch { /* */ }
    set({ collapsed });
  },
  toggle: () => get().set(!get().collapsed),
}));
