/**
 * Türkiye piyasası için saygın aracı kurum analistleri ve bağımsız yorumcular.
 *
 * Her analist için: kimlik, kurum, sosyal hesaplar.
 * YouTube son video / Twitter son tweet entegrasyonu sonra eklenir (RSS feed).
 *
 * Liste manuel maintain edilir; yeni analist eklemek için diziye entry ekle.
 */

export interface Analyst {
  id: string;
  name: string;
  /** Çalıştığı kurum (Osmanlı Yatırım, KT Yatırım vs.) veya 'Bağımsız' */
  affiliation: string;
  /** Kısa rol açıklaması — "Borsa Stratejisti", "Teknik Analist", "Ekonomist" */
  role: string;
  /** YouTube kanal handle (@hanemodstudio benzeri) — boş ise YouTube search */
  youtubeHandle?: string;
  /** YouTube kanal ID (UC...) — RSS feed için, biliniyorsa */
  youtubeChannelId?: string;
  /** Twitter/X kullanıcı adı (başında @ yok) */
  twitterHandle?: string;
  /** Aracı kurum web sayfası */
  websiteUrl?: string;
  /** Avatar — şimdilik baş harflerden generate, ileride foto eklenebilir */
  initials: string;
  /** Renk seed — avatar arka planı için */
  colorSeed: string;
}

export const ANALYSTS: Analyst[] = [
  {
    id: 'osmanli-yatirim',
    name: 'Osmanlı Yatırım',
    affiliation: 'Aracı Kurum',
    role: 'Günlük Bülten + Strateji Raporları',
    twitterHandle: 'osmanliyatirim',
    websiteUrl: 'https://www.osmanliyatirim.com.tr',
    initials: 'OY',
    colorSeed: '#10b981',
  },
  {
    id: 'kt-yatirim',
    name: 'KT Yatırım',
    affiliation: 'Aracı Kurum',
    role: 'Günlük Bülten + Sektörel Raporlar',
    twitterHandle: 'KTYatirim',
    websiteUrl: 'https://www.ktyatirim.com.tr',
    initials: 'KT',
    colorSeed: '#0ea5e9',
  },
  {
    id: 'selcuk-gonenc',
    name: 'Selçuk Gönenç',
    affiliation: 'Bağımsız Analist',
    role: 'Borsa Stratejisti',
    youtubeHandle: 'selcukgonenc',
    twitterHandle: 'SelcukGonenc',
    initials: 'SG',
    colorSeed: '#f59e0b',
  },
  {
    id: 'tuncay-tursucu',
    name: 'Tuncay Turşucu',
    affiliation: 'Bağımsız Analist',
    role: 'Borsa & Türev Piyasaları',
    youtubeHandle: 'tuncayturşucu',
    twitterHandle: 'tuncaytursucu',
    initials: 'TT',
    colorSeed: '#ef4444',
  },
  {
    id: 'kadir-tumok',
    name: 'Kadir Tümok',
    affiliation: 'Bağımsız Analist',
    role: 'Borsa Yorumcusu',
    youtubeHandle: 'kadirtumok',
    twitterHandle: 'kadirtumok',
    initials: 'KT',
    colorSeed: '#8b5cf6',
  },
  {
    id: 'kadir-ozdamar',
    name: 'Kadir Özdamar',
    affiliation: 'Bağımsız Analist',
    role: 'Borsa Yorumcusu',
    youtubeHandle: 'kadirozdamar',
    twitterHandle: 'kadirozdamar',
    initials: 'KÖ',
    colorSeed: '#ec4899',
  },
  {
    id: 'taner-genek',
    name: 'Taner Genek',
    affiliation: 'Bağımsız Analist',
    role: 'Ekonomist & Piyasa Yorumcusu',
    youtubeHandle: 'tanergenek',
    twitterHandle: 'tanergenek',
    initials: 'TG',
    colorSeed: '#22d3ee',
  },
];

/** Analist için YouTube linki üret — handle varsa direkt, yoksa isim aratması */
export function analystYoutubeUrl(a: Analyst): string {
  if (a.youtubeHandle) return `https://www.youtube.com/@${a.youtubeHandle}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(a.name + ' borsa analiz')}`;
}

/** Twitter/X linki üret */
export function analystTwitterUrl(a: Analyst): string {
  if (a.twitterHandle) return `https://x.com/${a.twitterHandle}`;
  return `https://x.com/search?q=${encodeURIComponent(a.name + ' borsa')}&src=typed_query&f=live`;
}
