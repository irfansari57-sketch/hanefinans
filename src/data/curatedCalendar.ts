/**
 * Kürate edilmiş ekonomik takvim — TR + global önemli olaylar.
 *
 * MANUEL maintenance: Yeni olaylar elle eklenir/güncellenir.
 * Source: TCMB takvimi, FED FOMC, ECB, TÜİK, BLS, Eurostat, Borsa İstanbul.
 *
 * Format: ISO date (YYYY-MM-DD), Istanbul time (UTC+3) optional.
 *
 * IMPORTANCE: 'high' = piyasayı doğrudan etkiler (TCMB faiz, NFP, FOMC).
 *             'medium' = orta etki (BoE, retail sales).
 *             'low' = bilgilendirme.
 */

export type EventCategory =
  | 'monetary'      // Merkez bankası faiz kararları
  | 'data'          // Ekonomik veri açıklamaları (TÜFE, GSYİH, NFP)
  | 'political'     // Siyasi / hukuki gelişmeler
  | 'holiday'       // Borsa tatil günleri
  | 'derivatives'   // VİOP vade sonu vb.
  | 'corporate';    // Şirket bazlı (genel kurul, temettü)

export type EventImportance = 'high' | 'medium' | 'low';
export type EventImpact = 'bullish' | 'bearish' | 'neutral' | 'unknown';
export type EventCountry = 'TR' | 'US' | 'EU' | 'UK' | 'GLOBAL';

export interface CalendarEvent {
  id: string;
  date: string;       // ISO YYYY-MM-DD
  time?: string;      // HH:mm Istanbul, optional
  title: string;
  category: EventCategory;
  country: EventCountry;
  importance: EventImportance;
  description?: string;
  expectation?: string;
  impact?: EventImpact;
}

