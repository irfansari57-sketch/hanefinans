/**
 * Türkiye piyasası için aracı kurum bültenleri.
 *
 * Sadece resmi aracı kurumlar (Osmanlı Yatırım, KT Yatırım vb.) — kişisel
 * analist hesapları burada listelenmez. Her kurum için:
 *  - Günlük bülten/strateji raporu URL'i (resmi web)
 *  - YouTube kanalı (varsa son video özeti otomatik gözükür)
 *  - X/Twitter hesabı (varsa)
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
  /** YouTube kanal handle (varsa son video gösterilir) */
  youtubeHandle?: string;
  /** YouTube kanal ID (UC...) — RSS feed için, biliniyorsa */
  youtubeChannelId?: string;
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
];

// İleride eklenebilecekler (server-side scrape için Playwright/headless browser gerek):
//   - İş Yatırım — SharePoint based, cookie/referer kontrolü
//   - Garanti BBVA Yatırım — JS-rendered SPA
//   - Halk Yatırım — JS-rendered
//   - KT Yatırım — JS-rendered (curl ile çalışıyor ama format düzensiz)
// Bu kurumlar için GH Actions'a playwright kurmak veya direkt RSS bulmak gerek.

/** YouTube linki — handle varsa direkt, yoksa kurum adı araması */
export function analystYoutubeUrl(a: Analyst): string {
  if (a.youtubeHandle) return `https://www.youtube.com/@${a.youtubeHandle}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(a.name + ' günlük bülten')}`;
}

/** Twitter/X linki */
export function analystTwitterUrl(a: Analyst): string {
  if (a.twitterHandle) return `https://x.com/${a.twitterHandle}`;
  return `https://x.com/search?q=${encodeURIComponent(a.name)}&src=typed_query&f=live`;
}
