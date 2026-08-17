/**
 * BIST sektör endeksleri — kullanıcıya filtreleme icin sunulan endeks kodlari.
 */

export interface BistIndexDef {
  code: string;
  label: string;
  description?: string;
  sectors: string[];
}

export const BIST_INDICES: BistIndexDef[] = [
  { code: 'XBANK', label: 'Bankacılık',           sectors: ['Bankacılık'] },
  { code: 'XHOLD', label: 'Holding ve Yatırım',   sectors: ['Holding'] },
  { code: 'XSGRT', label: 'Sigorta',              sectors: ['Sigorta'] },
  { code: 'XGMYO', label: 'GYO (Gayrimenkul)',    sectors: ['GYO'] },
  { code: 'XKMYA', label: 'Kimya, Petrol, Plastik', sectors: ['Kimya', 'Petrokimya', 'LPG/Kimya'] },
  { code: 'XGIDA', label: 'Gıda, İçecek',         sectors: ['Gıda'] },
  { code: 'XMDN',  label: 'Madencilik',           sectors: ['Madencilik'] },
  { code: 'XELKT', label: 'Elektrik / Enerji',    sectors: ['Enerji', 'Enerji/Teknoloji'] },
  { code: 'XKAGT', label: 'Orman, Kağıt, Basım',  sectors: ['Kağıt', 'Matbaa'] },
  { code: 'XTEKS', label: 'Tekstil, Deri',        sectors: ['Tekstil'] },
  { code: 'XSPOR', label: 'Spor',                 sectors: ['Spor'] },
  { code: 'XTRZM', label: 'Turizm',               sectors: ['Turizm'] },
  { code: 'XULAS', label: 'Ulaştırma',            sectors: ['Ulaştırma'] },
  { code: 'XILTM', label: 'İletişim / Telekom',   sectors: ['Telekom', 'İletişim'] },
  { code: 'XBLSM', label: 'Bilişim',              sectors: ['Bilişim', 'Teknoloji'] },
  { code: 'XINSA', label: 'İnşaat',               sectors: ['İnşaat'] },
  { code: 'XTAST', label: 'Taş ve Toprak',        sectors: ['Cam', 'Cam/Sanayi', 'Çimento'] },
  { code: 'XMETL', label: 'Metal Ana',            sectors: ['Demir-Çelik'] },
  { code: 'XMESY', label: 'Metal Eşya, Makina',   sectors: ['Beyaz Eşya', 'Mühendislik', 'Mobilya'] },
  { code: 'XOTOM', label: 'Otomotiv',             sectors: ['Otomotiv', 'Savunma/Otomotiv'] },
  { code: 'XSVNM', label: 'Savunma',              sectors: ['Savunma'] },
  { code: 'XSGLK', label: 'Sağlık',               sectors: ['Sağlık'] },
  { code: 'XTCRT', label: 'Ticaret / Perakende',  sectors: ['Perakende', 'Ticaret'] },
  { code: 'XAMBL', label: 'Ambalaj',              sectors: ['Ambalaj'] },
  { code: 'XFINK', label: 'Finansal Kuruluşlar',  sectors: ['Aracı Kurum', 'Finansal', 'Faktöring'] },
];

export const INDEX_TO_SECTORS = new Map(
  BIST_INDICES.map((idx) => [idx.code, idx.sectors] as const),
);

// ---------------------------------------------------------------------------
// BIST ana endeksleri — sembol bazlı kapsam (sektör değil).
// Filtreleme: "BIST 100 hisselerini göster", "BIST 30 portföy" gibi sorgular.
// Kaynak: Borsa İstanbul endeks kompozisyonu (2025 sonu — yıllık güncellenir).
// ---------------------------------------------------------------------------

/** BIST 30 — en yüksek piyasa değeri + likiditeye sahip 30 hisse (XU030). */
export const BIST_30_SYMBOLS: ReadonlySet<string> = new Set([
  'AKBNK', 'ALARK', 'ASELS', 'ASTOR', 'BIMAS', 'CIMSA', 'DOAS', 'EKGYO',
  'ENKAI', 'EREGL', 'FROTO', 'GARAN', 'HALKB', 'ISCTR', 'KCHOL', 'KOZAA',
  'KOZAL', 'KRDMD', 'MGROS', 'PETKM', 'PGSUS', 'SAHOL', 'SASA', 'SISE',
  'TAVHL', 'THYAO', 'TOASO', 'TUPRS', 'VAKBN', 'YKBNK',
]);

/** BIST 100 — ana endeks (XU100). En kapsamlı 100 hisse. */
export const BIST_100_SYMBOLS: ReadonlySet<string> = new Set([
  'AKBNK', 'ALARK', 'ASELS', 'ASTOR', 'BIMAS', 'CIMSA', 'DOAS', 'EKGYO',
  'ENKAI', 'EREGL', 'FROTO', 'GARAN', 'HALKB', 'ISCTR', 'KCHOL', 'KOZAA',
  'KOZAL', 'KRDMD', 'MGROS', 'PETKM', 'PGSUS', 'SAHOL', 'SASA', 'SISE',
  'TAVHL', 'THYAO', 'TOASO', 'TUPRS', 'VAKBN', 'YKBNK',
  'AEFES', 'AGHOL', 'AKCNS', 'AKFGY', 'AKFYE', 'AKSA', 'AKSEN', 'ALBRK',
  'ALFAS', 'ANSGR', 'ARCLK', 'BERA', 'BFREN', 'BRSAN', 'BRYAT', 'BTCIM',
  'CANTE', 'CCOLA', 'CWENE', 'DOHOL', 'ECILC', 'ECZYT', 'EGEEN',
  'ENJSA', 'ESEN', 'EUPWR', 'FENER', 'GESAN', 'GOLTS', 'GUBRF', 'HEKTS',
  'IPEKE', 'ISMEN', 'IZENR', 'IZMDC', 'KARSN', 'KAYSE', 'KMPUR', 'KONTR',
  'KONYA', 'KORDS', 'KRDMA', 'LMKDC', 'LOGO', 'MAVI', 'MIATK', 'NTHOL',
  'ODAS', 'ONCSM', 'OTKAR', 'OYAKC', 'PAGYO', 'PENTA', 'QUAGR', 'REEDR',
  'SDTTR', 'SKBNK', 'SMRTG', 'SOKM', 'TCELL', 'TKFEN', 'TKNSA', 'TMSN',
  'TSKB', 'TTKOM', 'TTRAK', 'TUKAS', 'TURSG', 'ULKER', 'VESBE', 'VESTL',
  'YEOTK', 'YYLGD', 'ZOREN',
]);

export interface BistScopeDef {
  code: 'XU100' | 'XU030' | 'BISTTUM';
  label: string;
  symbols: ReadonlySet<string> | null;
}

export const BIST_SCOPES: readonly BistScopeDef[] = [
  { code: 'XU100', label: 'BIST 100', symbols: BIST_100_SYMBOLS },
  { code: 'XU030', label: 'BIST 30', symbols: BIST_30_SYMBOLS },
  { code: 'BISTTUM', label: 'BIST Tüm', symbols: null },
] as const;

export type BistScopeCode = (typeof BIST_SCOPES)[number]['code'];

export function isInBistScope(symbol: string, scope: BistScopeCode): boolean {
  const def = BIST_SCOPES.find((s) => s.code === scope);
  if (!def || def.symbols == null) return true;
  return def.symbols.has(symbol);
}

