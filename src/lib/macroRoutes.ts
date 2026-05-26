/**
 * Macro/endeks kart anahtarlarini detay sayfasi route'larina cevirir.
 */

export function macroKeyToRoute(key: string): string | null {
  if (key === 'BIST 100') return '/stock/XU100';
  if (key === 'BIST 30') return '/stock/XU030';

  if (key === 'USD/TRY') return '/doviz/USDTRY';
  if (key === 'EUR/TRY') return '/doviz/EURTRY';

  // Emtia — CommodityDetailPage. Gram TL kartlari `?u=gram` query ile gider.
  // Kiymetli madenler spot sembollerine (=X) yonlendirilir, panel ile ayni veri.
  if (key === 'Brent') return `/emtia/${encodeURIComponent('BZ=F')}`;
  if (key === 'Gram Altın') return `/emtia/${encodeURIComponent('XAUUSD=X')}?u=gram`;
  if (key === 'Ons Altın') return `/emtia/${encodeURIComponent('XAUUSD=X')}`;
  if (key === 'Gram Gümüş') return `/emtia/${encodeURIComponent('XAGUSD=X')}?u=gram`;
  if (key === 'Ons Gümüş') return `/emtia/${encodeURIComponent('XAGUSD=X')}`;
  if (key === 'Gram Platin') return `/emtia/${encodeURIComponent('XPTUSD=X')}?u=gram`;
  if (key === 'Ons Platin') return `/emtia/${encodeURIComponent('XPTUSD=X')}`;

  if (key === 'VIX') return '/global';

  if (key === 'BTC/USD') return '/crypto/BTC';
  if (key === 'ETH/USD') return '/crypto/ETH';
  if (key === 'XRP/USD') return '/crypto/XRP';
  if (key === 'DOGE/USD') return '/crypto/DOGE';

  return null;
}

export function yahooSymbolToRoute(yahooSym: string): string {
  if (yahooSym === 'XU100.IS') return '/stock/XU100';
  if (yahooSym === 'XU030.IS') return '/stock/XU030';
  if (yahooSym === 'BZ=F') return `/emtia/${encodeURIComponent('BZ=F')}`;
  if (yahooSym === 'GC=F' || yahooSym === 'XAUUSD=X') return `/emtia/${encodeURIComponent('XAUUSD=X')}`;
  if (yahooSym === 'SI=F' || yahooSym === 'XAGUSD=X') return `/emtia/${encodeURIComponent('XAGUSD=X')}`;
  if (yahooSym === 'PL=F' || yahooSym === 'XPTUSD=X') return `/emtia/${encodeURIComponent('XPTUSD=X')}`;
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
  return `/stock/${yahooSym}`;
}
