/**
 * Frontend client — /api/tr-cds Pages Function'a istek atar.
 * Türkiye 5Y CDS spread (bps) + history.
 * Yahoo'da yok, scrape kaynaklı, edge cache 30 dk.
 */

export interface TrCdsHistoryPoint {
  date: string;   // yyyy-mm-dd
  value: number;  // bps
}

export interface TrCdsData {
  ok: boolean;
  value?: number;
  changePct?: number;
  changeAbs?: number;
  updatedAt: string;
  asOfDate?: string;
  history?: TrCdsHistoryPoint[];
  source: string;
  error?: string;
}

const TTL_MS = 5 * 60_000;
let _cache: { data: TrCdsData; t: number } | null = null;

/**
 * Türkiye 5Y CDS spread'i çek. Frontend tarafında 5 dakikalık in-memory cache.
 * Dev sunucuda (npm run dev) Pages Functions yoksa null döner — UI graceful fallback.
 */
export async function fetchTrCds(force = false): Promise<TrCdsData | null> {
  if (!force && _cache && Date.now() - _cache.t < TTL_MS) {
    return _cache.data;
  }
  try {
    const r = await fetch('/api/tr-cds', { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      // Dev sunucu HTML dönüyor (Pages Functions yok)
      return null;
    }
    const data = (await r.json()) as TrCdsData;
    if (!data.ok) {
      // Sunucu hata döndü ama yanıt geçerli — caller error mesajı için data alsın
      _cache = { data, t: Date.now() };
      return data;
    }
    _cache = { data, t: Date.now() };
    return data;
  } catch {
    return null;
  }
}

/** "tıklanır kart" için sınıf kararı — render bir başka yerde yapılır, sadece util. */
export function cdsToneClass(changePct?: number): 'success' | 'danger' | 'slate' {
  if (changePct == null) return 'slate';
  // CDS düşmesi olumlu (risk priminin düşmesi)
  if (changePct < -0.5) return 'success';
  if (changePct > 0.5) return 'danger';
  return 'slate';
}
