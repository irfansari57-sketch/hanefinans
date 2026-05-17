// Döviz kurları metadata + Yahoo Finance sembol eşleştirmesi.
// /doviz ve /doviz/:symbol rotaları bunu kullanır.

export interface ForexMeta {
  /** App içi sembol (URL-safe, örn. USDTRY) */
  symbol: string;
  /** Görünüm etiketi (örn. USD/TRY) */
  label: string;
  /** Açıklayıcı isim */
  name: string;
  /** Yahoo Finance sembolü (örn. USDTRY=X, EURUSD=X) */
  yahoo: string;
  /** Kategori — TRY pariteleri ayrı grup, çapraz kurlar ayrı */
  group: 'TRY' | 'MAJOR' | 'INDEX';
  /** Bayrak/sembol emoji (visual cue) */
  flag?: string;
}

export const FOREX_SYMBOLS: ForexMeta[] = [
  // TRY pariteleri (Türk Lirasına karşı)
  { symbol: 'USDTRY', label: 'USD/TRY', name: 'ABD Doları / Türk Lirası',     yahoo: 'USDTRY=X', group: 'TRY', flag: '🇺🇸' },
  { symbol: 'EURTRY', label: 'EUR/TRY', name: 'Euro / Türk Lirası',           yahoo: 'EURTRY=X', group: 'TRY', flag: '🇪🇺' },
  { symbol: 'GBPTRY', label: 'GBP/TRY', name: 'İngiliz Sterlini / Türk Lirası', yahoo: 'GBPTRY=X', group: 'TRY', flag: '🇬🇧' },
  { symbol: 'CHFTRY', label: 'CHF/TRY', name: 'İsviçre Frangı / Türk Lirası', yahoo: 'CHFTRY=X', group: 'TRY', flag: '🇨🇭' },
  { symbol: 'JPYTRY', label: 'JPY/TRY', name: 'Japon Yeni / Türk Lirası',     yahoo: 'JPYTRY=X', group: 'TRY', flag: '🇯🇵' },
  { symbol: 'CADTRY', label: 'CAD/TRY', name: 'Kanada Doları / Türk Lirası',  yahoo: 'CADTRY=X', group: 'TRY', flag: '🇨🇦' },
  { symbol: 'AUDTRY', label: 'AUD/TRY', name: 'Avustralya Doları / Türk Lirası', yahoo: 'AUDTRY=X', group: 'TRY', flag: '🇦🇺' },
  { symbol: 'CNYTRY', label: 'CNY/TRY', name: 'Çin Yuanı / Türk Lirası',      yahoo: 'CNYTRY=X', group: 'TRY', flag: '🇨🇳' },
  { symbol: 'RUBTRY', label: 'RUB/TRY', name: 'Rus Rublesi / Türk Lirası',    yahoo: 'RUBTRY=X', group: 'TRY', flag: '🇷🇺' },
  { symbol: 'SARTRY', label: 'SAR/TRY', name: 'Suudi Riyali / Türk Lirası',   yahoo: 'SARTRY=X', group: 'TRY', flag: '🇸🇦' },
  { symbol: 'AEDTRY', label: 'AED/TRY', name: 'BAE Dirhemi / Türk Lirası',    yahoo: 'AEDTRY=X', group: 'TRY', flag: '🇦🇪' },
  { symbol: 'NOKTRY', label: 'NOK/TRY', name: 'Norveç Kronu / Türk Lirası',   yahoo: 'NOKTRY=X', group: 'TRY', flag: '🇳🇴' },
  { symbol: 'SEKTRY', label: 'SEK/TRY', name: 'İsveç Kronu / Türk Lirası',    yahoo: 'SEKTRY=X', group: 'TRY', flag: '🇸🇪' },
  { symbol: 'DKKTRY', label: 'DKK/TRY', name: 'Danimarka Kronu / Türk Lirası',yahoo: 'DKKTRY=X', group: 'TRY', flag: '🇩🇰' },

  // Çapraz kurlar (major pairs)
  { symbol: 'EURUSD', label: 'EUR/USD', name: 'Euro / ABD Doları',            yahoo: 'EURUSD=X', group: 'MAJOR', flag: '🇪🇺' },
  { symbol: 'GBPUSD', label: 'GBP/USD', name: 'İngiliz Sterlini / ABD Doları',yahoo: 'GBPUSD=X', group: 'MAJOR', flag: '🇬🇧' },
  { symbol: 'USDJPY', label: 'USD/JPY', name: 'ABD Doları / Japon Yeni',      yahoo: 'USDJPY=X', group: 'MAJOR', flag: '🇺🇸' },
  { symbol: 'USDCHF', label: 'USD/CHF', name: 'ABD Doları / İsviçre Frangı',  yahoo: 'USDCHF=X', group: 'MAJOR', flag: '🇺🇸' },
  { symbol: 'AUDUSD', label: 'AUD/USD', name: 'Avustralya Doları / ABD Doları', yahoo: 'AUDUSD=X', group: 'MAJOR', flag: '🇦🇺' },
  { symbol: 'USDCAD', label: 'USD/CAD', name: 'ABD Doları / Kanada Doları',   yahoo: 'USDCAD=X', group: 'MAJOR', flag: '🇺🇸' },
  { symbol: 'NZDUSD', label: 'NZD/USD', name: 'Yeni Zelanda Doları / ABD Doları', yahoo: 'NZDUSD=X', group: 'MAJOR', flag: '🇳🇿' },
  { symbol: 'USDCNY', label: 'USD/CNY', name: 'ABD Doları / Çin Yuanı',       yahoo: 'USDCNY=X', group: 'MAJOR', flag: '🇺🇸' },

  // Endeksler
  { symbol: 'DXY',    label: 'DXY',     name: 'ABD Doları Endeksi (DXY)',     yahoo: 'DX-Y.NYB', group: 'INDEX', flag: '💵' },
];

export function findForex(symbol: string): ForexMeta | undefined {
  const s = symbol.toUpperCase();
  return FOREX_SYMBOLS.find((f) => f.symbol === s);
}
