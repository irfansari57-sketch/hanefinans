import type { Stock } from '@/data/types';

export const STORAGE_LAST_SENT = 'fa.morning.lastSent';

export interface CryptoTA {
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  rangeLow: number;
  rangeHigh: number;
  rsi: number;
  rsiNote: string;
  macdBullish: boolean;
  macdBearish: boolean;
  bollingerLabel: string;
  adxLabel: string;
  adxBullish?: boolean;
  resistance: number;
  support: number;
  resistancePct: number;
  supportPct: number;
}

export interface BistTA {
  stock: Stock;
  rsi?: number;
  rsiNote?: string;
}

export interface IndexTA {
  symbol: string;
  label: string;
  price: number;
  changePct: number;
  rsi?: number;
  rsiNote?: string;
  macdBullish: boolean;
  macdBearish: boolean;
  resistance?: number;
  support?: number;
  resistancePct?: number;
  supportPct?: number;
  bollingerLabel: string;
  adxLabel: string;
  trend: 'yukarı' | 'aşağı' | 'yatay';
  verdict: string;
  emas?: { period: number; value: number; abovePct: number }[]; // fiyatın EMA'ya göre konumu (%)
  ma8?: number; // Günlük SMA8 fiyatı
}
