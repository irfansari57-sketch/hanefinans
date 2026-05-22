import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Site geneli görünürlük ayarları — admin Ayarlar sayfasından düzenlenebilir.
 *
 * Zustand + localStorage persist; usePricing ile aynı pattern.
 *
 * Şu an yönetilen alanlar:
 *  - adBannerEnabled: Panel/Günlük Analiz üstündeki + sidebar/mobil alt
 *    "Sponsor" reklam banner'ı görünür mü (default: false — şimdilik kapalı).
 *    YouTube sponsoru (HaneModAdBanner) bu flag'ten bağımsız çalışmaya
 *    devam eder; admin sadece üçüncü-parti reklam alanını kontrol eder.
 */

interface SiteSettingsState {
  /** AdBanner (genel sponsor reklam) global görünürlüğü. */
  adBannerEnabled: boolean;
  setAdBannerEnabled: (v: boolean) => void;
  resetToDefaults: () => void;
}

const DEFAULTS: Omit<SiteSettingsState, 'setAdBannerEnabled' | 'resetToDefaults'> = {
  adBannerEnabled: false,
};

export const useSiteSettings = create<SiteSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setAdBannerEnabled: (v) => set({ adBannerEnabled: !!v }),
      resetToDefaults: () => set(DEFAULTS),
    }),
    {
      name: 'fa.siteSettings.v1',
    },
  ),
);
