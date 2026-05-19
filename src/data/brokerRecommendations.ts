/**
 * Aracı kurum hisse önerileri — örnek/demo veri seti.
 *
 * KAYNAK: Her broker'ın resmi raporlarından manuel derlenir. Şu an statik;
 * gelecekte admin panelinden yönetilebilir veya broker sitelerinden scrape
 * edilebilir (PDF/HTML — kırılgan, bu yüzden manuel tercih edildi).
 *
 * Her öneri için:
 * - symbol: BIST kodu (mavi link → /stock/SYM)
 * - targetPrice: opsiyonel hedef fiyat (₺)
 * - stopLoss: opsiyonel stop seviyesi
 * - thesis: 1 cümle yatırım tezi
 * - rating: 'AL' | 'TUT' | 'BIRIKIM' | 'NÖTR' — broker'ın resmi notu
 * - updatedAt: ISO tarih (önerinin güncellendiği gün)
 * - brokerId: brokerRecommendations.ts ile eşleşir (analysts.ts'teki id)
 */

export interface StockRecommendation {
  symbol: string;
  rating: 'AL' | 'GÜÇLÜ AL' | 'TUT' | 'BIRIKIM YAP' | 'NÖTR';
  targetPrice?: number;
  stopLoss?: number;
  thesis: string;
  updatedAt: string;  // YYYY-MM-DD
}

export interface BrokerRecommendationSet {
  brokerId: string;        // analysts.ts'teki id ile eşleşir
  brokerName: string;
  initials: string;
  colorSeed: string;
  sourceUrl: string;       // ilgili broker'ın resmi sayfası
  lastUpdate: string;      // YYYY-MM-DD — bu listenin son güncellenme tarihi
  recommendations: StockRecommendation[];
  /** Admin tarafından güncellenme notu (opsiyonel) */
  note?: string;
}

/**
 * NOT: Aşağıdaki veriler ÖRNEK/DEMO amaçlıdır. Gerçek piyasa önerisi
 * değildir — broker'ların resmi raporlarına linkler kart altında verilir.
 * Üretim ortamında bu liste admin panelinden veya broker scrape ile dolar.
 */
