import type { MacroIndicator } from './types';
import { MOCK_MACRO_FALLBACK } from './mock';

interface FrankfurterLatest {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

const CACHE_KEY = 'fa.macro.cache.v1';
const CACHE_TTL_MS = 60_000; // 60 saniye

interface CacheEntry {
  fetchedAt: number;
  payload: MacroIndicator[];
}

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload: MacroIndicator[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), payload }));
  } catch {
    /* ignore */
  }
}

async function fetchUsdTry(): Promise<{ value: number; changePct?: number } | null> {
  try {
    // Bugün ve dünün kurlarını alıp değişimi hesapla
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yIso = yesterday.toISOString().slice(0, 10);

    const [latestRes, prevRes] = await Promise.all([
      fetch('https://api.frankfurter.app/latest?from=USD&to=TRY'),
      fetch(`https://api.frankfurter.app/${yIso}?from=USD&to=TRY`),
    ]);
    if (!latestRes.ok) return null;
    const latest = (await latestRes.json()) as FrankfurterLatest;
    const value = latest.rates['TRY'];
    if (!value) return null;
    let changePct: number | undefined;
    if (prevRes.ok) {
      const prev = (await prevRes.json()) as FrankfurterLatest;
      const prevValue = prev.rates['TRY'];
      if (prevValue) changePct = ((value - prevValue) / prevValue) * 100;
    }
    return { value, changePct };
  } catch {
    return null;
  }
}

async function fetchEurTry(): Promise<{ value: number; changePct?: number } | null> {
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yIso = yesterday.toISOString().slice(0, 10);
    const [latestRes, prevRes] = await Promise.all([
      fetch('https://api.frankfurter.app/latest?from=EUR&to=TRY'),
      fetch(`https://api.frankfurter.app/${yIso}?from=EUR&to=TRY`),
    ]);
    if (!latestRes.ok) return null;
    const latest = (await latestRes.json()) as FrankfurterLatest;
    const value = latest.rates['TRY'];
    if (!value) return null;
    let changePct: number | undefined;
    if (prevRes.ok) {
      const prev = (await prevRes.json()) as FrankfurterLatest;
      const prevValue = prev.rates['TRY'];
      if (prevValue) changePct = ((value - prevValue) / prevValue) * 100;
    }
    return { value, changePct };
  } catch {
    return null;
  }
}

export async function loadMacro(): Promise<MacroIndicator[]> {
  const cached = readCache();
  if (cached) return cached.payload;

  const base: MacroIndicator[] = MOCK_MACRO_FALLBACK.map((m) => ({ ...m }));

  const [usd, eur] = await Promise.all([fetchUsdTry(), fetchEurTry()]);
  const nowIso = new Date().toISOString();

  if (usd) {
    const i = base.findIndex((m) => m.key === 'USD/TRY');
    if (i >= 0) base[i] = { ...base[i], value: usd.value, changePct: usd.changePct, source: 'live', updatedAt: nowIso };
  }
  if (eur) {
    const i = base.findIndex((m) => m.key === 'EUR/TRY');
    if (i >= 0) base[i] = { ...base[i], value: eur.value, changePct: eur.changePct, source: 'live', updatedAt: nowIso };
  }

  writeCache(base);
  return base;
}

export async function refreshMacro(): Promise<MacroIndicator[]> {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  return loadMacro();
}
