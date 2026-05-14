export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface Stock {
  symbol: string; // ör. THYAO
  name: string;   // ör. Türk Hava Yolları
  sector?: string;
  price: number;   // TL
  changePct: number; // %
  updatedAt: string; // ISO
}

export type NewsSource = 'KAP' | 'Reuters' | 'Bloomberg' | 'Diğer';

export interface NewsItem {
  id: string;
  source: NewsSource;
  symbols: string[];
  importance: number; // 0-10
  title: string;
  summary: string;
  publishedAt: string; // ISO
  url?: string;
}

export type MacroKey =
  | 'USD/TRY'
  | 'EUR/TRY'
  | 'BIST 100'
  | 'BIST 30'
  | 'Politika Faizi'
  | 'Brent'
  | 'Gram Altın'
  | 'Gram Gümüş'
  | 'Gram Platin'
  | 'Ons Altın'
  | 'Ons Gümüş'
  | 'Ons Platin'
  | 'VIX'
  | 'CDS 5Y';

export interface MacroIndicator {
  key: MacroKey;
  label: string; // gösterim adı
  value: number;
  changePct?: number; // değişim %
  unit?: string; // ör. "$", "₺", "%"
  source: 'live' | 'mock';
  subLabel?: string; // ör. "TCMB"
  updatedAt: string; // ISO
}

export type MarketEventType = 'cpi' | 'rate-decision' | 'fomc' | 'earnings' | 'data' | 'other';

export interface MarketEvent {
  id: string;
  title: string;
  type: MarketEventType;
  country: 'TR' | 'US' | 'EU' | 'GLOBAL';
  date: string; // ISO yyyy-mm-dd
  importance: number; // 1-3
}

export interface SentimentMention {
  symbol: string;
  count: number;
  sentiment: Sentiment;
  lastChange?: number; // son 1 saat değişim
}

export type FundCategory =
  | 'Para Piyasası'
  | 'Serbest'
  | 'Hisse Senedi'
  | 'Değişken'
  | 'Fon Sepeti'
  | 'Kıymetli Madenler'
  | 'Borçlanma Araçları'
  | 'Katılım';

export interface FundPerformance {
  code: string;
  name?: string;
  category: FundCategory;
  tefas: boolean;
  day: number;       // %
  week: number;      // %
  month: number;     // %
  threeMonth: number; // %
  sixMonth: number;  // %
  ytd: number;       // %
  year: number;      // %
  threeYear?: number;
  fiveYear?: number;
}

export interface AgentStatus {
  key: 'news' | 'sentiment' | 'indicator' | 'macro';
  label: string;
  state: 'mock' | 'connecting' | 'live' | 'error';
  description: string;
}
