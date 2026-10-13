/**
 * BIST sembol evrenleri — cron'lar paylaşır (bist-warm, bars-warm).
 * 13 Eki 2026: bist-warm.ts içindeki liste buraya taşındı.
 */

export const BIST_100_UNIVERSE: string[] = Array.from(new Set([
  'AEFES','AGHOL','AHGAZ','AKBNK','AKCNS','AKFYE','AKSA','AKSEN','ALARK','ALBRK',
  'ALFAS','ARCLK','ASELS','ASTOR','BERA','BFREN','BIMAS','BINHO','BRSAN','BRYAT',
  'CANTE','CIMSA','CWENE','DOAS','DOHOL','ECILC','ECZYT','EGEEN','EKGYO','ENERY',
  'ENJSA','ENKAI','EREGL','FROTO','GARAN','GESAN','GLYHO','GUBRF','GWIND','HALKB',
  'HEKTS','ISCTR','ISDMR','ISFIN','ISMEN','IZMDC','KARSN','KAYSE','KCAER','KCHOL',
  'KLKIM','KMPUR','KONTR','KONYA','KOZAA','KOZAL','KRDMD','MAVI','MGROS','MIATK',
  'ODAS','OTKAR','OYAKC','PETKM','PGSUS','SAHOL','SASA','SISE','SKBNK','SMRTG',
  'SOKM','TAVHL','TCELL','THYAO','TKFEN','TKNSA','TOASO','TRGYO','TSKB','TTKOM',
  'TTRAK','TUPRS','TUREX','ULKER','VAKBN','VESBE','VESTL','YATAS','YKBNK','ZOREN',
  // BIST 30 dışı ama yaygın
  'AKGRT','ALTNY','ANHYT','BRISA','CCOLA','GENIL','ICBCT','LOGO','NETAS','NTHOL',
  'PARSN','PENTA','QUAGR','SNGYO','TATGD','TSPOR','TURSG','ULUUN',
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
    .filter((r) => typeof r.hisseUrl === 'string' && (r.hisseUrl as string).includes('.IS/'))
    .map((r) => String(r.hisseKodu ?? '').toUpperCase())
    .filter((s) => /^[A-Z0-9]{3,6}$/.test(s));
  return syms.length >= 100 ? Array.from(new Set(syms)).sort() : BIST_100_UNIVERSE;
}
