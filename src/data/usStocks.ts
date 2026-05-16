// ABD borsa sembolleri — UsMarketsPage + StockDetailPage ortak kullanır.
// NYSE/NASDAQ büyük başlıkları + büyüme + sektör liderleri.

export interface UsStockMeta {
  symbol: string;
  name: string;
  sector: string;
  exchange: 'NYSE' | 'NASDAQ';
}

export const US_STOCKS: UsStockMeta[] = [
  { symbol: 'NVDA',  name: 'NVIDIA',              sector: 'AI / Chips',          exchange: 'NASDAQ' },
  { symbol: 'AAPL',  name: 'Apple',               sector: 'Teknoloji',           exchange: 'NASDAQ' },
  { symbol: 'MSFT',  name: 'Microsoft',           sector: 'Bulut / AI',          exchange: 'NASDAQ' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)',   sector: 'AI / Reklam',         exchange: 'NASDAQ' },
  { symbol: 'AMZN',  name: 'Amazon',              sector: 'E-ticaret / Bulut',   exchange: 'NASDAQ' },
  { symbol: 'META',  name: 'Meta Platforms',      sector: 'Sosyal Medya',        exchange: 'NASDAQ' },
  { symbol: 'TSLA',  name: 'Tesla',               sector: 'Elektrikli Araç',     exchange: 'NASDAQ' },
  { symbol: 'AMD',   name: 'AMD',                 sector: 'Chips',               exchange: 'NASDAQ' },
  { symbol: 'AVGO',  name: 'Broadcom',            sector: 'Chips',               exchange: 'NASDAQ' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway',  sector: 'Yatırım',             exchange: 'NYSE' },
  { symbol: 'JPM',   name: 'JPMorgan Chase',      sector: 'Bankacılık',          exchange: 'NYSE' },
  { symbol: 'V',     name: 'Visa',                sector: 'Ödeme Sistemi',       exchange: 'NYSE' },
  { symbol: 'MA',    name: 'Mastercard',          sector: 'Ödeme Sistemi',       exchange: 'NYSE' },
  { symbol: 'UNH',   name: 'UnitedHealth',        sector: 'Sağlık',              exchange: 'NYSE' },
  { symbol: 'LLY',   name: 'Eli Lilly',           sector: 'İlaç',                exchange: 'NYSE' },
  { symbol: 'NFLX',  name: 'Netflix',             sector: 'Medya',               exchange: 'NASDAQ' },
  { symbol: 'DIS',   name: 'Walt Disney',         sector: 'Medya',               exchange: 'NYSE' },
  { symbol: 'WMT',   name: 'Walmart',             sector: 'Perakende',           exchange: 'NYSE' },
  { symbol: 'COST',  name: 'Costco',              sector: 'Perakende',           exchange: 'NASDAQ' },
  { symbol: 'XOM',   name: 'Exxon Mobil',         sector: 'Enerji',              exchange: 'NYSE' },
];

export function findUsStock(symbol: string): UsStockMeta | undefined {
  const s = symbol.toUpperCase();
  return US_STOCKS.find((x) => x.symbol === s);
}