export const BROKER_RECOMMENDATIONS: BrokerRecommendationSet[] = [
  {
    brokerId: 'is-yatirim',
    brokerName: 'İş Yatırım',
    initials: 'İY',
    colorSeed: '#0ea5e9',
    sourceUrl: 'https://www.isyatirim.com.tr/tr-tr/analiz/Sayfalar/default.aspx',
    lastUpdate: '2026-05-19',
    note: 'Örnek demo — gerçek öneri için resmi sabah stratejisini takip edin',
    recommendations: [
      { symbol: 'THYAO', rating: 'AL',         targetPrice: 320, thesis: 'Trafik toparlanma + güçlü yaz sezonu, ücret marjı korunuyor.',          updatedAt: '2026-05-19' },
      { symbol: 'AKBNK', rating: 'AL',         targetPrice: 78,  thesis: 'Net faiz marjı genişliyor, swap düzeltmeleri sonrası kâr trendi pozitif.', updatedAt: '2026-05-19' },
      { symbol: 'ASELS', rating: 'GÜÇLÜ AL',   targetPrice: 175, thesis: 'Yeni savunma ihaleleri + ihracat artışı 2026 boyunca güçlü gelir desteği.', updatedAt: '2026-05-19' },
      { symbol: 'EREGL', rating: 'BIRIKIM YAP', targetPrice: 65,  thesis: 'Çelik fiyatlarında dip arama; yıl sonuna doğru toparlanma bekleniyor.',     updatedAt: '2026-05-19' },
      { symbol: 'KCHOL', rating: 'AL',         targetPrice: 245, thesis: 'Çeşitli portföy + Tüpraş güçlü, holding iskontosu cazip seviyelerde.',     updatedAt: '2026-05-19' },
    ],
  },
  {
    brokerId: 'garanti-bbva-yatirim',
    brokerName: 'Garanti BBVA Yatırım',
    initials: 'GY',
    colorSeed: '#22c55e',
    sourceUrl: 'https://www.garantibbvayatirim.com.tr/arastirma/gunluk-bulten',
    lastUpdate: '2026-05-19',
    recommendations: [
      { symbol: 'GARAN', rating: 'AL',       targetPrice: 95,  thesis: 'Aktif kalite stabil, kredi büyümesi sektör ortalamasının üstünde.',         updatedAt: '2026-05-19' },
      { symbol: 'YKBNK', rating: 'AL',       targetPrice: 38,  thesis: 'Komisyon gelirleri rekorda, dijital dönüşüm maliyet avantajı sağlıyor.',    updatedAt: '2026-05-19' },
      { symbol: 'TUPRS', rating: 'TUT',      targetPrice: 195, thesis: 'Rafineri marjları dalgalı; uzun vadeli temettü potansiyeli korunuyor.',      updatedAt: '2026-05-19' },
      { symbol: 'SAHOL', rating: 'AL',       targetPrice: 110, thesis: 'Akbank + Enerji portföyü güçlü, holding iskontosu dar.',                     updatedAt: '2026-05-19' },
      { symbol: 'BIMAS', rating: 'BIRIKIM YAP', targetPrice: 720, thesis: 'Yüksek frekanslı tüketim + ücret artışı talep dirençli; defansif tercih.', updatedAt: '2026-05-19' },
    ],
  },
  {
    brokerId: 'halk-yatirim',
    brokerName: 'Halk Yatırım',
    initials: 'HY',
    colorSeed: '#f59e0b',
    sourceUrl: 'https://www.halkyatirim.com.tr/content/tr/arastirma',
    lastUpdate: '2026-05-19',
    recommendations: [
      { symbol: 'PETKM', rating: 'AL',         targetPrice: 28,  thesis: 'Petkim katma değerli ürünlere geçiş, marj iyileşmesi 2H görünür.',  updatedAt: '2026-05-19' },
      { symbol: 'EKGYO', rating: 'AL',         targetPrice: 18,  thesis: 'Konut talebi canlı, KGYO portföyü cazip iskontoda işlem görüyor.',   updatedAt: '2026-05-19' },
      { symbol: 'TCELL', rating: 'AL',         targetPrice: 105, thesis: 'ARPU artışı + 5G yatırımları, kârlılık görünümü olumlu.',           updatedAt: '2026-05-19' },
      { symbol: 'FROTO', rating: 'BIRIKIM YAP', targetPrice: 1450, thesis: 'Ford ihracat oranı %70+, EUR cinsi gelir TL devalüasyonuna karşı kalkan.', updatedAt: '2026-05-19' },
    ],
  },
  {
    brokerId: 'ziraat-yatirim',
    brokerName: 'Ziraat Yatırım',
    initials: 'ZY',
    colorSeed: '#8b5cf6',
    sourceUrl: 'https://www.ziraatyatirim.com.tr/tr/arastirma/yayinlar',
    lastUpdate: '2026-05-19',
    recommendations: [
      { symbol: 'SISE',  rating: 'AL',         targetPrice: 62,  thesis: 'Cam talebi global toparlanma + soda külü kapasite artışı.',          updatedAt: '2026-05-19' },
      { symbol: 'ARCLK', rating: 'BIRIKIM YAP', targetPrice: 195, thesis: 'Avrupa beyaz eşya pazarında pay alıyor; ihracat marjı pozitif.',     updatedAt: '2026-05-19' },
      { symbol: 'TAVHL', rating: 'AL',         targetPrice: 510, thesis: 'Yolcu trafiği rekor seviyede, yer hizmetleri büyüme katkısı yüksek.', updatedAt: '2026-05-19' },
      { symbol: 'TKFEN', rating: 'AL',         targetPrice: 145, thesis: 'Müteahhitlik yurt dışı projeleri + gübre marjı; çift motor.',         updatedAt: '2026-05-19' },
    ],
  },
  {
    brokerId: 'osmanli-yatirim',
    brokerName: 'Osmanlı Yatırım',
    initials: 'OY',
    colorSeed: '#10b981',
    sourceUrl: 'https://www.osmanlimenkul.com.tr/finansal-planlama/egitim/bulten-talep',
    lastUpdate: '2026-05-19',
    recommendations: [
      { symbol: 'KOZAL', rating: 'AL',       targetPrice: 425, thesis: 'Altın fiyatı yüksek, üretim hedefleri yıl sonu için tutuyor.',          updatedAt: '2026-05-19' },
      { symbol: 'AGHOL', rating: 'AL',       targetPrice: 295, thesis: 'Migros + Mavi büyüme, holding NAV iskonto kapanmaya başlıyor.',          updatedAt: '2026-05-19' },
      { symbol: 'AEFES', rating: 'TUT',      targetPrice: 195, thesis: 'CCI temettü desteği + bira hacim toparlanma; orta vadeli pozitif.',     updatedAt: '2026-05-19' },
    ],
  },
  {
    brokerId: 'kt-yatirim',
    brokerName: 'KT Yatırım',
    initials: 'KT',
    colorSeed: '#ec4899',
    sourceUrl: 'https://kuveytturkyatirim.com.tr/arastirma-raporlari/?category=G%C3%BCnl%C3%BCk+B%C3%BClten',
    lastUpdate: '2026-05-19',
    recommendations: [
      { symbol: 'ENKAI', rating: 'AL',         targetPrice: 75,  thesis: 'Net nakit pozisyonu yüksek, müteahhitlik gelir artışı sürdürülebilir.', updatedAt: '2026-05-19' },
      { symbol: 'TOASO', rating: 'BIRIKIM YAP', targetPrice: 320, thesis: 'Yeni model yatırımları + ihracat odaklı; iç pazar dalgalanmasına dirençli.', updatedAt: '2026-05-19' },
      { symbol: 'ULKER', rating: 'AL',         targetPrice: 145, thesis: 'Ürün portföyü genişliyor, Türk lirası fiyatlama gücü yüksek.',          updatedAt: '2026-05-19' },
    ],
  },
];

/** Rating'e göre Tailwind renk class'ı döner */
export function ratingTone(rating: StockRecommendation['rating']): string {
  switch (rating) {
    case 'GÜÇLÜ AL':    return 'border-success/40 bg-success/15 text-success';
    case 'AL':          return 'border-success/30 bg-success/10 text-success';
    case 'BIRIKIM YAP': return 'border-accent/30 bg-accent/10 text-accent';
    case 'TUT':         return 'border-warning/30 bg-warning/10 text-warning';
    case 'NÖTR':        return 'border-slate-500/30 bg-slate-500/10 text-slate-400';
    default:            return 'border-border bg-bg-soft text-slate-300';
  }
}
