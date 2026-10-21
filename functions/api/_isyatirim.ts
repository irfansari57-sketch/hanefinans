/**
 * İş Yatırım toplu hisse feed'i (21 Eki 2026).
 *
 * Neden: fvt.com.tr 19 Eki 2026'dan itibaren API'sini kapattı (401 BLOCKED /
 * 429; frontend'i kısa ömürlü app-token ile çalışıyor). Bu erişim kontrolünü
 * aşmıyoruz. BIST geneli günlük veri için İş Yatırım'ın herkese açık "Günlük
 * Hisse Senedi Fiyatları" sayfası kullanılır — sunucu tarafında render edilen
 * tek tablo (~630 hisse; Son Fiyat, Değişim %, Değişim TL, Hacim). ~15 dk gecikmeli.
 *
 * Tek istek ≈ 750 KB; edge cache seans içinde 60 sn, dışında 10 dk → İş Yatırım'a
 * dakikada en fazla 1 istek gider.
 */

const PAGE_URL = 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/default.aspx';

export interface IsYatirimRow {
  symbol: string;
  name?: string;
  price: number;
  changePct: number;
  changeTl: number | null;
  volumeTl: number | null;
  volumeLots: number | null;
}

export interface IsYatirimAll {
  rows: IsYatirimRow[];
  /** Sayfadaki saat damgası (TR), ör. "10:49:00" — yoksa null */
  pageTime: string | null;
  fetchedAt: number;
}

/** "1.234,56" → 1234.56 ; "-6,41" → -6.41 */
function trNum(s: string): number {
  const t = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;|​/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseIsYatirimPage(html: string): IsYatirimAll {
  // Adlar: <option value="AKBNK">AKBNK | Akbank</option>
  const names = new Map<string, string>();
  const optRe = /<option\s+value="([A-Z0-9]{2,6})">\s*[A-Z0-9]{2,6}\s*\|\s*([^<]+)<\/option>/g;
  let m: RegExpExecArray | null;
  while ((m = optRe.exec(html)) !== null) names.set(m[1], m[2].trim());

  // Tablo: data-csvname="tumhisse" ... </table>
  const tStart = html.indexOf('data-csvname="tumhisse"');
  const tEnd = tStart >= 0 ? html.indexOf('</table>', tStart) : -1;
  const table = tStart >= 0 && tEnd > tStart ? html.slice(tStart, tEnd) : '';
  const rows: IsYatirimRow[] = [];
  const trRe = /<tr>([\s\S]*?)<\/tr>/g;
  while ((m = trRe.exec(table)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => stripTags(c[1]));
    if (cells.length < 3) continue;
    const symbol = cells[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z0-9]{2,6}$/.test(symbol)) continue;
    const price = trNum(cells[1]);
    const changePct = trNum(cells[2]);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(changePct)) continue;
    const changeTl = cells[3] != null ? trNum(cells[3]) : NaN;
    const volumeTl = cells[4] != null ? trNum(cells[4]) : NaN;
    const volumeLots = cells[5] != null ? trNum(cells[5]) : NaN;
    rows.push({
      symbol,
      name: names.get(symbol),
      price,
      changePct,
      changeTl: Number.isFinite(changeTl) ? changeTl : null,
      volumeTl: Number.isFinite(volumeTl) ? volumeTl : null,
      volumeLots: Number.isFinite(volumeLots) ? volumeLots : null,
    });
  }
  const timeM = html.match(/(\d{2}:\d{2}:\d{2})/);
  return { rows, pageTime: timeM ? timeM[1] : null, fetchedAt: Date.now() };
}

export function isBistSessionNowUtc(now = new Date()): boolean {
  const h = now.getUTCHours();
  const d = now.getUTCDay();
  return d >= 1 && d <= 5 && h >= 6 && h <= 15; // 09:00–18:59 TR
}

/**
 * Toplu feed — edge cache'li. Hata/az satır (<300) → null (cache'e yazılmaz).
 * waitUntil verilirse cache.put arka planda tamamlanır (verilmezse put düşebilir).
 */
export async function fetchIsYatirimAll(waitUntil?: (p: Promise<unknown>) => void): Promise<IsYatirimAll | null> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request('https://investliq.com/__cache/isyatirim-all?cv=1', { method: 'GET' });
  try {
    const hit = await cache.match(key);
    if (hit && hit.ok) return (await hit.json()) as IsYatirimAll;
  } catch { /* cache yoksa devam */ }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  let html = '';
  try {
    const r = await fetch(PAGE_URL, {
      signal: ctrl.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    if (!r.ok) return null;
    html = await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
  const parsed = parseIsYatirimPage(html);
  if (parsed.rows.length < 300) return null;

  const ttl = isBistSessionNowUtc() ? 60 : 600;
  const resp = new Response(JSON.stringify(parsed), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
  });
  const put = cache.put(key, resp).catch(() => { /* noop */ });
  if (waitUntil) waitUntil(put); else await put;
  return parsed;
}