export const CURATED_CALENDAR: CalendarEvent[] = [
  {
    id: 'tr-gdp-q1-2026',
    date: '2026-06-01',
    time: '10:00',
    title: 'Türkiye Q1 2026 GSYİH',
    category: 'data',
    country: 'TR',
    importance: 'high',
    description: 'TÜİK Ocak-Mart büyüme verileri.',
    expectation: 'Yıllık yaklaşık %2,7 büyüme bekleniyor.',
    impact: 'unknown',
  },
  {
    id: 'eu-cpi-flash-may-2026',
    date: '2026-06-02',
    time: '12:00',
    title: 'Euro Bölgesi Mayıs TÜFE (Öncü)',
    category: 'data',
    country: 'EU',
    importance: 'high',
    description: 'Eurostat öncü enflasyon tahmini.',
    expectation: 'Yıllık enflasyonun %2 hedefine yakın seyretmesi bekleniyor.',
    impact: 'unknown',
  },
  {
    id: 'tr-cpi-ppi-may-2026',
    date: '2026-06-03',
    time: '10:00',
    title: 'Türkiye Mayıs TÜFE ve ÜFE',
    category: 'data',
    country: 'TR',
    importance: 'high',
    description: 'TÜİK Mayıs ayı tüketici ve üretici fiyat endeksleri.',
    expectation: 'Aylık TÜFE %2 civarı; TCMB faiz patikasını şekillendirecek.',
    impact: 'unknown',
  },
  {
    id: 'us-nfp-may-2026',
    date: '2026-06-05',
    time: '15:30',
    title: 'ABD Mayıs Tarım Dışı İstihdam (NFP)',
    category: 'data',
    country: 'US',
    importance: 'high',
    description: 'BLS Mayıs istihdam raporu.',
    expectation: 'FED Haziran kararı öncesi en kritik veri. Sürpriz veriler USD ve tahvil getirilerinde sert hareketlere yol açar.',
    impact: 'unknown',
  },
  {
    id: 'us-cpi-may-2026',
    date: '2026-06-10',
    time: '15:30',
    title: 'ABD Mayıs TÜFE',
    category: 'data',
    country: 'US',
    importance: 'high',
    description: 'BLS tüketici enflasyonu; FOMC bir hafta sonra.',
    expectation: 'Manşet TÜFE %3 yakını, çekirdek TÜFE yüksek bekleniyor.',
    impact: 'unknown',
  },
  {
    id: 'tr-unemployment-apr-2026',
    date: '2026-06-10',
    time: '10:00',
    title: 'Türkiye Nisan İşgücü İstatistikleri',
    category: 'data',
    country: 'TR',
    importance: 'medium',
    description: 'TÜİK Nisan işsizlik oranı ve istihdam.',
    expectation: 'İşsizliğin çift haneye yakın seyretmeye devam etmesi.',
    impact: 'neutral',
  },
  {
    id: 'tcmb-2026-06',
    date: '2026-06-11',
    time: '14:00',
    title: 'TCMB PPK Faiz Kararı',
    category: 'monetary',
    country: 'TR',
    importance: 'high',
    description: 'TCMB 2026 yılı dördüncü PPK toplantısı — politika faizi açıklanacak.',
    expectation: 'Enflasyon görünümüne bağlı ölçülü faiz indirimi veya sabit tutulma piyasada öne çıkıyor.',
    impact: 'unknown',
  },
  {
    id: 'ecb-2026-06',
    date: '2026-06-11',
    time: '15:15',
    title: 'ECB Para Politikası Kararı',
    category: 'monetary',
    country: 'EU',
    importance: 'high',
    description: 'ECB faiz kararı + Lagarde basın toplantısı (15:45).',
    expectation: 'Faizin sabit tutulması bekleniyor. EUR/USD ve EUR/TRY volatilitesi.',
    impact: 'unknown',
  },
  {
    id: 'chp-yargitay-butlan',
    date: '2026-06-15',
    title: 'CHP Kurultay Butlan Davası — Yargıtay',
    category: 'political',
    country: 'TR',
    importance: 'high',
    description: 'Bolge Adliye Mahkemesi butlan kararına temyizin Yargıtayda görülmesi bekleniyor (tahmini Haziran ortası).',
    expectation: 'Karar siyasi belirsizlik üzerinden BIST risk primini ve TRY tarafini etkileyebilir.',
    impact: 'bearish',
  },
  {
    id: 'us-retail-sales-may-2026',
    date: '2026-06-17',
    time: '15:30',
    title: 'ABD Mayıs Perakende Satışları',
    category: 'data',
    country: 'US',
    importance: 'high',
    description: 'Tüketici talebine ilişkin önemli gösterge.',
    expectation: 'Aylık %0,3-0,5 arası artış öngörülüyor.',
    impact: 'unknown',
  },
  {
    id: 'fomc-2026-06',
    date: '2026-06-17',
    time: '21:00',
    title: 'FED FOMC Faiz Kararı + Dot Plot',
    category: 'monetary',
    country: 'US',
    importance: 'high',
    description: 'FED iki günlük FOMC ikinci günü — faiz + güncel ekonomik projeksiyonlar (SEP) + dot plot. Powell 21:30.',
    expectation: 'Faizin sabit tutulması. Yıl içinde indirim sayısı dot plot revizyonu kritik.',
    impact: 'unknown',
  },
  {
    id: 'tcmb-ppk-ozet-2026-06',
    date: '2026-06-18',
    time: '14:00',
    title: 'TCMB Haziran PPK Toplantı Özeti',
    category: 'monetary',
    country: 'TR',
    importance: 'medium',
    description: 'PPK kararı sonrası yayımlanan özet — kurul üyelerinin değerlendirmeleri.',
    expectation: 'Şahin/güvercin ton ileri yönlü rehberliği etkiler.',
    impact: 'unknown',
  },
  {
    id: 'boe-2026-06',
    date: '2026-06-18',
    time: '14:00',
    title: 'BoE Para Politikası Kararı',
    category: 'monetary',
    country: 'UK',
    importance: 'medium',
    description: 'İngiltere Merkez Bankası MPC Haziran toplantısı.',
    expectation: 'Faizin sabit tutulması fiyatlanıyor. Sterlin volatilitesi.',
    impact: 'unknown',
  },
  {
    id: 'viop-haziran-vade-2026',
    date: '2026-06-30',
    time: '18:10',
    title: 'VİOP Haziran 2026 Vade Sonu',
    category: 'derivatives',
    country: 'TR',
    importance: 'medium',
    description: 'BIST 30, USD/TRY ve diğer Haziran 2026 vadeli kontratların son işlem günü.',
    expectation: 'Vade sonu yakını BIST 30 spotunda artan oynaklık ve hacim olası.',
    impact: 'neutral',
  },
  {
    id: 'eu-cpi-flash-jun-2026',
    date: '2026-07-01',
    time: '12:00',
    title: 'Euro Bölgesi Haziran TÜFE (Öncü)',
    category: 'data',
    country: 'EU',
    importance: 'high',
    description: 'Eurostat öncü enflasyon — ECB yaz tutumunu şekillendirecek.',
    impact: 'unknown',
  },
  {
    id: 'us-nfp-jun-2026',
    date: '2026-07-02',
    time: '15:30',
    title: 'ABD Haziran NFP',
    category: 'data',
    country: 'US',
    importance: 'high',
    description: 'BLS Haziran istihdam — 4 Temmuz tatili nedeniyle Perşembe yayımlanır (tahmini).',
    expectation: 'İstihdam artışındaki yavaşlama FED Temmuz toplantısına sinyal.',
    impact: 'unknown',
  },
  {
    id: 'tr-cpi-ppi-jun-2026',
    date: '2026-07-03',
    time: '10:00',
    title: 'Türkiye Haziran TÜFE ve ÜFE',
    category: 'data',
    country: 'TR',
    importance: 'high',
    description: 'TÜİK Haziran enflasyonu (tahmini, ayın ilk haftası).',
    expectation: 'Dezenflasyon patikasında düşüş eğilimi.',
    impact: 'unknown',
  },
  {
    id: 'fed-powell-semiannual',
    date: '2026-07-09',
    time: '17:00',
    title: 'Powell Yarı Yıllık Para Politikası Sunumu',
    category: 'monetary',
    country: 'US',
    importance: 'medium',
    description: 'FED Başkanı Powell ABD Kongresi yarı yıllık tanıklık (tahmini).',
    expectation: 'İleri yönlü rehberlik. USD ve tahvil oynaklığı olası.',
    impact: 'unknown',
  },
  {
    id: 'us-cpi-jun-2026',
    date: '2026-07-15',
    time: '15:30',
    title: 'ABD Haziran TÜFE',
    category: 'data',
    country: 'US',
    importance: 'high',
    description: 'FOMC Temmuz toplantısı öncesi son kritik enflasyon (tahmini, ayın ortası).',
    impact: 'unknown',
  },
  {
    id: 'us-retail-sales-jun-2026',
    date: '2026-07-16',
    time: '15:30',
    title: 'ABD Haziran Perakende Satışları',
    category: 'data',
    country: 'US',
    importance: 'medium',
    description: 'Census Bureau Haziran verileri (tahmini).',
    impact: 'unknown',
  },
];

/**
 * Filtreler — page/widget'larda kullanım için.
 */

export function upcomingEvents(now: Date = new Date(), days = 14): CalendarEvent[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + days);
  const nowIso = now.toISOString().slice(0, 10);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return CURATED_CALENDAR
    .filter((e) => e.date >= nowIso && e.date <= cutoffIso)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time ?? '00:00').localeCompare(b.time ?? '00:00');
    });
}

export function thisWeekEvents(now: Date = new Date()): CalendarEvent[] {
  // Bu haftanın Pazartesi-Pazar günleri (TR: hafta başı Pazartesi)
  const day = now.getDay(); // 0=Pazar, 1=Pazartesi ...
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + offsetToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mIso = monday.toISOString().slice(0, 10);
  const sIso = sunday.toISOString().slice(0, 10);
  return CURATED_CALENDAR
    .filter((e) => e.date >= mIso && e.date <= sIso)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function allUpcoming(now: Date = new Date()): CalendarEvent[] {
  const nowIso = now.toISOString().slice(0, 10);
  return CURATED_CALENDAR
    .filter((e) => e.date >= nowIso)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time ?? '00:00').localeCompare(b.time ?? '00:00');
    });
}
