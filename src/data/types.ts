export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface Stock {
  symbol: string;
  name: string;
  sector?: string;
  price: number;
  changePct: number;
  updatedAt: string;
  /**
   * Veri kaynagi - snapshot endpoint'inden gelir.
   *   'yahoo'     - Yahoo Finance (default)
   *   'isyatirim' - Is Yatirim pre-warm cache (bist_snapshot D1, authoritative)
   * TopMovers filter'i Yahoo previousClose bug'ini elemek icin bu alani kullanir.
   */
  feedSource?: 'yahoo' | 'isyatirim';
}

export type NewsSource = string;

export interface NewsItem {
  id: string;
  source: NewsSource;
  symbols: string[];
  importance: number;
  title: string;
  summary: string;
  publishedAt: string;
  url?: string;
}

export type MacroKey =
  | 'USD/TRY'
  | 'EUR/TRY'
  | 'GBP/TRY'
  | 'EUR/USD'
  | 'BIST 100'
  | 'BIST 30'
  | 'VIOP 30'
  | 'XBANK'
  | 'XUTUM'
  | 'Politika Faizi'
  | 'Brent'
  | 'Gram Altın'
  | 'Gram Gümüş'
  | 'Gram Platin'
  | 'Ons Altın'
  | 'Ons Gümüş'
  | 'Ons Platin'
  | 'VIX'
  | 'ABD 10Y Faiz'
  | 'CDS 5Y'
  | 'BTC/USD'
  | 'ETH/USD'
  | 'XRP/USD'
  | 'DOGE/USD';

export interface MacroIndicator {
  key: MacroKey;
  label: string;
  value: number;
  changePct?: number;
  unit?: string;
  source: 'live' | 'mock';
  subLabel?: string;
  updatedAt: string;
  /**
   * Verinin gosterdigi seans tarihi (YYYY-MM-DD).
   * Hafta sonu / tatil oncesi son kapanis gunu icin "Son kapanis: Cuma 18 Haz"
   * tipi label uretmek icin kullanilir (bkz. marketCalendar.asOfLabel).
   * Backend snapshot endpoint'inden geliyorsa set edilir (BIST endeksleri).
   */
  asOf?: string;
  /**
   * Veriyi hangi besleme sagladi (defansif analitik / debug icin).
   * BIST endeksleri 'isyatirim'; Yahoo akisinda 'yahoo'; diger besleme adlari da
   * eklenebilir. UI gostermek icin zorunlu degil - gizli kalabilir.
   */
  feedSource?: 'isyatirim' | 'yahoo' | 'bigpara' | 'goldapi' | 'metalsapi' | 'tcmb' | string;
}

export type MarketEventType = 'cpi' | 'rate-decision' | 'fomc' | 'earnings' | 'data' | 'other';

export interface MarketEvent {
  id: string;
  title: string;
  type: MarketEventType;
  country: 'TR' | 'US' | 'EU' | 'GLOBAL';
  date: string;
  importance: number;
}

export interface SentimentMention {
  symbol: string;
  count: number;
  sentiment: Sentiment;
  lastChange?: number;
}

export type FundCategory =
  | 'Para Piyasası'
  | 'Serbest'
  | 'Hisse Senedi'
  | 'Değişken'
  | 'Fon Sepeti'
  | 'Kıymetli Madenler'
  | 'Borçlanma Araçları'
  | 'Katılım'
  // Aşağıdakiler TEFAS feed'inden geliyor - sozel olarak yukarıdakilerden ayrı,
  // ekran ve filtre tarafında ayrı kategori olarak gösterilir.
  | 'Altın'
  | 'Gümüş'
  | 'Karma'
  | 'Döviz'
  | 'Emtia'
  | 'Kıymetli Maden'
  | 'Emeklilik'
  | 'Diğer';

export interface FundPerformance {
  code: string;
  name?: string;
  category: FundCategory;
  tefas: boolean;
  /**
   * TEFAS uzerinden alinip alinamayacagi.
   * false ise Serbest Fon vs (SPK nitelikli yatirimci: 10M TL+ net varlik, 2026 ocak guncel).
   * Backend is_tefas_open() heuristic'i ile hesaplanir.
   */
  tefasOpen?: boolean;
  /**
   * BEFAS (Bireysel Emeklilik Fon Alim Satim Platformu) uzerinden alinip alinamayacagi.
   * BES/Emeklilik fonlari icin geçerli — TEFAS'in emeklilik fonlari icin karsiligi.
   */
  befasOpen?: boolean;
  /** Anlik fiyat (NAV / pay degeri) - feed'den gelir, opsiyonel */
  nav?: number;
  /** NAV tarihi (YYYY-MM-DD) */
  navDate?: string;
  day: number;
  week: number;
  month: number;
  threeMonth: number;
  sixMonth: number;
  ytd: number;
  year: number;
  threeYear?: number;
  fiveYear?: number;
}

export interface AgentStatus {
  key: 'news' | 'sentiment' | 'indicator' | 'macro';
  label: string;
  state: 'mock' | 'connecting' | 'live' | 'error';
  description: string;
}
