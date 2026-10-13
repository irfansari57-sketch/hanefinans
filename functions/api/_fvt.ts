/**
 * Ortak FVT (fvt.com.tr) fetch yardımcıları.
 *
 * 13 Eki 2026 denetimi: FVT header'ları 7 dosyada elle kopyalanmıştı ve hiçbir
 * FVT çağrısında timeout yoktu. Tek yerden yönetmek için bu modül.
 *
 * NOT: fvt.com.tr resmi olmayan bir kaynak; lisans riski yüksek. Orta vadede
 * resmi veri dağıtım lisansına geçilmesi planlanıyor (bkz. denetim raporu §4).
 */

export const FVT_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  Referer: 'https://fvt.com.tr/',
  Origin: 'https://fvt.com.tr',
};

export const FVT_TIMEOUT_MS = 8000;

/** Timeout'lu fetch — abort olursa null döner, exception fırlatmaz. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FVT_TIMEOUT_MS,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** FVT JSON — `success:true` ve `data` varsa döner, aksi halde null. */
export async function fvtJson<T = unknown>(url: string, timeoutMs = FVT_TIMEOUT_MS): Promise<T | null> {
  const r = await fetchWithTimeout(url, { headers: FVT_HEADERS }, timeoutMs);
  if (!r || !r.ok) return null;
  try {
    const j = (await r.json()) as { success?: boolean; data?: T };
    if (j.success === false || j.data === undefined) return null;
    return j.data;
  } catch {
    return null;
  }
}

/** BIST seans saati (TR = UTC+3, DST yok) — TTL kararları için. Tatil bilgisi yok. */
export function isBistSessionUtc(now = new Date()): boolean {
  const h = now.getUTCHours();
  const d = now.getUTCDay();
  return d >= 1 && d <= 5 && h >= 6 && h <= 15; // 09:00–18:59 TR
}
