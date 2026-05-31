/**
 * usePersistedState — useState + localStorage cache.
 *
 * Amaç: Mock veri yerine her zaman SON BILINEN GERCEK veri ile baslat,
 * sonra arka planda fresh veri çekip update et. Kullanici asla mock görmez.
 *
 * Kullanim:
 *   const [macro, setMacro] = usePersistedState<MacroIndicator[]>(
 *     'hf.cache.macro',
 *     30 * 60_000,  // 30dk TTL
 *     [],           // cache yoksa empty (skeleton tetikler)
 *   );
 *   // refresh içinde:
 *   setMacro(freshData);  // hem state hem localStorage guncellenir
 */

import { useCallback, useState } from 'react';

interface CacheEntry<T> {
  data: T;
  ts: number;
  v?: number;  // version — schema değişirse cache invalidate
}

const SCHEMA_VERSION = 1;

export function usePersistedState<T>(
  key: string,
  ttlMs: number,
  fallback: T,
): [T, (value: T) => void, boolean] {
  // initial state — localStorage cache TTL içindeyse kullan
  const [value, setValueRaw] = useState<T>(() => {
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed: CacheEntry<T> = JSON.parse(raw);
      if (parsed.v !== SCHEMA_VERSION) return fallback;
      if (Date.now() - parsed.ts > ttlMs) return fallback;
      return parsed.data;
    } catch {
      return fallback;
    }
  });

  // hidrate edildi mi? — cache hit ise true, fallback ise false (skeleton göster)
  const [hydrated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return false;
      const parsed: CacheEntry<T> = JSON.parse(raw);
      if (parsed.v !== SCHEMA_VERSION) return false;
      if (Date.now() - parsed.ts > ttlMs) return false;
      return true;
    } catch {
      return false;
    }
  });

  const setValue = useCallback((next: T) => {
    setValueRaw(next);
    if (typeof window === 'undefined') return;
    try {
      const entry: CacheEntry<T> = { data: next, ts: Date.now(), v: SCHEMA_VERSION };
      window.localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      /* localStorage full or unavailable — ignore */
    }
  }, [key]);

  return [value, setValue, hydrated];
}
