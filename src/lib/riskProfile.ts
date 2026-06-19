/**
 * Risk Profili Sistemi - Bireysel yatirimci icin 6 soruluk risk analizi.
 *
 * Akis:
 *   1. Kullanici 6 sorudan birer cevap verir (her biri 1-5 puan, principle haric)
 *   2. Toplam puan 5-25 arasi -> 0-100 skala normalize edilir
 *   3. Skora gore 5 profilden biri belirlenir
 *   4. Her profil icin kategori bazli portfoy agirliklari hesaplanir
 *   5. Katilim ilkesi secilirse faizli kategoriler -> Katilim'a remap edilir
 *
 * Sonuc: PortfolioBuilder bu agirliklara gore TEFAS Acik fonlardan onerir.
 */

export type AgeBracket = 'under30' | '30to45' | '45to60' | 'over60';
export type Horizon = 'lessThan1y' | '1to3y' | '3to10y' | 'moreThan10y';
export type RiskTolerance = 'loss10' | 'loss20' | 'loss30' | 'loss50plus';
export type Goal = 'preserve' | 'income' | 'growth' | 'speculate';
export type Experience = 'beginner' | 'intermediate' | 'experienced' | 'professional';
/**
 * Yatirim ilkesi:
 *   - standard: faiz/turev/etik kisit yok, tum fonlar uygun
 *   - participation: Katilim Endeksi (faizsiz/etik) - sadece Katilim/Altin/
 *     Kiymetli Maden ve isimde KATILIM gecen fonlar
 */
export type InvestmentPrinciple = 'standard' | 'participation';

/**
 * SPK Nitelikli Yatirimci statusu — 10M TL+ toplam yatirilabilir varlik beyani
 * (mevduat + bono + hisse + fon + doviz + altin + serbest fonlar dahil).
 * Bu statu kullaniciya TEFAS'ta normalde Kapali olan SERBEST fonlara
 * (10M TL+ giris kosullu) erisim hakki verir.
 *
 * SPK II-13.1 — Yatirim Hizmetleri Tebligi gerekce.
 */
export type QualifiedInvestor = 'no' | 'yes';

export interface RiskAnswers {
  age: AgeBracket;
  horizon: Horizon;
  tolerance: RiskTolerance;
  goal: Goal;
  experience: Experience;
  principle: InvestmentPrinciple;
  /** SPK nitelikli yatirimci statusu (default 'no') */
  qualified: QualifiedInvestor;
}

export type RiskProfileLevel =
  | 'veryConservative'
  | 'conservative'
  | 'balanced'
  | 'growth'
  | 'aggressive';

export interface RiskProfile {
  level: RiskProfileLevel;
  /** 0-100 puan */
  score: number;
  /** Profil basligi - TR */
  label: string;
  /** Kisa aciklama */
  description: string;
  /** Kategori bazli portfoy agirliklari (toplam ~100) */
  weights: Partial<Record<TargetCategory, number>>;
  /** Yatirim ilkesi - katilim secilirse portfoy faizsiz/etik fonlardan kurulur */
  principle: InvestmentPrinciple;
  /** Nitelikli yatirimci statusu - 'yes' ise Serbest fonlar (TEFAS Kapali) da oneriye dahil */
  qualified: QualifiedInvestor;
}

/** Risk profili icin portfoy hedef kategorileri. */
export type TargetCategory =
  | 'Para Piyasası'
  | 'Borçlanma Araçları'
  | 'Karma'
  | 'Değişken'
  | 'Katılım'
  | 'Hisse Senedi'
  | 'Altın'
  | 'Kıymetli Maden'
  | 'Fon Sepeti';

// Her soruya verilen cevap icin 1-5 puan (1=en konservatif, 5=en agresif)
const AGE_SCORE: Record<AgeBracket, number> = {
  under30: 5,
  '30to45': 4,
  '45to60': 2,
  over60: 1,
};
const HORIZON_SCORE: Record<Horizon, number> = {
  lessThan1y: 1,
  '1to3y': 2,
  '3to10y': 4,
  moreThan10y: 5,
};
const TOLERANCE_SCORE: Record<RiskTolerance, number> = {
  loss10: 1,
  loss20: 2,
  loss30: 4,
  loss50plus: 5,
};
const GOAL_SCORE: Record<Goal, number> = {
  preserve: 1,
  income: 2,
  growth: 4,
  speculate: 5,
};
const EXP_SCORE: Record<Experience, number> = {
  beginner: 1,
  intermediate: 2,
  experienced: 4,
  professional: 5,
};

/**
 * 5 soruluk cevap setinden 0-100 skoru hesaplar.
 * Her soru 1-5 puan -> toplam 5-25 -> (toplam-5)/20 * 100.
 * (Principle skor hesabina dahil degil - sadece weight remap'i etkiler)
 */
export function computeRiskScore(answers: RiskAnswers): number {
  const total =
    AGE_SCORE[answers.age] +
    HORIZON_SCORE[answers.horizon] +
    TOLERANCE_SCORE[answers.tolerance] +
    GOAL_SCORE[answers.goal] +
    EXP_SCORE[answers.experience];
  // Toplam 5-25 -> 0-100
  return Math.round(((total - 5) / 20) * 100);
}

