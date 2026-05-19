/**
 * Aracı kurum model portföyleri — örnek/demo veri seti.
 *
 * Her broker için ağırlıklı hisse dağılımı. Toplam %100 olmalı.
 * Production'da broker'ların sabah stratejisi PDF'lerinden günlük scrape
 * edilecek (Claude AI parse — brokerRecommendations pattern'i).
 */

export interface PortfolioHolding {
  symbol: string;
  weight: number;  // % (toplam 100 olmalı)
  thesis?: string; // kısa neden (opsiyonel)
}

export interface BrokerPortfolio {
  brokerId: string;        // analysts.ts'teki id ile eşleşir
  brokerName: string;
  initials: string;
  colorSeed: string;
  sourceUrl: string;       // broker'ın resmi sayfası
  lastUpdate: string;      // YYYY-MM-DD
  riskProfile: 'Dengeli' | 'Büyüme' | 'Temettü' | 'Agresif' | 'Korunmacı';
  holdings: PortfolioHolding[];
  note?: string;
}

export const BROKER_PORTFOLIOS: BrokerPortfolio[] = [
  {
    brokerId: 'is-yatirim',
    brokerName: 'İş Yatırım',
    initials: 'İY',
    colorSeed: '#0ea5e9',
    sourceUrl: 'https://www.isyatirim.com.tr/tr-tr/analiz/Sayfalar/default.aspx',
    lastUpdate: '2026-05-19',
    riskProfile: 'Dengeli',
    note: 'Örnek model portföy — gerçek için resmi sabah stratejisi takip edin',
    holdings: [
      { symbol: 'THYAO', weight: 15, thesis: 'Trafik toparlanma + yaz sezonu' },
      { symbol: 'AKBNK', weight: 12, thesis: 'Net faiz marjı genişliyor' },
      { symbol: 'ASELS', weight: 12, thesis: 'Savunma ihaleleri + ihracat' },
      { symbol: 'KCHOL', weight: 10, thesis: 'Holding iskonto cazip' },
      { symbol: 'EREGL', weight: 9,  thesis: 'Çelik dip arıyor' },
      { symbol: 'TUPRS', weight: 9,  thesis: 'Temettü potansiyeli' },
      { symbol: 'BIMAS', weight: 9,  thesis: 'Defansif tüketim' },
      { symbol: 'SISE',  weight: 8,  thesis: 'Cam talep toparlanma' },
      { symbol: 'TCELL', weight: 8,  thesis: 'ARPU + 5G' },
      { symbol: 'GARAN', weight: 8,  thesis: 'Aktif kalite stabil' },
    ],
  },
  {
    brokerId: 'garanti-bbva-yatirim',
    brokerName: 'Garanti BBVA Yatırım',
    initials: 'GY',
    colorSeed: '#22c55e',
    sourceUrl: 'https://www.garantibbvayatirim.com.tr/arastirma/gunluk-bulten',
    lastUpdate: '2026-05-19',
    riskProfile: 'Büyüme',
    holdings: [
      { symbol: 'GARAN', weight: 14 },
      { symbol: 'YKBNK', weight: 12 },
      { symbol: 'SAHOL', weight: 11 },
      { symbol: 'TUPRS', weight: 10 },
      { symbol: 'BIMAS', weight: 10 },
      { symbol: 'THYAO', weight: 9 },
      { symbol: 'ASELS', weight: 9 },
      { symbol: 'KCHOL', weight: 8 },
      { symbol: 'PETKM', weight: 9 },
      { symbol: 'EREGL', weight: 8 },
    ],
  },
  {
    brokerId: 'halk-yatirim',
    brokerName: 'Halk Yatırım',
    initials: 'HY',
    colorSeed: '#f59e0b',
    sourceUrl: 'https://www.halkyatirim.com.tr/content/tr/arastirma',
    lastUpdate: '2026-05-19',
    riskProfile: 'Temettü',
    holdings: [
      { symbol: 'TUPRS', weight: 13, thesis: 'Yüksek temettü verimi' },
      { symbol: 'BIMAS', weight: 12 },
      { symbol: 'AKBNK', weight: 11 },
      { symbol: 'TCELL', weight: 11 },
      { symbol: 'KCHOL', weight: 10 },
      { symbol: 'EKGYO', weight: 9 },
      { symbol: 'PETKM', weight: 9 },
      { symbol: 'FROTO', weight: 9 },
      { symbol: 'TAVHL', weight: 8 },
      { symbol: 'SISE',  weight: 8 },
    ],
  },
  {
    brokerId: 'ziraat-yatirim',
    brokerName: 'Ziraat Yatırım',
    initials: 'ZY',
    colorSeed: '#8b5cf6',
    sourceUrl: 'https://www.ziraatyatirim.com.tr/tr/arastirma/yayinlar',
    lastUpdate: '2026-05-19',
    riskProfile: 'Dengeli',
    holdings: [
      { symbol: 'ASELS', weight: 12 },
      { symbol: 'SISE',  weight: 12 },
      { symbol: 'TAVHL', weight: 11 },
      { symbol: 'TKFEN', weight: 11 },
      { symbol: 'ARCLK', weight: 10 },
      { symbol: 'KCHOL', weight: 10 },
      { symbol: 'GARAN', weight: 9 },
      { symbol: 'YKBNK', weight: 9 },
      { symbol: 'THYAO', weight: 8 },
      { symbol: 'EREGL', weight: 8 },
    ],
  },
  {
    brokerId: 'osmanli-yatirim',
    brokerName: 'Osmanlı Yatırım',
    initials: 'OY',
    colorSeed: '#10b981',
    sourceUrl: 'https://www.osmanlimenkul.com.tr/finansal-planlama/egitim/bulten-talep',
    lastUpdate: '2026-05-19',
    riskProfile: 'Agresif',
    holdings: [
      { symbol: 'TRALT', weight: 15, thesis: 'Altın yüksek + üretim hedefleri' },
      { symbol: 'AGHOL', weight: 13 },
      { symbol: 'PGSUS', weight: 12 },
      { symbol: 'THYAO', weight: 11 },
      { symbol: 'ASELS', weight: 10 },
      { symbol: 'EREGL', weight: 10 },
      { symbol: 'KRDMD', weight: 10 },
      { symbol: 'SISE',  weight: 9 },
      { symbol: 'AEFES', weight: 10 },
    ],
  },
  {
    brokerId: 'kt-yatirim',
    brokerName: 'KT Yatırım',
    initials: 'KT',
    colorSeed: '#ec4899',
    sourceUrl: 'https://kuveytturkyatirim.com.tr/arastirma-raporlari/?category=G%C3%BCnl%C3%BCk+B%C3%BClten',
    lastUpdate: '2026-05-19',
    riskProfile: 'Korunmacı',
    holdings: [
      { symbol: 'ENKAI', weight: 14, thesis: 'Net nakit + dirençli kazançlar' },
      { symbol: 'TOASO', weight: 12 },
      { symbol: 'ULKER', weight: 12 },
      { symbol: 'BIMAS', weight: 11 },
      { symbol: 'TCELL', weight: 11 },
      { symbol: 'TUPRS', weight: 10 },
      { symbol: 'AKSA',  weight: 10 },
      { symbol: 'FROTO', weight: 10 },
      { symbol: 'CCOLA', weight: 10 },
    ],
  },
];

export function riskTone(p: BrokerPortfolio['riskProfile']): string {
  switch (p) {
    case 'Agresif':    return 'border-danger/40 bg-danger/10 text-danger';
    case 'Büyüme':     return 'border-accent/40 bg-accent/10 text-accent';
    case 'Dengeli':    return 'border-success/40 bg-success/10 text-success';
    case 'Temettü':    return 'border-warning/40 bg-warning/10 text-warning';
    case 'Korunmacı':  return 'border-slate-500/40 bg-slate-500/10 text-slate-300';
    default:           return 'border-border bg-bg-soft text-slate-400';
  }
}
