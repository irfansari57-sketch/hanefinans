/**
 * Tasfiye halindeki portföy yönetim şirketleri (24 Eki 2026).
 *
 * SPK kararıyla tasfiye kapsamına alınan kurucuların fonları TEFAS'ta işlem görmez;
 * NAV/getiri verisi akmaya devam etse bile bu fonlar "Günün Enleri"ne girmemeli ve
 * listede/detayda açıkça "Tasfiye halinde" uyarısı taşımalı.
 *
 * Kaynak: kullanıcı bildirimi (Pusula, Tera) — SPK haftalık bülteniyle güncellenir.
 * Eşleşme: fon adı bu kurucu adıyla başlar (TEFAS adı "KURUCU PORTFÖY ..." kalıbında)
 * VEYA adında "TASFİYE" geçer (TEFAS tasfiye halindeki fonların adını böyle günceller).
 * Bu dosya hem istemci hem Pages Functions tarafından import edilir — yalnız saf veri/fonksiyon.
 */
export const LIQUIDATED_MANAGERS: ReadonlyArray<{ name: string; since: string; note?: string }> = [
  { name: 'PUSULA PORTFÖY', since: '2026-10', note: 'SPK tasfiye kararı' },
  { name: 'TERA PORTFÖY', since: '2026-10', note: 'SPK tasfiye kararı' },
];

function fold(s: string): string {
  return s
    .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/Ö/g, 'O').replace(/ö/g, 'o').replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ş/g, 'S').replace(/ş/g, 's').replace(/Ğ/g, 'G').replace(/ğ/g, 'g').replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

const FOLDED = LIQUIDATED_MANAGERS.map((m) => ({ ...m, key: fold(m.name) }));

/** Fon adından tasfiye durumunu çıkarır; eşleşen kurucu adını (veya 'TASFİYE') döner, yoksa null. */
export function liquidationOf(fundName: string | null | undefined): { manager: string; since?: string } | null {
  if (!fundName) return null;
  const f = fold(fundName);
  if (/\bTASFIYE\b/.test(f)) return { manager: 'TASFİYE' };
  for (const m of FOLDED) if (f.startsWith(m.key)) return { manager: m.name, since: m.since };
  return null;
}

export function isLiquidatedFund(fundName: string | null | undefined): boolean {
  return liquidationOf(fundName) !== null;
}
