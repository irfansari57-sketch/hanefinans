/**
 * Portföy karşılaştırması için benchmark historical prices yükleyici.
 *
 * Kaynaklar:
 *   - BIST 100:   Yahoo `^XU100` (mevcut fetchHistoricalYahoo)
 *   - USD/TRY:    Yahoo `USDTRY=X`
 *   - Altın:      Yahoo `GC=F` (ons USD) + USD/TRY ile TL bazına çevrilir
 *   - TÜFE:       Sentetik (yıllık ~%40 baz)
 *   - Mevduat:    Sentetik (yıllık ~%40 net)
 */

import { fetchHistoricalYahoo } from '@/data/api/yahoo';
import { synthesizeTufeSeries, type PricePoint } from './computeEquityCurve';

export type BenchmarkId = 'BIST100' | 'USD' | 'GOLD_TRY' | 'TUFE' | 'MEVDUAT';

export interface BenchmarkMeta {
  id: BenchmarkId;
  label: string;
  description: string;
  color: string;
}

export const BENCHMARKS: BenchmarkMeta[] = [
  { id: 'BIST100',  label: 'BIST 100',   description: 'BIST 100 endeksi',                color: '#22c55e' },
  { id: 'USD',      label: 'USD/TRY',    description: 'Dolar/TL kuru',                    color: '#3b82f6' },
  { id: 'GOLD_TRY', label: 'Gram Altın', description: 'Gram altın (TL bazlı)',           color: '#eab308' },
  { id: 'TUFE',     label: 'TÜFE',       description: 'Türkiye enflasyon (yıllık ~%40)', color: '#f97316' },
  { id: 'MEVDUAT',  label: 'Mevduat',    description: 'Mevduat faizi (yıllık ~%40 net)', color: '#94a3b8' },
];

function pickYahooRange(startYmd: string): '1y' | '2y' | '5y' {
  const start = new Date(startYmd + 'T00:00:00Z').getTime();
  const now = Date.now();
  const yrs = (now - start) / (365.25 * 24 * 60 * 60 * 1000);
  if (yrs <= 1) return '1y';
  if (yrs <= 2) return '2y';
  return '5y';
}

function yahooToPricePoints(closes: Array<{ date: number; close: number }>): PricePoint[] {
  return closes.map((c) => ({
    date: new Date(c.date).toISOString().slice(0, 10),
    price: c.close,
  }));
}

/**
 * Bir benchmark için historical price serisi yükler.
 * Başlangıç tarihine göre uygun Yahoo range secilir; TÜFE/Mevduat için
 * synthetic seri üretilir.
 */
export async function loadBenchmark(
  id: BenchmarkId,
  startYmd: string,
  endYmd: string,
): Promise<PricePoint[]> {
  const range = pickYahooRange(startYmd);

  if (id === 'BIST100') {
    const hs = await fetchHistoricalYahoo('^XU100', range, '1d', { bistSuffix: false });
    return hs?.closes ? yahooToPricePoints(hs.closes) : [];
  }

  if (id === 'USD') {
    const hs = await fetchHistoricalYahoo('USDTRY=X', range, '1d', { bistSuffix: false });
    return hs?.closes ? yahooToPricePoints(hs.closes) : [];
  }

  if (id === 'GOLD_TRY') {
    // Ons altın (USD) × USD/TRY = TL bazlı gram altın (yaklaşık: 1 ons = 31.1035 gram)
    const [goldRaw, usdRaw] = await Promise.all([
      fetchHistoricalYahoo('GC=F', range, '1d', { bistSuffix: false }),
      fetchHistoricalYahoo('USDTRY=X', range, '1d', { bistSuffix: false }),
    ]);
    if (!goldRaw?.closes || !usdRaw?.closes) return [];
    // USD/TRY'yi tarih map'ine çevir
    const usdMap = new Map<string, number>();
    for (const c of usdRaw.closes) {
      usdMap.set(new Date(c.date).toISOString().slice(0, 10), c.close);
    }
    // Her altın günü için TL bazlı fiyat = ons_usd × usdtry / 31.1035
    const out: PricePoint[] = [];
    let lastUsd = 0;
    for (const c of goldRaw.closes) {
      const day = new Date(c.date).toISOString().slice(0, 10);
      const usd = usdMap.get(day) ?? lastUsd;
      if (usd > 0) {
        lastUsd = usd;
        out.push({ date: day, price: (c.close * usd) / 31.1035 });
      }
    }
    return out;
  }

  if (id === 'TUFE') {
    return synthesizeTufeSeries(startYmd, endYmd, 40, 100);
  }

  if (id === 'MEVDUAT') {
    // Sentetik %40 yıllık compound
    return synthesizeTufeSeries(startYmd, endYmd, 40, 100);
  }

  return [];
}

/**
 * Birden fazla benchmark'i paralel yükle.
 * Sonuç: benchmark id → historical points map.
 */
export async function loadBenchmarks(
  ids: BenchmarkId[],
  startYmd: string,
  endYmd: string,
): Promise<Map<BenchmarkId, PricePoint[]>> {
  const results = await Promise.all(
    ids.map(async (id) => [id, await loadBenchmark(id, startYmd, endYmd)] as const),
  );
  return new Map(results);
}
