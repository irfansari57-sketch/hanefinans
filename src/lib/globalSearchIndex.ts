/**
 * Global arama indeksi — hisse + fon + emtia + döviz + kripto.
 * Layout header'daki arama input'una beslenir. Her tip için doğru detay
 * route'una yönlendirir.
 *
 * Not: Fonlar TEFAS feed'inden asenkron yüklenir. Diğerleri statik.
 */

import { BIST_UNIQUE } from '@/data/bistAll';
import { FOREX_SYMBOLS } from '@/data/forexSymbols';

export type SearchKind = 'stock' | 'fund' | 'commodity' | 'forex' | 'crypto' | 'index';

export interface SearchItem {
  kind: SearchKind;
  symbol: string;        // detay route'unda kullanılacak sembol
  label: string;         // gösterim (kısa)
  name: string;          // uzun isim
  sector?: string;       // sektör/kategori
  route: string;         // navigate hedefi
  flag?: string;         // ülke bayrağı (döviz için)
}

// ---- Statik emtia listesi ----
const COMMODITIES: SearchItem[] = [
  { kind: 'commodity', symbol: 'XAUUSD=X', label: 'Ons Altın', name: 'Ons Altın (USD)', sector: 'Kıymetli Metal', route: `/emtia/${encodeURIComponent('XAUUSD=X')}` },
  { kind: 'commodity', symbol: 'XAUUSD=X-gram', label: 'Gram Altın', name: 'Gram Altın (TL)', sector: 'Kıymetli Metal', route: `/emtia/${encodeURIComponent('XAUUSD=X')}?u=gram` },
  { kind: 'commodity', symbol: 'XAGUSD=X', label: 'Ons Gümüş', name: 'Ons Gümüş (USD)', sector: 'Kıymetli Metal', route: `/emtia/${encodeURIComponent('XAGUSD=X')}` },
  { kind: 'commodity', symbol: 'XAGUSD=X-gram', label: 'Gram Gümüş', name: 'Gram Gümüş (TL)', sector: 'Kıymetli Metal', route: `/emtia/${encodeURIComponent('XAGUSD=X')}?u=gram` },
  { kind: 'commodity', symbol: 'XPTUSD=X', label: 'Ons Platin', name: 'Ons Platin (USD)', sector: 'Kıymetli Metal', route: `/emtia/${encodeURIComponent('XPTUSD=X')}` },
  { kind: 'commodity', symbol: 'XPTUSD=X-gram', label: 'Gram Platin', name: 'Gram Platin (TL)', sector: 'Kıymetli Metal', route: `/emtia/${encodeURIComponent('XPTUSD=X')}?u=gram` },
  { kind: 'commodity', symbol: 'BZ=F', label: 'Brent', name: 'Brent Petrol', sector: 'Enerji', route: `/emtia/${encodeURIComponent('BZ=F')}` },
];

// ---- Statik kripto listesi (temel coinler) ----
const CRYPTOS: SearchItem[] = [
  { kind: 'crypto', symbol: 'BTC', label: 'BTC', name: 'Bitcoin', sector: 'Kripto', route: '/crypto/BTC' },
  { kind: 'crypto', symbol: 'ETH', label: 'ETH', name: 'Ethereum', sector: 'Kripto', route: '/crypto/ETH' },
  { kind: 'crypto', symbol: 'XRP', label: 'XRP', name: 'Ripple', sector: 'Kripto', route: '/crypto/XRP' },
  { kind: 'crypto', symbol: 'DOGE', label: 'DOGE', name: 'Dogecoin', sector: 'Kripto', route: '/crypto/DOGE' },
  { kind: 'crypto', symbol: 'SOL', label: 'SOL', name: 'Solana', sector: 'Kripto', route: '/crypto/SOL' },
  { kind: 'crypto', symbol: 'ADA', label: 'ADA', name: 'Cardano', sector: 'Kripto', route: '/crypto/ADA' },
  { kind: 'crypto', symbol: 'BNB', label: 'BNB', name: 'Binance Coin', sector: 'Kripto', route: '/crypto/BNB' },
];

