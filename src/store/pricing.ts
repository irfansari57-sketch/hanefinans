import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Üyelik fiyatları — admin Ayarlar sayfasından düzenlenebilir.
 * Zustand + localStorage persist; tüm fiyatlar TRY (₺).
 * MembershipPage bu store'dan okur, hardcoded değil.
 */

interface PricingState {
  proMonthly: number;     // PRO aylık (₺)
  proYearly: number;      // PRO yıllık (₺) — 12 ay × proMonthly'den farklı olabilir (indirim)
  eliteMonthly: number;   // ELITE aylık (₺)
  eliteYearly: number;    // ELITE yıllık (₺)
  setProMonthly: (v: number) => void;
  setProYearly: (v: number) => void;
  setEliteMonthly: (v: number) => void;
  setEliteYearly: (v: number) => void;
  resetToDefaults: () => void;
}

const DEFAULTS = {
  proMonthly: 99,
  proYearly: 999,
  eliteMonthly: 299,
  eliteYearly: 2999,
};

export const usePricing = create<PricingState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setProMonthly: (v) => set({ proMonthly: Math.max(0, v) }),
      setProYearly: (v) => set({ proYearly: Math.max(0, v) }),
      setEliteMonthly: (v) => set({ eliteMonthly: Math.max(0, v) }),
      setEliteYearly: (v) => set({ eliteYearly: Math.max(0, v) }),
      resetToDefaults: () => set(DEFAULTS),
    }),
    {
      name: 'fa.pricing.v1',
    },
  ),
);
