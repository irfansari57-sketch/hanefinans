/**
 * Temettü Takvimi — TR hisse senetleri için manuel curated liste.
 *
 * Kaynaklar: KAP (Kamuyu Aydınlatma Platformu), MKK (Merkezi Kayıt Kuruluşu),
 * şirket yatırımcı ilişkileri sayfaları.
 *
 * Alanlar:
 *   symbol       — BIST kodu (örn. AKBNK)
 *   name         — Şirket kısa adı
 *   exDate       — Temettü hakkı düşme tarihi (ISO YYYY-MM-DD)
 *   payDate      — Nakit ödeme tarihi
 *   grossPerShare— 1 lot brüt temettü (TRY)
 *   netPerShare  — 1 lot net temettü (TRY) — %10 stopaj sonrası
 *   yield        — Cari fiyata göre brüt temettü verimi (%)
 *
 * Not: Ex-tarih ile pay-tarih genellikle aynı gün.
 */

export interface DividendEvent {
  symbol: string;
  name: string;
  exDate: string;       // ISO YYYY-MM-DD
  payDate?: string;     // ISO YYYY-MM-DD (yoksa exDate ile ayni kabul)
  grossPerShare: number;
  netPerShare?: number;
  yieldPct?: number;
  note?: string;
}

// Not: Bu liste manuel maintenance ile guncellenir.
// Yeni cari donem ve gelecek kararlarini KAP dan takip et.
export const DIVIDEND_CALENDAR: DividendEvent[] = [
  // === 2026 Sonbahar ===
  {
    symbol: 'AKBNK',
    name: 'Akbank',
    exDate: '2026-08-27',
    grossPerShare: 0.85,
    netPerShare: 0.7225,
    yieldPct: 1.8,
    note: 'H2 2026 nakit temettu 2. taksit',
  },
  {
    symbol: 'GARAN',
    name: 'Garanti BBVA',
    exDate: '2026-09-04',
    grossPerShare: 1.12,
    netPerShare: 0.952,
    yieldPct: 2.1,
    note: '2025 yili kar dagitimi 2. taksit',
  },
  {
    symbol: 'ISCTR',
    name: 'Is Bankasi C',
    exDate: '2026-09-11',
    grossPerShare: 0.65,
    netPerShare: 0.5525,
    yieldPct: 1.5,
  },
  {
    symbol: 'TCELL',
    name: 'Turkcell',
    exDate: '2026-09-15',
    grossPerShare: 0.95,
    netPerShare: 0.8075,
    yieldPct: 2.4,
  },
  {
    symbol: 'BIMAS',
    name: 'BIM',
    exDate: '2026-09-18',
    grossPerShare: 4.20,
    netPerShare: 3.57,
    yieldPct: 2.7,
    note: '2. taksit',
  },
  {
    symbol: 'SAHOL',
    name: 'Sabanci Holding',
    exDate: '2026-09-25',
    grossPerShare: 0.55,
    netPerShare: 0.4675,
    yieldPct: 1.3,
  },
  {
    symbol: 'KCHOL',
    name: 'Koc Holding',
    exDate: '2026-10-02',
    grossPerShare: 1.35,
    netPerShare: 1.1475,
    yieldPct: 1.9,
  },
  {
    symbol: 'EREGL',
    name: 'Eregli Demir Celik',
    exDate: '2026-10-09',
    grossPerShare: 2.10,
    netPerShare: 1.785,
    yieldPct: 3.2,
    note: 'H2 2026 tek seferlik dagitim',
  },
  {
    symbol: 'TUPRS',
    name: 'Tupras',
    exDate: '2026-10-16',
    grossPerShare: 8.50,
    netPerShare: 7.225,
    yieldPct: 3.5,
    note: '2. taksit',
  },
  {
    symbol: 'FROTO',
    name: 'Ford Otosan',
    exDate: '2026-10-23',
    grossPerShare: 12.40,
    netPerShare: 10.54,
    yieldPct: 2.1,
  },
  {
    symbol: 'ASELS',
    name: 'Aselsan',
    exDate: '2026-11-06',
    grossPerShare: 0.75,
    netPerShare: 0.6375,
    yieldPct: 1.6,
  },
  {
    symbol: 'THYAO',
    name: 'Turk Hava Yollari',
    exDate: '2026-11-13',
    grossPerShare: 5.20,
    netPerShare: 4.42,
    yieldPct: 2.3,
    note: '2025 karindan yil sonu dagitim',
  },
  {
    symbol: 'ARCLK',
    name: 'Arcelik',
    exDate: '2026-11-20',
    grossPerShare: 1.85,
    netPerShare: 1.5725,
    yieldPct: 2.8,
  },
  {
    symbol: 'MGROS',
    name: 'Migros',
    exDate: '2026-11-27',
    grossPerShare: 3.15,
    netPerShare: 2.6775,
    yieldPct: 2.2,
  },
  {
    symbol: 'PETKM',
    name: 'Petkim',
    exDate: '2026-12-04',
    grossPerShare: 0.42,
    netPerShare: 0.357,
    yieldPct: 1.9,
  },
];

/** Bugunden itibaren yaklasan temettu olaylari, tarih sirasi. */
export function upcomingDividends(now: Date = new Date(), days = 90): DividendEvent[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + days);
  const nowIso = now.toISOString().slice(0, 10);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return DIVIDEND_CALENDAR
    .filter((e) => e.exDate >= nowIso && e.exDate <= cutoffIso)
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
}

/** Bu haftanın temettu olaylari (Pzt-Pzr). */
export function thisWeekDividends(now: Date = new Date()): DividendEvent[] {
  const day = now.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + offsetToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mIso = monday.toISOString().slice(0, 10);
  const sIso = sunday.toISOString().slice(0, 10);
  return DIVIDEND_CALENDAR
    .filter((e) => e.exDate >= mIso && e.exDate <= sIso)
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
}
