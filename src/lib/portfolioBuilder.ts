/**
 * Portfoy Onerisi Algoritmasi (Katilim filter destekli)
 *
 * Girdi:
 *   - RiskProfile (kategori agirliklari + principle)
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
 *   5. Katilim principle ise: sadece Katilim/Altin/Kiymetli Maden/isimde KATILIM gecen fonlar
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
 * Bir fon Katilim Endeksi ilkelerine uygun mu?
 *   - category = 'Katılım'
 *   - veya isminde KATILIM/PARTICIPATION/ISLAMIC geciyor
 *   - veya kategorisi Altın / Kıymetli Maden / Gümüş (faizsiz emtia)
 */
function isParticipationCompliant(fund: FundPerformance): boolean {
  const cat = (fund.category ?? '').toLocaleUpperCase('tr-TR');
  const name = (fund.name ?? '').toLocaleUpperCase('tr-TR');
  if (cat.includes('KATILIM')) return true;
  if (name.includes('KATILIM')) return true;
  if (name.includes('PARTICIPATION')) return true;
  if (name.includes('ISLAMIC')) return true;
  // Faizsiz emtia kategorileri
  if (cat.includes('ALTIN') || cat.includes('GÜMÜŞ') || cat.includes('GUMUS')) return true;
  if (cat.includes('KIYMETLİ MADEN') || cat.includes('KIYMETLI MADEN')) return true;
  return false;
}

/**
 * Profil ve fon listesinden 4-6 fonluk portfoy onerisi olusturur.
 */
export function buildPortfolio(profile: RiskProfile, allFunds: FundPerformance[]): PortfolioRecommendation {
  // 1. Sadece TEFAS acik + son 1Y getirisi gecerli fonlar
  // STRICT: tefasOpen === true sart. undefined gelirse riske girme (kullanici
  // alamayacagi fonu onerme - ZA2 gibi banka ozel "sepet hesap" fonlarini
  // filtre disi birak).
  let tradable = allFunds.filter((f) =>
    f.tefasOpen === true
    && Number.isFinite(f.year)
    && (f.year as number) > -50, // anormal kayipli fonlari ele
  );

  // 1b. Katilim principle ise sadece uyumlu fonlar
  if (profile.principle === 'participation') {
    tradable = tradable.filter(isParticipationCompliant);
  }

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
    let funds = byCategory.get(cat) ?? [];
    // Katilim profile + 'Katılım' kategorisi bos ise: tum uyumlu fonlardan sec
    if (profile.principle === 'participation' && cat === 'Katılım' && funds.length === 0) {
      funds = tradable; // tradable zaten participation-compliant filter'dan gecti
    }
    if (funds.length === 0) continue;

    // Bu kategoriden kac fon secelim (esik %25 -> daha fazla cesitlilik)
    const fundCount = (weight as number) >= 25 ? 2 : 1;

    // Son 1Y getirisine gore desc sirala
    const top = [...funds]
      .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity))
      .slice(0, fundCount);

    // Esit dagit agirligi
    const perFundWeight = Math.round((weight as number) / fundCount);

    for (const f of top) {
      // Ayni fon birden fazla kategoride secilebilir - dupe engelle
      if (result.some((r) => r.fund.code === f.code)) continue;
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

  // 5. MIN 5 FON GARANTISI — eksik fon varsa tradable havuzdan en iyi
  // performansli fonlarla doldur (cesitlendirme). Boylelikle bazi kategorilerin
  // (orn. Katilim + Hisse Senedi) bos olmasi durumunda portfoy 3'te kalmaz.
  const MIN_FUNDS = 5;
  if (result.length < MIN_FUNDS && tradable.length > result.length) {
    const usedCodes = new Set(result.map((r) => r.fund.code));
    const filler = [...tradable]
      .filter((f) => !usedCodes.has(f.code))
      .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));

    const needed = Math.min(MIN_FUNDS - result.length, filler.length);
    // Filler agirligi: ortalama %5 (toplam ~%25 kalan, max 5 fon icin %5 her biri)
    const fillerWeight = 5;

    for (let i = 0; i < needed; i++) {
      const f = filler[i];
      const cat = ((f.category ?? 'Diğer').trim()) as TargetCategory;
      result.push({
        fund: f,
        weightPct: fillerWeight,
        category: cat,
        rationale: buildRationale(f, cat, fillerWeight) + ' · ek cesitlendirme',
      });
    }
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
