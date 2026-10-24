/**
 * Faaliyeti durmuş / tasfiye halindeki portföy yönetim şirketleri (24 Eki 2026).
 *
 * İKİ KATMAN:
 *  1) RESMÎ — SPK yetki belgesi kaydı (ws.spk.gov.tr/PortfoyYetki/api/YetkiBelgesi), haftalık
 *     scraper → data/spk-pys.json. `belgedurumu` "Faaliyette" olmayan şirketler (Geçici İptal,
 *     İptal, Tasfiye…) otomatik işaretlenir. 24 Eki 2026 itibarıyla kayıtta: Beylerbeyi Portföy
 *     "Geçici İptal"; Pusula ve Tera hâlâ "Faaliyette" görünüyor (karar yetki belgesine işlenmemiş).
 *  2) MANUEL — SPK Bülteni / kullanıcı bildirimiyle tasfiye kapsamına alınan kurucular. Resmî kayıt
 *     fon bazlı tasfiye kararlarını yansıtmayabildiği için bu liste elle tutulur; her kayıtta kaynak notu.
 *
 * Eşleşme: fon adı kurucu adıyla başlar ("PUSULA PORTFÖY …") VEYA adında "TASFİYE" geçer.
 * Bu modül hem istemci hem Pages Functions tarafından import edilir — yalnız saf veri/fonksiyon.
 */
export interface LiquidationInfo {
  manager: string;
  status: string;      // "Tasfiye" | "Geçici İptal" | "İptal" | …
  since?: string;
  source: string;      // "SPK Bülteni" | "SPK yetki kaydı" | "TEFAS fon adı"
}

export const MANUAL_LIQUIDATED: ReadonlyArray<{ name: string; status: string; since: string; source: string }> = [
  { name: 'PUSULA PORTFÖY', status: 'Tasfiye', since: '2026-10', source: 'SPK Bülteni (kullanıcı bildirimi) — yetki kaydında henüz Faaliyette' },
  { name: 'TERA PORTFÖY', status: 'Tasfiye', since: '2026-10', source: 'SPK Bülteni (kullanıcı bildirimi) — yetki kaydında henüz Faaliyette' },
];

export const SPK_PYS_URL = 'https://cdn.jsdelivr.net/gh/irfansari57-sketch/hanefinans@main/data/spk-pys.json';

export function foldTr(s: string): string {
  return s
    .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/Ö/g, 'O').replace(/ö/g, 'o').replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ş/g, 'S').replace(/ş/g, 's').replace(/Ğ/g, 'G').replace(/ğ/g, 'g').replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

/** "PUSULA PORTFÖY YÖNETİMİ ANONİM ŞİRKETİ" → "PUSULA PORTFOY" (fon adı önekiyle eşleşmesi için) */
function managerKey(companyName: string): string {
  const f = foldTr(companyName);
  const i = f.indexOf('PORTFOY');
  return i > 0 ? f.slice(0, i + 'PORTFOY'.length) : f;
}

type Entry = { key: string; manager: string; status: string; since?: string; source: string };
let dynamic: Entry[] = [];
let dynamicLoadedAt = 0;

const manualEntries: Entry[] = MANUAL_LIQUIDATED.map((m) => ({ key: foldTr(m.name), manager: m.name, status: m.status, since: m.since, source: m.source }));

/** SPK kaydını (data/spk-pys.json) yükler; Faaliyette olmayanları dinamik listeye alır. Hata sessiz. */
export async function loadSpkRegistry(fetchImpl: typeof fetch = fetch): Promise<Entry[]> {
  if (Date.now() - dynamicLoadedAt < 6 * 3_600_000 && dynamic.length) return dynamic;
  try {
    const r = await fetchImpl(SPK_PYS_URL, { cache: 'no-cache' });
    if (!r.ok) return dynamic;
    const j = (await r.json()) as { flagged?: Array<{ name: string; status: string; since?: string }> };
    dynamic = (j.flagged ?? []).map((c) => ({ key: managerKey(c.name), manager: c.name, status: c.status, since: c.since, source: 'SPK yetki kaydı' }));
    dynamicLoadedAt = Date.now();
  } catch { /* kaynak yok → manuel liste yeter */ }
  return dynamic;
}

/** Fon adından durumu çıkarır. Önce manuel (SPK Bülteni), sonra resmî kayıt, sonra TEFAS "TASFİYE" adı. */
export function liquidationOf(fundName: string | null | undefined): LiquidationInfo | null {
  if (!fundName) return null;
  const f = foldTr(fundName);
  for (const m of manualEntries) if (f.startsWith(m.key)) return { manager: m.manager, status: m.status, since: m.since, source: m.source };
  for (const d of dynamic) if (f.startsWith(d.key)) return { manager: d.manager, status: d.status, since: d.since, source: d.source };
  if (/\bTASFIYE\b/.test(f)) return { manager: 'TASFİYE', status: 'Tasfiye', source: 'TEFAS fon adı' };
  return null;
}

/** İstemci: SPK kaydı yüklendiğinde çağıranı yeniden render etmek için (React hook'u sarmalanır). */
export function subscribeSpkRegistry(onLoaded: () => void): () => void {
  let alive = true;
  loadSpkRegistry().then((d) => { if (alive && d.length) onLoaded(); });
  return () => { alive = false; };
}

export function isLiquidatedFund(fundName: string | null | undefined): boolean {
  return liquidationOf(fundName) !== null;
}
