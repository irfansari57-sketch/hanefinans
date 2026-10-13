import { useEffect, useState } from 'react';
import { KATILIM_STATIC, KATILIM_INDEX_NAMES, type KatilimIndex } from '@/data/katilim';

/**
 * BIST Katılım endeksi üyelikleri — canlı /api/bist/katilim, düşerse statik yedek.
 * Modül düzeyinde tek fetch; tüm sayfalar aynı haritayı paylaşır.
 */
export type KatilimMap = Record<string, KatilimIndex[]>;

let memo: { map: KatilimMap; source: 'live' | 'static' } | null = null;
let inFlight: Promise<{ map: KatilimMap; source: 'live' | 'static' }> | null = null;

async function loadKatilim(): Promise<{ map: KatilimMap; source: 'live' | 'static' }> {
  if (memo) return memo;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const r = await fetch('/api/bist/katilim');
      if (r.ok) {
        const j = (await r.json()) as { ok?: boolean; symbols?: Record<string, string[]> };
        if (j.ok && j.symbols && Object.keys(j.symbols).length >= 50) {
          memo = { map: j.symbols as KatilimMap, source: 'live' };
          return memo;
        }
      }
    } catch { /* statik yedek */ }
    memo = { map: KATILIM_STATIC, source: 'static' };
    return memo;
  })();
  try { return await inFlight; } finally { inFlight = null; }
}

export function useKatilim(): { map: KatilimMap; source: 'live' | 'static' | 'loading' } {
  const [state, setState] = useState<{ map: KatilimMap; source: 'live' | 'static' | 'loading' }>(
    () => memo ?? { map: KATILIM_STATIC, source: 'loading' },
  );
  useEffect(() => {
    let alive = true;
    loadKatilim().then((r) => { if (alive) setState(r); });
    return () => { alive = false; };
  }, []);
  return state;
}

/** Sembolün üye olduğu katılım endekslerinin okunur adları (tooltip için). */
export function katilimLabel(indices: KatilimIndex[] | undefined): string | null {
  if (!indices || indices.length === 0) return null;
  return indices.map((i) => KATILIM_INDEX_NAMES[i] ?? i).join(' · ');
}
