/**
 * Yoğunluk store — Design 03 "Katman" (15 Eki 2026).
 * Tek tercih, tüm tablolar/çipler: html[data-density] → CSS değişkenleri
 * (--row-h, --table-fs, --chip-h; bkz. index.css). Kalıcı: localStorage.
 *   compact     32px satır, 12px  — profesyonel
 *   standard    40px satır, 13px  — varsayılan desktop
 *   comfortable 48px satır, 14px  — varsayılan mobil (<768)
 */
import { create } from 'zustand';

export type Density = 'compact' | 'standard' | 'comfortable';
const KEY = 'iq.density';

export const DENSITY_LABELS: Record<Density, string> = {
  compact: 'Yoğun',
  standard: 'Standart',
  comfortable: 'Sade',
};

function readInitial(): Density {
  if (typeof window === 'undefined') return 'standard';
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'compact' || s === 'standard' || s === 'comfortable') return s;
  } catch { /* */ }
  return window.matchMedia?.('(max-width: 767px)').matches ? 'comfortable' : 'standard';
}

function apply(d: Density) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-density', d);
}

interface DensityState {
  density: Density;
  setDensity: (d: Density) => void;
}

export const useDensity = create<DensityState>((set) => ({
  density: readInitial(),
  setDensity: (d) => {
    apply(d);
    try { localStorage.setItem(KEY, d); } catch { /* */ }
    set({ density: d });
  },
}));

export function initDensity() {
  apply(readInitial());
}
