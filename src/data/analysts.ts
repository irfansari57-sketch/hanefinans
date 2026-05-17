/**
 * Türkiye piyasası için aracı kurum bültenleri.
 *
 * Sadece resmi aracı kurumlar — kişisel analist hesapları burada listelenmez.
 * Her kurum için günlük bülten/strateji raporu URL'i, web sayfası ve sosyal medya.
 * Tıklayan kullanıcı doğrudan kurumun bülten sayfasına gider.
 */

export interface Analyst {
  id: string;
  name: string;
  /** Kurum türü — şu an hep "Aracı Kurum" */
  affiliation: string;
  /** Kısa rol açıklaması */
  role: string;
  /** Günlük bülten / strateji raporu doğrudan sayfası */
  bulletinUrl: string;
  /** Twitter/X kullanıcı adı */
  twitterHandle?: string;
  /** Resmi web sayfası */
  websiteUrl: string;
  /** Avatar baş harfler */
  initials: string;
  /** Avatar arka plan rengi */
  colorSeed: string;
}

export const ANALYSTS: Analyst[] = [
  {
    id: 'osmanli-yatirim',
    name: 'Osmanlı Yatırım',
    affiliation: 'Aracı Kurum',
    role: 'Günlük Bülten + Strateji Raporları',
    bulletinUrl: 'https://www.osmanlimenkul.com.tr/finansal-planlama/egitim/bulten-talep',
    twitterHandle: 'osmanlimenkul',
    websiteUrl: 'https://www.osmanlimenkul.com.tr',
    initials: 'OY',
    colorSeed: '#10b981',
  },
  {
    id: 'is-yatirim',
    name: 'İş Yatırım',
    affiliation: 'Aracı Kurum',
    role: 'Sabah Stratejisi + Şirket Raporları',
    bulletinUrl: 'https://www.isyatirim.com.tr/tr-tr/analiz/Sayfalar/default.aspx',
    twitterHandle: 'IsYatirim',
    websiteUrl: 'https://www.isyatirim.com.tr',
    initials: 'İY',
    colorSeed: '#0ea5e9',
  },
  {
    id: 'garanti-bbva-yatirim',
    name: 'Garanti BBVA Yatırım',
    affiliation: 'Aracı Kurum',
    role: 'Günlük Bülten + Sektör Analizleri',
    bulletinUrl: 'https://www.garantibbvayatirim.com.tr/arastirma/gunluk-bulten',
    twitterHandle: 'garantibbvaytrm',
    websiteUrl: 'https://www.garantibbvayatirim.com.tr',
    initials: 'GY',
    colorSeed: '#22c55e',
  },
  {
    id: 'halk-yatirim',
    name: 'Halk Yatırım',
    affiliation: 'Aracı Kurum',
    role: 'Günlük Bülten + Araştırma Raporları',
    bulletinUrl: 'https://www.halkyatirim.com.tr/content/tr/arastirma',
    twitterHandle: 'halkyatirim',
    websiteUrl: 'https://www.halkyatirim.com.tr',
    initials: 'HY',
    colorSeed: '#f59e0b',
  },
  {
    id: 'ziraat-yatirim',
    name: 'Ziraat Yatırım',
    affiliation: 'Aracı Kurum',
    role: 'Günlük Bülten + Yayınlar',
    bulletinUrl: 'https://www.ziraatyatirim.com.tr/tr/arastirma/yayinlar',
    twitterHandle: 'ziraatyatirim',
    websiteUrl: 'https://www.ziraatyatirim.com.tr',
    initials: 'ZY',
    colorSeed: '#8b5cf6',
  },
  {
    id: 'kt-yatirim',
    name: 'KT Yatırım',
    affiliation: 'Aracı Kurum',
    role: 'Günlük Bülten + Sektörel Raporlar',
    bulletinUrl: 'https://kuveytturkyatirim.com.tr/arastirma-raporlari/?category=G%C3%BCnl%C3%BCk+B%C3%BClten',
    twitterHandle: 'kuveytturkytrm',
    websiteUrl: 'https://kuveytturkyatirim.com.tr',
    initials: 'KT',
    colorSeed: '#ec4899',
  },
];

/** Twitter/X linki */
export function analystTwitterUrl(a: Analyst): string {
  if (a.twitterHandle) return `https://x.com/${a.twitterHandle}`;
  return `https://x.com/search?q=${encodeURIComponent(a.name)}&src=typed_query&f=live`;
}