// ---- BIST endeksleri ----
const INDICES: SearchItem[] = [
  { kind: 'index', symbol: 'XU100', label: 'BIST 100', name: 'BIST 100 Endeksi', sector: 'Endeks', route: '/stock/XU100' },
  { kind: 'index', symbol: 'XU030', label: 'BIST 30', name: 'BIST 30 Endeksi', sector: 'Endeks', route: '/stock/XU030' },
];

/**
 * Statik + hisse indeksi. Fonlar dinamik olarak eklenir (setFunds ile).
 * Layout mount olunca TEFAS feed yüklenip global list güncellenir.
 */
let _funds: SearchItem[] = [];

/** Fonlar TEFAS'tan async yüklendikçe çağrılır. */
export function setFundIndex(funds: Array<{ code: string; name?: string; category?: string }>): void {
  _funds = funds.map((f) => ({
    kind: 'fund' as const,
    symbol: f.code,
    label: f.code,
    name: f.name ?? f.code,
    sector: f.category ?? 'Fon',
    route: `/fund/${encodeURIComponent(f.code)}`,
  }));
}

/** Hisseler statik (BIST_UNIQUE). */
function getStocks(): SearchItem[] {
  return BIST_UNIQUE.map((s) => ({
    kind: 'stock' as const,
    symbol: s.symbol,
    label: s.symbol,
    name: s.name,
    sector: s.sector,
    route: `/stock/${encodeURIComponent(s.symbol)}`,
  }));
}

/** Döviz statik (FOREX_SYMBOLS). */
function getForex(): SearchItem[] {
  return FOREX_SYMBOLS.map((f) => ({
    kind: 'forex' as const,
    symbol: f.symbol,
    label: f.label,
    name: f.name,
    sector: 'Döviz',
    route: `/doviz/${encodeURIComponent(f.symbol)}`,
    flag: f.flag,
  }));
}

/**
 * Global arama — query'i tüm tiplerde arar, alaka sırasına göre döner.
 * Alaka: exact match > symbol prefix > name contains > label contains.
 */
export function searchGlobal(query: string, limit = 12): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];

  const all: SearchItem[] = [
    ...INDICES,
    ...getStocks(),
    ..._funds,
    ...COMMODITIES,
    ...getForex(),
    ...CRYPTOS,
  ];

  interface Scored {
    item: SearchItem;
    score: number;
  }

  const scored: Scored[] = [];
  for (const item of all) {
    const sym = item.symbol.toLowerCase();
    const label = item.label.toLowerCase();
    const name = item.name.toLowerCase();

    let score = 0;
    if (sym === q || label === q) score = 100; // exact
    else if (sym.startsWith(q) || label.startsWith(q)) score = 80; // prefix
    else if (name.startsWith(q)) score = 60;
    else if (sym.includes(q) || label.includes(q)) score = 40;
    else if (name.includes(q)) score = 25;
    else continue;

    // Endeks ve popüler tiplere ufak bonus (arama üstünde görünsün)
    if (item.kind === 'index') score += 10;
    if (item.kind === 'stock' && sym === q) score += 5;

    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

/** UI'da tip badge'i için renk sınıfı döner. */
export function kindBadge(kind: SearchKind): { label: string; className: string } {
  switch (kind) {
    case 'stock':     return { label: 'Hisse',   className: 'bg-emerald-500/15 text-emerald-400' };
    case 'fund':      return { label: 'Fon',     className: 'bg-blue-500/15 text-blue-400' };
    case 'commodity': return { label: 'Emtia',   className: 'bg-amber-500/15 text-amber-400' };
    case 'forex':     return { label: 'Döviz',   className: 'bg-purple-500/15 text-purple-400' };
    case 'crypto':    return { label: 'Kripto',  className: 'bg-orange-500/15 text-orange-400' };
    case 'index':     return { label: 'Endeks',  className: 'bg-cyan-500/15 text-cyan-400' };
  }
}
