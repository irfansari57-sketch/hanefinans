// Kripto sembol metadata + Yahoo / CoinGecko id eşleştirmesi.
// /crypto/:symbol rotası ve CryptoPage kartları bunu kullanır.

export interface CryptoMeta {
  symbol: string;       // BTC, ETH, vs.
  name: string;
  coingeckoId: string;  // bitcoin, ethereum, vs.
  yahoo: string;        // BTC-USD, ETH-USD (Yahoo Finance ticker)
  category: 'L1 Blockchain' | 'L2 / Scaling' | 'DeFi' | 'Stablecoin' | 'Meme' | 'Smart Contract' | 'Storage' | 'Oracle' | 'Privacy';
}

export const CRYPTOS: CryptoMeta[] = [
  { symbol: 'BTC',  name: 'Bitcoin',       coingeckoId: 'bitcoin',      yahoo: 'BTC-USD',  category: 'L1 Blockchain' },
  { symbol: 'ETH',  name: 'Ethereum',      coingeckoId: 'ethereum',     yahoo: 'ETH-USD',  category: 'Smart Contract' },
  { symbol: 'BNB',  name: 'BNB',           coingeckoId: 'binancecoin',  yahoo: 'BNB-USD',  category: 'Smart Contract' },
  { symbol: 'SOL',  name: 'Solana',        coingeckoId: 'solana',       yahoo: 'SOL-USD',  category: 'Smart Contract' },
  { symbol: 'XRP',  name: 'Ripple',        coingeckoId: 'ripple',       yahoo: 'XRP-USD',  category: 'L1 Blockchain' },
  { symbol: 'ADA',  name: 'Cardano',       coingeckoId: 'cardano',      yahoo: 'ADA-USD',  category: 'Smart Contract' },
  { symbol: 'DOGE', name: 'Dogecoin',      coingeckoId: 'dogecoin',     yahoo: 'DOGE-USD', category: 'Meme' },
  { symbol: 'AVAX', name: 'Avalanche',     coingeckoId: 'avalanche-2',  yahoo: 'AVAX-USD', category: 'Smart Contract' },
  { symbol: 'DOT',  name: 'Polkadot',      coingeckoId: 'polkadot',     yahoo: 'DOT-USD',  category: 'L1 Blockchain' },
  { symbol: 'LINK', name: 'Chainlink',     coingeckoId: 'chainlink',    yahoo: 'LINK-USD', category: 'Oracle' },
  { symbol: 'MATIC',name: 'Polygon',       coingeckoId: 'matic-network',yahoo: 'MATIC-USD',category: 'L2 / Scaling' },
  { symbol: 'TRX',  name: 'Tron',          coingeckoId: 'tron',         yahoo: 'TRX-USD',  category: 'Smart Contract' },
  { symbol: 'LTC',  name: 'Litecoin',      coingeckoId: 'litecoin',     yahoo: 'LTC-USD',  category: 'L1 Blockchain' },
];

export function findCrypto(symbol: string): CryptoMeta | undefined {
  const s = symbol.toUpperCase();
  return CRYPTOS.find((c) => c.symbol === s);
}
