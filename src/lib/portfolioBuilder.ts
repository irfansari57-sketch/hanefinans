/**
 * Portfoy Onerisi Algoritmasi
 *
 * Girdi:
 *   - RiskProfile (kategori agirliklari)
 *   - Tum TEFAS Acik fonlar listesi
 *
 * Cikti:
 *   - 4-6 fonluk oneri listesi: her kategoriden en iyi performans gosteren 1-2 fon
 *   - Sirali (en yuksek agirlik onde)
 *
 * Algoritma:
 *   1. Sadece tefasOpen=true fonlar (kullanici alabilmeli)
 *   2. Sadece son 1Y getirisi olan fonlar (saglikli veri)
 *   3. Profil agirliklarinin sirali olarak: her kategoriden top-N fon
 *   4. Toplam 4-6 fon dondurur (agirlik > %15 olan kategoriler oncelikli)
 */

import type { FundPerformance } from '@/data/types';
import type { RiskProfile, TargetCategory } from './riskProfile';

export interface PortfolioRecommendation {
  /** Risk profili etiketi */
  profileLabel: string;
  /** Toplam fon adedi */
  count: number;
  /** Onerilen fonlar (sirali, en yuksek agirlik onde) */
  funds: RecommendedFund[];
}

export interface RecommendedFund {
  fund: FundPerformance;
  /** Bu fon portfoyde kac % yer almali */
  weightPct: number;
  /** Hangi kategori icin secildi */
  category: TargetCategory;
  /** Niye onerildi (kisa not) */
  rationale: string;
}

/**
 * Profil ve fon listesinden 4-6 fonluk portfoy onerisi olusturur.
 */
export function buildPortfolio(profile: RiskProfile, allFunds: FundPerformance[]): PortfolioRecommendation {
  // 1. Sadece TEFAS acik + son 1Y getirisi gecerli fonlar
  const tradable = allFunds.filter((f) =>
    f.tefasOpen !== false
    && Number.isFinite(f.year)
    && (f.year as number) > -50, // anormal kayipli fonlari ele
  );

  // 2. Kategoriye gore grupla
  const byCategory = new Map<string, FundPerformance[]>();
  for (const f of tradable) {
    const cat = (f.category ?? '').trim();
    if (!cat) continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(f);
  }

  // 3. Profilin agirliklarini sirala (buyukten kucuge)
  const weightEntries = Object.entries(profile.weights)
    .filter(([, w]) => (w as number) > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number));

  // 4. Her kategoriden top-N fon sec (agirlik buyukse 2 fon, kucukse 1 fon)
  const result: RecommendedFund[] = [];
  for (const [cat, weight] of weightEntries) {
    const funds = byCategory.get(cat) ?? [];
    if (funds.length === 0) continue;

    // Bu kategoriden kac fon secelim
    const fundCount = (weight as number) >= 30 ? 2 : 1;

    // Son 1Y getirisine gore desc sirala
    const top = [...funds]
      .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity))
      .slice(0, fundCount);

    // Esit dagit agirligi
    const perFundWeight = Math.round((weight as number) / fundCount);

    for (const f of top) {
      result.push({
        fund: f,
        weightPct: perFundWeight,
        category: cat as TargetCategory,
        rationale: buildRationale(f, cat as TargetCategory, perFundWeight),
      });
    }

    // 6 fonu gectik mi dur
    if (result.length >= 6) break;
  }

  return {
    profileLabel: profile.label,
    count: result.length,
    funds: result.slice(0, 6),
  };
}

function buildRationale(fund: FundPerformance, category: TargetCategory, weight: number): string {
  const year = fund.year ?? 0;
  const yearStr = year > 0 ? `+${year.toFixed(1)}%` : `${year.toFixed(1)}%`;
  return `Son 1 yil ${yearStr} getiri · ${category} kategorisi · portfoyde %${weight}`;
}
