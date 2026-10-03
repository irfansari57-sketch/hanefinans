/**
 * Panel aggregator client — /api/panel/snapshot CF Function proxy.
 *
 * Bu modul PanelPage'in `refresh()` fonksiyonunu INSTANT'a yaklastirir:
 *   - Tek fetch (ag edge hit ~100-200ms, miss ~1-2s)
 *   - Snapshot + news + spotMetals + bistChart + crypto hepsi bir arada
 *   - In-flight dedup + in-memory TTL cache (30sn)
 *   - SWR: expire olsa bile stale veri hemen doner, arka planda yeni fetch
 *
 * Fail-safe: aggregator fail olursa null doner, PanelPage mevcut sub-endpoint'lere
 * dusup (loadStocks, loadMacroAll, loadNews) eski davranisi korur.
 */

export interface PanelSnapshotPayload {
  ok: boolean;
  updatedAt: string;
  snapshot: unknown | null;      // yahoo/snapshot response
  news: unknown | null;          // news/index response
  spotMetals: unknown | null;    // spot-metals response
  bistChart: unknown | null;     // isyatirim/chart response
  crypto: unknown | null;        // yahoo/snapshot?symbols=BTC-USD,... response
}

interface MemoEntry {
  at: number;
  data: PanelSnapshotPayload;
}

let memo: MemoEntry | null = null;
let inFlight: Promise<PanelSnapshotPayload | null> | null = null;
const TTL_MS = 30_000;           // 30s fresh — ayni client auto-refresh ile uyumlu
const STALE_MAX_MS = 60 * 60_000; // 1h — asla sonsuz stale servis etme

/**
 * Panel aggregator'dan taze snapshot cek — in-memory cache + in-flight dedup ile.
 *
 * Oncelik:
 *   1. memo (son 30sn) → anlik return
 *   2. memo (30sn-1sa arasi stale) → stale return + background revalidate (SWR)
 *   3. in-flight → mevcut promise'i bekle
 *   4. yeni fetch
 */
export async function loadPanelSnapshot(opts?: { force?: boolean }): Promise<PanelSnapshotPayload | null> {
  const now = Date.now();

  // 1. Fresh memo hit
  if (!opts?.force && memo && now - memo.at < TTL_MS) {
    return memo.data;
  }

  // 2. Stale memo + background revalidate (SWR)
  if (!opts?.force && memo && now - memo.at < STALE_MAX_MS) {
    if (!inFlight) {
      // Background refresh — don't await
      inFlight = fetchFresh();
      inFlight.finally(() => { inFlight = null; });
    }
    return memo.data; // stale ama kullanilabilir
  }

  // 3. In-flight dedup — ayni anda baska bir cagri varsa onu bekle
  if (inFlight) return inFlight;

  // 4. Fresh fetch
  inFlight = fetchFresh();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

async function fetchFresh(): Promise<PanelSnapshotPayload | null> {
  try {
    const r = await fetch('/api/panel/snapshot', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as PanelSnapshotPayload;
    if (!j.ok) return null;
    memo = { at: Date.now(), data: j };
    return j;
  } catch {
    return null;
  }
}

/** Dev/debug: cache'i temizle */
export function clearPanelSnapshotCache(): void {
  memo = null;
  inFlight = null;
}
