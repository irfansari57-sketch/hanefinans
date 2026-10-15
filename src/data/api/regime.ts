import type { RegimeResult } from '@/lib/regime';

export type RegimeApi = RegimeResult & { ok: true; symbol: string; computedAt: string };

const memo = new Map<string, { t: number; data: RegimeApi }>();
const inflight = new Map<string, Promise<RegimeApi | null>>();
const TTL = 5 * 60_000;

/** /api/bars/regime?symbol= — 5 dk istemci memo, in-flight dedup. */
export async function fetchRegime(symbol = 'XU100'): Promise<RegimeApi | null> {
  const key = symbol.toUpperCase();
  const m = memo.get(key);
  if (m && Date.now() - m.t < TTL) return m.data;
  const f = inflight.get(key);
  if (f) return f;
  const p = (async () => {
    try {
      const r = await fetch(`/api/bars/regime?symbol=${encodeURIComponent(key)}`);
      if (!r.ok) return null;
      const j = (await r.json()) as RegimeApi | { ok: false };
      if (!j.ok) return null;
      memo.set(key, { t: Date.now(), data: j });
      return j;
    } catch { return null; } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}
