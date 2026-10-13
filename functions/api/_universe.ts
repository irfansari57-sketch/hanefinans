import { isFvtBistRow } from './_fvt';
/**
 * BIST sembol evrenleri — cron'lar paylaşır (bist-warm, bars-warm).
 * 13 Eki 2026: bist-warm.ts içindeki liste buraya taşındı.
 */

// 13 Eki 2026: BIST 100 resmî bileşimi (Ekim 2026 dönemi, 100 sembol; kaynak BIST
// endeks kapsamı — src/data/bistGroups.ts ile aynı anlık görüntü). KOZAA/KOZAL
// (işlem görmüyor) çıkarıldı; bileşim çeyreklik revize edilir, birlikte güncelle.
export const BIST_100_UNIVERSE: string[] = Array.from(new Set([
  'AEFES','AGHOL','AHGAZ','AKBNK','AKCNS','AKFYE','AKSA','AKSEN','ALARK','ALBRK',
  'ALTNY','ANHYT','ANSGR','ARCLK','ASELS','ASTOR','AYGAZ','BERA','BIMAS','BINHO',
  'BRSAN','BRYAT','BTCIM','CANTE','CCOLA','CIMSA','CVKMD','CWENE','DOAS','DOHOL',
  'ECILC','ECZYT','EGEEN','EGGUB','EKGYO','ENERY','ENJSA','ENKAI','ENTRA','EREGL',
  'EUREN','FENER','FROTO','GARAN','GLRMK','GLYHO','GRSEL','GUBRF','GWIND','HALKB',
  'HEKTS','ISCTR','ISDMR','ISMEN','KARSN','KATMR','KCAER','KCHOL','KORDS','KRDMD',
  'LMKDC','MAVI','MGROS','MPARK','OBAMS','ODAS','OTKAR','OYAKC','PAHOL','PETKM',
  'PGSUS','RGYAS','RYSAS','SAHOL','SASA','SISE','SNGYO','SOKM','TABGD','TAVHL',
  'TCELL','TCKRC','THYAO','TKFEN','TOASO','TRALT','TRENJ','TRGYO','TRMET','TSKB',
  'TTKOM','TTRAK','TUKAS','TUPRS','TURSG','ULKER','VAKBN','VESTL','YKBNK','ZOREN',
]));

/** Endeksler — İş Yatırım/Yahoo sembolleri (Yahoo: XU100.IS). */
export const BIST_INDICES: string[] = ['XU100', 'XU030', 'XBANK', 'XUSIN'];

/**
 * Tam evren: FVT /api/stocks (hissePazar=2, .IS) üzerinden canlı çekilir;
 * bu fonksiyon başarısızsa BIST_100_UNIVERSE'e düşer.
 */
export async function fetchAllBistSymbols(fvtJson: <T>(url: string, timeoutMs?: number) => Promise<T | null>): Promise<string[]> {
  const d = await fvtJson<{ data?: Array<Record<string, unknown>> }>('https://fvt.com.tr/api/stocks?limit=5000&hissePazar=2', 12000);
  const syms = (d?.data ?? [])
    .filter((r) => isFvtBistRow(r))
    .map((r) => String(r.hisseKodu ?? '').toUpperCase())
    .filter((s) => /^[A-Z0-9]{3,6}$/.test(s));
  return syms.length >= 100 ? Array.from(new Set(syms)).sort() : BIST_100_UNIVERSE;
}
