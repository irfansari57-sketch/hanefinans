/**
 * Watchlist Cloud Sync — Zustand `useWatchlist` icin D1 layer.
 *
 * Flow (Layout.tsx login effect'inde tetiklenir):
 *  1) Login sonrasi: cloudFetch → sonuc bos + local doluysa migrate → cloud'dan tekrar cek
 *  2) Store'daki symbols'u cloud snapshot ile senkronize et (cloud authoritative)
 *
 * Anonim kullanicilar: localStorage kalir, cloud API'ye deginmez (401 sessiz gecer).
 *
 * Portfoy sync ile ayni desen (data/portfolioSync.ts kucultulmus versiyonu).
 */

export interface CloudWatchItem {
  id: number;
  symbol: string;
  kind: 'stock' | 'fund' | 'crypto';
  note: string | null;
  added_at: number;
  position: number;
}

interface CloudListResp {
  ok: boolean;
  items?: CloudWatchItem[];
  error?: string;
}

/** GET /api/watchlist — kullanicinin cloud listesi */
export async function cloudFetchWatchlist(): Promise<CloudWatchItem[]> {
  try {
    const r = await fetch('/api/watchlist', { credentials: 'include' });
    if (!r.ok) return [];
    const json = (await r.json()) as CloudListResp;
    return json.items ?? [];
  } catch {
    return [];
  }
}

/** POST /api/watchlist (tek sembol ekle) */
export async function cloudAddWatch(symbol: string, kind: 'stock' | 'fund' | 'crypto' = 'stock'): Promise<boolean> {
  try {
    const r = await fetch('/api/watchlist', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, kind }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** DELETE /api/watchlist?symbol=X */
export async function cloudRemoveWatch(symbol: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * POST /api/watchlist?mode=replace — tum listeyi cloud'a yaz (migrasyon icin).
 * Anonim kullanicinin localStorage'daki listesi ilk login'de cloud'a tasinir.
 */
export async function cloudReplaceWatchlist(symbols: string[]): Promise<boolean> {
  try {
    const r = await fetch('/api/watchlist?mode=replace', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
