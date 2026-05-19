export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface Stock {
  symbol: string;
  name: string;
  sector?: string;
  price: number;
  changePct: number;
  updatedAt: string;
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
  | 'ABD 10Y Faiz'
  | 'CDS 5Y';

export interface MacroIndicator {
  key: MacroKey;
  label: string;
  value: number;
  changePct?: number;
  unit?: string;
  source: 'live' | 'mock';
  subLabel?: string;
  updatedAt: string;
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
  | 'Katılım';

export interface FundPerformance {
  code: string;
  name?: string;
  category: FundCategory;
  tefas: boolean;
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
