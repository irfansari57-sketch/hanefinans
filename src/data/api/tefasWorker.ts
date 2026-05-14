// TEFAS Cloudflare Worker client.
// Worker URL .env.local'a VITE_TEFAS_WORKER_URL olarak yazılır.
// Boşsa null fonksiyonlar döner → frontend mock'a düşer.

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const WORKER_URL = (env.VITE_TEFAS_WORKER_URL ?? '').replace(/\/$/, '').trim();

export interface TefasFundDetail {
  code: string;
  fundName?: string;
  nav?: number;
  perf?: Record<string, number>; // ör. "1 Ay": 14.87
  allocation?: Array<{ label: string; pct: number }>;
  fetchedAt?: string;
  fromCache?: boolean;
}

export const isTefasWorkerConfigured = () => !!WORKER_URL;

export async function fetchTefasFund(code: string): Promise<TefasFundDetail | null> {
  if (!WORKER_URL) return null;
  try {
    const r = await fetch(`${WORKER_URL}/fund/${encodeURIComponent(code.toUpperCase())}`);
    if (!r.ok) return null;
    return (await r.json()) as TefasFundDetail;
  } catch {
    return null;
  }
}

export interface TefasTopFund {
  code: string;
  name?: string;
  day?: number;
}

export async function fetchTefasTopFunds(limit = 50): Promise<TefasTopFund[]> {
  if (!WORKER_URL) return [];
  try {
    const r = await fetch(`${WORKER_URL}/funds/top?limit=${limit}`);
    if (!r.ok) return [];
    const j = (await r.json()) as { data: TefasTopFund[] };
    return j.data ?? [];
  } catch {
    return [];
  }
}
