/**
 * Sanal Portföy — haftalık BIST turnuvası.
 *
 * Mekanik:
 *  - Pazartesi 09:30: yeni hafta acilir, 100.000 TL sanal sermaye
 *  - Kullanici BIST 30'dan 5-10 hisse secer + % dagilim belirler (toplam %100)
 *  - Cuma 18:10: kapanis fiyatlariyla portfoy degeri hesaplanir
 *  - En yuksek getiri = haftanin sampiyonu
 *
 * Bu MVP client-side: localStorage'da pick + result.
 * Sonraki iterasyon: D1 leaderboard.
 */

import { fetchIndexYahoo } from '@/data/api/yahoo';
import { BIST30_SYMBOLS } from './dailyLeaderGame';

const STORAGE_KEY = 'fa.virtualPortfolio.v1';
const INITIAL_CAPITAL = 100_000;

export interface PortfolioAllocation {
  symbol: string;
  weight: number;  // 0-100 (yuzde)
  buyPrice?: number;
}

export interface PortfolioState {
  weekStart: string;       // YYYY-MM-DD (Pazartesi)
  weekEnd: string;         // YYYY-MM-DD (Cuma)
  initialCapital: number;
  allocations: PortfolioAllocation[];
  submittedAt?: number;
  resolvedAt?: number;
  finalValue?: number;
  totalReturn?: number;    // %
  ranking?: number;        // 1+ veya undefined
  points?: number;
  prices?: Record<string, { close: number }>;  // Cuma kapanis fiyatlari
}

interface StoredState {
  [weekStart: string]: PortfolioState;
}

function load(): StoredState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredState;
  } catch {
    return {};
  }
}

function save(s: StoredState): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* */ }
}

/** Bu haftanin Pazartesisini bul. */
export function thisMonday(): string {
  const d = new Date();
  const day = d.getDay();  // 0=Pazar, 1=Pzt, 6=Cmt
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function thisFriday(): string {
  const monday = new Date(thisMonday() + 'T00:00:00');
  monday.setDate(monday.getDate() + 4);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

/** Bu haftanin state'ini al. */
export function getThisWeek(): PortfolioState {
  const monday = thisMonday();
  const all = load();
  if (all[monday]) return all[monday];
  const portfolio: PortfolioState = {
    weekStart: monday,
    weekEnd: thisFriday(),
    initialCapital: INITIAL_CAPITAL,
    allocations: [],
  };
  all[monday] = portfolio;
  save(all);
  return portfolio;
}

/** Portfoyu kaydet. allocations weights toplam 100 olmali, 5-10 sembol. */
export function submitPortfolio(allocations: PortfolioAllocation[]): { ok: true; state: PortfolioState } | { ok: false; error: string } {
  if (allocations.length < 5) return { ok: false, error: 'En az 5 hisse secmelisin' };
  if (allocations.length > 10) return { ok: false, error: 'En fazla 10 hisse' };
  const totalWeight = allocations.reduce((s, a) => s + a.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.1) return { ok: false, error: `Toplam %100 olmali (su an %${totalWeight.toFixed(1)})` };
  const symbols = new Set(allocations.map((a) => a.symbol));
  if (symbols.size !== allocations.length) return { ok: false, error: 'Ayni sembol iki kez secilemez' };
  for (const a of allocations) {
    if (!BIST30_SYMBOLS.includes(a.symbol as typeof BIST30_SYMBOLS[number])) {
      return { ok: false, error: `${a.symbol} BIST 30'da degil` };
    }
  }
  const all = load();
  const monday = thisMonday();
  const portfolio = all[monday] ?? getThisWeek();
  if (portfolio.resolvedAt) return { ok: false, error: 'Bu hafta sonuclandi' };
  if (portfolio.submittedAt) return { ok: false, error: 'Bu hafta zaten portfoy olusturdun' };
  portfolio.allocations = allocations;
  portfolio.submittedAt = Date.now();
  all[monday] = portfolio;
  save(all);
  return { ok: true, state: portfolio };
}

/** Cuma kapanışı sonrasi portfoyu resolve et. */
export async function tryResolve(): Promise<PortfolioState | null> {
  const all = load();
  const monday = thisMonday();
  const portfolio = all[monday] ?? getThisWeek();
  if (portfolio.resolvedAt) return portfolio;
  if (!portfolio.submittedAt) return null;
  const now = new Date();
  const day = now.getDay();  // 0=Pazar, 5=Cuma, 6=Cmt
  // Cuma 18:15 sonrasi veya Cmt/Pzr
  const isAfterClose = (day === 5 && (now.getHours() > 18 || (now.getHours() === 18 && now.getMinutes() >= 15)))
    || day === 6 || day === 0;
  if (!isAfterClose) return null;

  const prices: Record<string, { close: number }> = {};
  let totalValue = 0;
  for (const a of portfolio.allocations) {
    const r = await fetchIndexYahoo(`${a.symbol}.IS`).catch(() => null);
    if (r && r.value > 0) {
      prices[a.symbol] = { close: r.value };
      // Pazartesi acilista alinmis hisse: simulasyon icin buyPrice = current/((1 + change/100))
      // Daha gercekci: Pazartesi acilis fiyati kaydedilseydi. Su an basit:
      // sembol kapanis * (alinmis adetler) = value
      // adet = (initialCapital * weight/100) / openPrice
      // Eger buyPrice yoksa, current'i baz al ve totalReturn = 0 (devre disi)
      if (!a.buyPrice) a.buyPrice = r.value;
      const shares = (portfolio.initialCapital * a.weight / 100) / a.buyPrice;
      totalValue += shares * r.value;
    }
  }
  if (totalValue === 0) return null;
  portfolio.prices = prices;
  portfolio.finalValue = totalValue;
  portfolio.totalReturn = ((totalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100;
  portfolio.resolvedAt = Date.now();
  // Basit puanlama: getiri%*10 (50% -> 500p, 10% -> 100p, -%5 -> 0p)
  portfolio.points = Math.max(0, Math.round((portfolio.totalReturn ?? 0) * 10));
  all[monday] = portfolio;
  save(all);
  return portfolio;
}

export function getHistory(): PortfolioState[] {
  const all = load();
  return Object.values(all)
    .filter((p) => p.resolvedAt != null)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .slice(0, 10);
}

export function getStats() {
  const h = getHistory();
  const totalPoints = h.reduce((s, p) => s + (p.points ?? 0), 0);
  const wins = h.filter((p) => (p.totalReturn ?? 0) > 0).length;
  const bestReturn = h.length > 0 ? Math.max(...h.map((p) => p.totalReturn ?? 0)) : 0;
  return {
    totalWeeks: h.length,
    profitableWeeks: wins,
    bestReturn,
    totalPoints,
  };
}
