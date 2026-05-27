/**
 * BIST sektör endeksleri — kullanıcıya filtreleme icin sunulan endeks kodlari.
 * Her endeks bir veya birkac sektore karsi gelir.
 *
 * Sektor degerleri bistAll.ts ile uyumlu (45 unique sektor).
 * Endeks kodlari BIST'in resmi sektör endeks kodlari (XBANK, XMDN, XHLD vs.).
 */

export interface BistIndexDef {
  code: string;        // ör. XBANK
  label: string;       // ör. Bankacılık
  description?: string;
  sectors: string[];   // bistAll.ts sektör string'leri
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

/** Endeks kodu → bistAll.ts'teki sektör listesi */
export const INDEX_TO_SECTORS = new Map(
  BIST_INDICES.map((idx) => [idx.code, idx.sectors] as const),
);
