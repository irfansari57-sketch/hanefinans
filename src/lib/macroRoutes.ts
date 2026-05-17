/**
 * Macro/endeks kart anahtarlarını detay sayfası route'larına çevirir.
 * Tüm panel/morning report kartlarında ortak kullanılır.
 *
 * BIST 100/30 için /stock/SYM yönlendirir (Yahoo XU100.IS / XU030.IS).
 * Döviz → /doviz, emtia → /emtia (Yahoo futures), VIX → /global.
 * Politika Faizi gibi link uygulanamayan key'ler null döner.
 */

export function macroKeyToRoute(key: string): string | null {
  // Endeksler — StockDetailPage Yahoo XU100.IS / XU030.IS quote'unu çeker
  if (key === 'BIST 100') return '/stock/XU100';
  if (key === 'BIST 30') return '/stock/XU030';

  // Döviz — ForexDetailPage
  if (key === 'USD/TRY') return '/doviz/USDTRY';
  if (key === 'EUR/TRY') return '/doviz/EURTRY';

  // Emtia — CommodityDetailPage (Yahoo futures sembolleri)
  if (key === 'Brent') return `/emtia/${encodeURIComponent('BZ=F')}`;
  if (key === 'Gram Altın' || key === 'Ons Altın') return `/emtia/${encodeURIComponent('GC=F')}`;
  if (key === 'Gram Gümüş' || key === 'Ons Gümüş') return `/emtia/${encodeURIComponent('SI=F')}`;
  if (key === 'Gram Platin' || key === 'Ons Platin') return `/emtia/${encodeURIComponent('PL=F')}`;

  // VIX — Global sayfada gösterilir, oraya yönlendir
  if (key === 'VIX') return '/global';

  // Politika Faizi, CDS gibi link uygulanamayan
  return null;
}

/** Yahoo sembolünden detay route — Multi-TF kartlarda kullanılır (MorningReport) */
export function yahooSymbolToRoute(yahooSym: string): string {
  if (yahooSym === 'XU100.IS') return '/stock/XU100';
  if (yahooSym === 'XU030.IS') return '/stock/XU030';
  if (yahooSym === 'BZ=F') return `/emtia/${encodeURIComponent('BZ=F')}`;
  if (yahooSym === 'GC=F') return `/emtia/${encodeURIComponent('GC=F')}`;
  if (yahooSym === 'SI=F') return `/emtia/${encodeURIComponent('SI=F')}`;
  if (yahooSym === 'PL=F') return `/emtia/${encodeURIComponent('PL=F')}`;
  if (yahooSym === 'USDTRY=X') return '/doviz/USDTRY';
  if (yahooSym === 'EURTRY=X') return '/doviz/EURTRY';
  if (yahooSym.endsWith('-USD')) {
    const sym = yahooSym.replace('-USD', '');
    return `/crypto/${sym}`;
  }
  if (yahooSym.endsWith('.IS')) {
    const sym = yahooSym.replace('.IS', '');
    return `/stock/${sym}`;
  }
  // Default: stock detayına gönder
  return `/stock/${yahooSym}`;
}