/**
 * 0-100 skoru 5 risk profilinden birine esler.
 * Default principle 'standard' doner - buildRiskProfile bunu override eder.
 */
export function classifyRiskProfile(score: number): RiskProfile {
  if (score < 20) {
    return {
      level: 'veryConservative',
      score,
      label: 'Çok Konservatif',
      description: 'Sermayeni korumak en öncelik. Düşük ama istikrarlı getiri hedeflenir.',
      weights: {
        'Para Piyasası': 70,
        'Borçlanma Araçları': 20,
        'Altın': 10,
      },
      principle: 'standard',
      qualified: 'no',
    };
  }
  if (score < 40) {
    return {
      level: 'conservative',
      score,
      label: 'Konservatif',
      description: 'Sermaye koruma agirlikli; sinirli buyume payi ile orta-uzun vadede istikrarli getiri.',
      weights: {
        'Para Piyasası': 30,
        'Borçlanma Araçları': 35,
        'Karma': 20,
        'Hisse Senedi': 10,
        'Altın': 5,
      },
      principle: 'standard',
      qualified: 'no',
    };
  }
  if (score < 60) {
    return {
      level: 'balanced',
      score,
      label: 'Dengeli',
      description: 'Buyume + koruma dengesi. Orta vade hedefli karma portfoy.',
      weights: {
        'Hisse Senedi': 35,
        'Karma': 25,
        'Borçlanma Araçları': 20,
        'Altın': 10,
        'Kıymetli Maden': 10,
      },
      principle: 'standard',
      qualified: 'no',
    };
  }
  if (score < 80) {
    return {
      level: 'growth',
      score,
      label: 'Büyüme',
      description: 'Buyume odakli; piyasa dalgalanmalarini kabul edersin, uzun vadede yuksek getiri hedefi.',
      weights: {
        'Hisse Senedi': 55,
        'Değişken': 15,
        'Karma': 15,
        'Kıymetli Maden': 10,
        'Fon Sepeti': 5,
      },
      principle: 'standard',
      qualified: 'no',
    };
  }
  return {
    level: 'aggressive',
    score,
    label: 'Agresif',
    description: 'Yuksek getiri hedefi, yuksek volatilite kabul. Uzun vade + tecrubeli yatirimci icin.',
    weights: {
      'Hisse Senedi': 70,
      'Değişken': 15,
      'Kıymetli Maden': 10,
      'Fon Sepeti': 5,
    },
    principle: 'standard',
    qualified: 'no',
  };
}

/**
 * Anket cevaplarini alir, profil + onerilen kategori agirliklarini doner.
 * Katilim ilkesi secilirse weights'i faizsiz kategori agirligina donusturur:
 *   - Para Piyasasi -> Katilim
 *   - Borclanma Araclari -> Katilim (faiz iceren bonolari kapsadigi icin)
 *   - Karma -> Katilim (karma genelde tahvil/faiz icerir)
 *   - Diger kategoriler (Hisse, Altin, Kiymetli Maden, Degisken) ayni kalir
 *     ANCAK frontend filter'da sadece "KATILIM" iceren fonlara dusurulur
 */
export function buildRiskProfile(answers: RiskAnswers): RiskProfile {
  const score = computeRiskScore(answers);
  const base = classifyRiskProfile(score);
  base.principle = answers.principle;
  base.qualified = answers.qualified;

  if (answers.principle === 'participation') {
    const newWeights: Partial<Record<TargetCategory, number>> = {};
    let katilimAccum = 0;
    for (const [cat, w] of Object.entries(base.weights)) {
      const weight = w as number;
      // Faiz iceren kategoriler -> Katilim'a topla
      if (cat === 'Para Piyasası' || cat === 'Borçlanma Araçları' || cat === 'Karma') {
        katilimAccum += weight;
      } else {
        newWeights[cat as TargetCategory] = weight;
      }
    }
    if (katilimAccum > 0) {
      newWeights['Katılım'] = (newWeights['Katılım'] ?? 0) + katilimAccum;
    }
    base.weights = newWeights;
    base.description += ' Katilim Endeksi ilkelerine uygun fonlar onerilir.';
  }

  return base;
}

// --- localStorage persist ---
const LS_KEY = 'fa.riskProfile.v1';

export interface SavedRiskProfile {
  answers: RiskAnswers;
  profile: RiskProfile;
  /** unix ms */
  savedAt: number;
}

export function saveRiskProfile(answers: RiskAnswers, profile: RiskProfile): void {
  try {
    const payload: SavedRiskProfile = { answers, profile, savedAt: Date.now() };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch { /* quota */ }
}

export function readRiskProfile(): SavedRiskProfile | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedRiskProfile;
  } catch {
    return null;
  }
}

export function clearRiskProfile(): void {
  try { localStorage.removeItem(LS_KEY); } catch { /* */ }
}
