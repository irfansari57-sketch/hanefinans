// CoinGecko — ücretsiz, no-key, CORS açık. ~10-30 req/dakika limit.

export interface CryptoPrice {
  id: string;
  symbol: string;
  name: string;
  usd: number;
  change24h: number;
  marketCapUsd: number;
}

export interface CryptoMarketGlobal {
  totalMarketCapUsd: number;
  totalVolumeUsd: number;
  btcDominance: number;
  ethDominance: number;
  activeCryptos: number;
}

export interface AltcoinMover {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  volumeUsd: number;
}

const BASE = 'https://api.coingecko.com/api/v3';

interface SimplePriceResponse {
  [coinId: string]: {
    usd: number;
    usd_market_cap: number;
    usd_24h_change: number;
  };
}

const COIN_META: Record<string, { symbol: string; name: string }> = {
  bitcoin: { symbol: 'BTC', name: 'Bitcoin' },
  ethereum: { symbol: 'ETH', name: 'Ethereum' },
  binancecoin: { symbol: 'BNB', name: 'BNB' },
  solana: { symbol: 'SOL', name: 'Solana' },
  cardano: { symbol: 'ADA', name: 'Cardano' },
  ripple: { symbol: 'XRP', name: 'Ripple' },
  dogecoin: { symbol: 'DOGE', name: 'Dogecoin' },
  avalanche2: { symbol: 'AVAX', name: 'Avalanche' },
  polkadot: { symbol: 'DOT', name: 'Polkadot' },
  chainlink: { symbol: 'LINK', name: 'Chainlink' },
};

export async function fetchMajorCryptos(): Promise<CryptoPrice[]> {
  const ids = Object.keys(COIN_META).join(',');
  try {
    const r = await fetch(
      `${BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
    );
    if (!r.ok) return [];
    const j = (await r.json()) as SimplePriceResponse;
    return Object.entries(COIN_META)
      .map(([id, meta]) => {
        const d = j[id];
        if (!d) return null;
        return {
          id,
          symbol: meta.symbol,
          name: meta.name,
          usd: d.usd,
          change24h: d.usd_24h_change,
          marketCapUsd: d.usd_market_cap,
        };
      })
      .filter((x): x is CryptoPrice => !!x);
  } catch {
    return [];
  }
}

export async function fetchGlobal(): Promise<CryptoMarketGlobal | null> {
  try {
    const r = await fetch(`${BASE}/global`);
    if (!r.ok) return null;
    const j = (await r.json()) as {
      data: {
        active_cryptocurrencies: number;
        total_market_cap: { usd: number };
        total_volume: { usd: number };
        market_cap_percentage: { btc: number; eth: number };
      };
    };
    return {
      totalMarketCapUsd: j.data.total_market_cap.usd,
      totalVolumeUsd: j.data.total_volume.usd,
      btcDominance: j.data.market_cap_percentage.btc,
      ethDominance: j.data.market_cap_percentage.eth,
      activeCryptos: j.data.active_cryptocurrencies,
    };
  } catch {
    return null;
  }
}

export interface CryptoOhlc {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

/** CoinGecko OHLC. days: 1, 7, 14, 30, 90, 180, 365 (max). 30 gün önerilir. */
export async function fetchCryptoOhlc(coinId: string, days = 30): Promise<CryptoOhlc[]> {
  try {
    const r = await fetch(`${BASE}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`);
    if (!r.ok) return [];
    const j = (await r.json()) as Array<[number, number, number, number, number]>;
    return j.map((row) => ({
      time: Math.floor(row[0] / 1000),
      open: row[1],
      high: row[2],
      low: row[3],
      close: row[4],
    }));
  } catch {
    return [];
  }
}

/** Coin detayı — market cap, supply, ATH/ATL bilgileri (CryptoDetailPage için). */
export interface CryptoMarketDetail {
  id: string;
  symbol: string;
  name: string;
  marketCapUsd: number;
  marketCapRank: number | null;
  totalVolumeUsd: number;
  circulatingSupply: number;
  totalSupply: number | null;
  maxSupply: number | null;
  athUsd: number;
  athDate: string;
  athChangePct: number;
  atlUsd: number;
  atlDate: string;
  atlChangePct: number;
  fullyDilutedValuationUsd: number | null;
}

interface CoinMarketResponse {
  id: string;
  symbol: string;
  name: string;
  market_cap: number;
  market_cap_rank: number | null;
  total_volume: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_date: string;
  ath_change_percentage: number;
  atl: number;
  atl_date: string;
  atl_change_percentage: number;
  fully_diluted_valuation: number | null;
}

export async function fetchCryptoDetail(coinId: string): Promise<CryptoMarketDetail | null> {
  try {
    const r = await fetch(
      `${BASE}/coins/markets?vs_currency=usd&ids=${coinId}&sparkline=false&price_change_percentage=24h`,
    );
    if (!r.ok) return null;
    const j = (await r.json()) as CoinMarketResponse[];
    if (!j.length) return null;
    const c = j[0];
    return {
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      marketCapUsd: c.market_cap,
      marketCapRank: c.market_cap_rank,
      totalVolumeUsd: c.total_volume,
      circulatingSupply: c.circulating_supply,
      totalSupply: c.total_supply,
      maxSupply: c.max_supply,
      athUsd: c.ath,
      athDate: c.ath_date,
      athChangePct: c.ath_change_percentage,
      atlUsd: c.atl,
      atlDate: c.atl_date,
      atlChangePct: c.atl_change_percentage,
      fullyDilutedValuationUsd: c.fully_diluted_valuation,
    };
  } catch {
    return null;
  }
}

export async function fetchTopAltcoinMovers(limit = 50): Promise<AltcoinMover[]> {
  try {
    const r = await fetch(
      `${BASE}/coins/markets?vs_currency=usd&order=volume_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=24h`,
    );
    if (!r.ok) return [];
    const j = (await r.json()) as Array<{
      id: string;
      symbol: string;
      name: string;
      current_price: number;
      price_change_percentage_24h: number | null;
      total_volume: number;
    }>;
    return j.map((c) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      priceUsd: c.current_price,
      change24h: c.price_change_percentage_24h ?? 0,
      volumeUsd: c.total_volume,
    }));
  } catch {
    return [];
  }
}
