/**
 * Frontend client — /api/tr-10y Pages Function'a istek atar.
 * TR 10Y tahvil getirisi (%) + history. JS-rendered kaynak, cron + jsDelivr CDN.
 */

export interface Tr10yHistoryPoint {
  date: string;
  value: number;
}

export interface Tr10yData {
  ok: boolean;
  value?: number;          // % cinsinden (örn. 28.45)
  unit?: string;           // "%"
  changePct?: number | null;
  changeAbs?: number | null;
  changeWindow?: string | null;
  updatedAt: string;
  asOfDate?: string | null;
  history?: Tr10yHistoryPoint[] | null;
  source: string;
  error?: string;
}

const TTL_MS = 5 * 60_000;
let _cache: { data: Tr10yData; t: number } | null = null;

export async function fetchTr10y(force = false): Promise<Tr10yData | null> {
  if (!force && _cache && Date.now() - _cache.t < TTL_MS) {
    return _cache.data;
  }
  try {
    const r = await fetch('/api/tr-10y', { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null; // Dev sunucu HTML dönüyor
    const data = (await r.json()) as Tr10yData;
    _cache = { data, t: Date.now() };
    return data;
  } catch {
    return null;
  }
}
