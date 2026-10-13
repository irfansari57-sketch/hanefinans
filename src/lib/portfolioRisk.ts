/**
 * Portföy risk raporu v1 — deterministik, AI'sız (13 Eki 2026, Faz 2 #5).
 *
 * Girdi: piyasa değeri bilinen pozisyonlar (+ opsiyonel günlük kapanış serileri).
 * Çıktı: konsantrasyon (en büyük ağırlık, ilk 3, HHI, etkin pozisyon sayısı),
 *        sektör dağılımı, 60 günlük yıllıklandırılmış volatilite, maksimum düşüş,
 *        ve açıklamalı uyarılar.
 *
 * Yöntem notları:
 *   - HHI = Σ w_i²  (0..1). Etkin pozisyon sayısı = 1/HHI. 10 eşit ağırlıklı hisse → 10.
 *   - Volatilite: ağırlıklı günlük portföy getirisi serisinin std × √252.
 *     Sadece kapanış serisi olan pozisyonlar dahil; kapsama oranı raporlanır.
 *   - Maksimum düşüş: aynı seri üzerinde kümülatif tepe→dip.
 *   - Bunlar GEÇMİŞ veridir; gelecek için garanti değildir (UI'da yazılır).
 */

export interface RiskPosition {
  symbol: string;
  marketValue: number;
  sector?: string;
  kind?: string;
}

export interface RiskWarning {
  level: 'info' | 'warn' | 'high';
  title: string;
  detail: string;
}

export interface RiskReport {
  totalValue: number;
  positionCount: number;
  topWeight: { symbol: string; weight: number } | null;
  top3Weight: number;
  hhi: number;
  effectiveN: number;
  sectors: Array<{ sector: string; weight: number }>;
  /** 60 günlük yıllıklandırılmış volatilite (%), yoksa null */
  vol60Annualized: number | null;
  /** 60 günlük maksimum düşüş (%), negatif sayı, yoksa null */
  maxDrawdown60: number | null;
  /** Volatilite hesabına giren portföy ağırlığı (0..1) */
  volCoverage: number;
  /** 0–100; yüksek = daha riskli. Konsantrasyon + volatilite bileşimi. */
  score: number;
  scoreLabel: 'Düşük' | 'Orta' | 'Yüksek' | 'Çok yüksek';
  warnings: RiskWarning[];
}

export function computeRiskReport(
  positions: RiskPosition[],
  closesBySymbol: Record<string, number[]> = {},
): RiskReport | null {
  const valid = positions.filter((p) => Number.isFinite(p.marketValue) && p.marketValue > 0);
  const totalValue = valid.reduce((s, p) => s + p.marketValue, 0);
  if (valid.length === 0 || totalValue <= 0) return null;

  // Aynı sembol birden fazla satırsa birleştir
  const bySym = new Map<string, RiskPosition>();
  for (const p of valid) {
    const cur = bySym.get(p.symbol);
    if (cur) cur.marketValue += p.marketValue;
    else bySym.set(p.symbol, { ...p });
  }
  const merged = Array.from(bySym.values()).sort((a, b) => b.marketValue - a.marketValue);
  const weights = merged.map((p) => ({ symbol: p.symbol, weight: p.marketValue / totalValue, sector: p.sector, kind: p.kind }));

  const hhi = weights.reduce((s, w) => s + w.weight * w.weight, 0);
  const effectiveN = hhi > 0 ? 1 / hhi : 0;
  const top = weights[0] ?? null;
  const top3Weight = weights.slice(0, 3).reduce((s, w) => s + w.weight, 0);

  // Sektör dağılımı
  const secMap = new Map<string, number>();
  for (const w of weights) {
    const key = w.sector?.trim() || (w.kind && w.kind !== 'stock' ? kindLabel(w.kind) : 'Bilinmiyor');
    secMap.set(key, (secMap.get(key) ?? 0) + w.weight);
  }
  const sectors = Array.from(secMap.entries())
    .map(([sector, weight]) => ({ sector, weight }))
    .sort((a, b) => b.weight - a.weight);

  // Volatilite + maks düşüş (ağırlıklı portföy getirisi)
  let vol60Annualized: number | null = null;
  let maxDrawdown60: number | null = null;
  let volCoverage = 0;
  {
    const withSeries = weights.filter((w) => (closesBySymbol[w.symbol]?.length ?? 0) >= 21);
    const covW = withSeries.reduce((s, w) => s + w.weight, 0);
    volCoverage = covW;
    if (withSeries.length > 0 && covW > 0) {
      const n = Math.min(61, ...withSeries.map((w) => closesBySymbol[w.symbol].length));
      const dailyRet: number[] = [];
      for (let i = 1; i < n; i++) {
        let r = 0;
        for (const w of withSeries) {
          const c = closesBySymbol[w.symbol];
          const a = c[c.length - n + i - 1];
          const b = c[c.length - n + i];
          if (a > 0 && b > 0) r += (w.weight / covW) * (b / a - 1);
        }
        dailyRet.push(r);
      }
      if (dailyRet.length >= 20) {
        const mean = dailyRet.reduce((s, x) => s + x, 0) / dailyRet.length;
        const varc = dailyRet.reduce((s, x) => s + (x - mean) ** 2, 0) / (dailyRet.length - 1);
        vol60Annualized = Math.sqrt(varc) * Math.sqrt(252) * 100;
        let peak = 1, cum = 1, mdd = 0;
        for (const r of dailyRet) {
          cum *= 1 + r;
          if (cum > peak) peak = cum;
          const dd = cum / peak - 1;
          if (dd < mdd) mdd = dd;
        }
        maxDrawdown60 = mdd * 100;
      }
    }
  }

  // Uyarılar
  const warnings: RiskWarning[] = [];
  if (top && top.weight >= 0.4) {
    warnings.push({ level: 'high', title: `Tek pozisyon ağırlığı %${(top.weight * 100).toFixed(0)} (${top.symbol})`, detail: 'Portföyün %40+\'ı tek varlıkta. Şirkete özgü bir olay (konkordato, tedbir, kâr uyarısı) portföyün tamamını etkiler.' });
  } else if (top && top.weight >= 0.25) {
    warnings.push({ level: 'warn', title: `En büyük pozisyon %${(top.weight * 100).toFixed(0)} (${top.symbol})`, detail: 'Tek varlık ağırlığı %25 üzerinde. Çeşitlendirme için %20 altı yaygın bir eşiktir.' });
  }
  if (merged.length >= 3 && effectiveN < 3) {
    warnings.push({ level: 'warn', title: `Etkin çeşitlendirme düşük (${effectiveN.toFixed(1)} pozisyon)`, detail: `${merged.length} pozisyon var ama ağırlıklar dengesiz; portföy fiilen ${effectiveN.toFixed(1)} pozisyon gibi davranır.` });
  }
  if (merged.length < 5) {
    warnings.push({ level: 'info', title: `${merged.length} pozisyon`, detail: 'Beşten az pozisyonla şirket-özel risk baskın kalır. Sektör ve varlık sınıfı çeşitliliği değerlendirilebilir.' });
  }
  const topSector = sectors[0];
  if (topSector && topSector.sector !== 'Bilinmiyor' && topSector.weight >= 0.5 && sectors.length > 1) {
    warnings.push({ level: 'warn', title: `Sektör yoğunlaşması: ${topSector.sector} %${(topSector.weight * 100).toFixed(0)}`, detail: 'Portföyün yarısından fazlası tek sektörde; sektörel bir şok (faiz, regülasyon, emtia) birlikte etkiler.' });
  }
  if (vol60Annualized != null && vol60Annualized >= 45) {
    warnings.push({ level: 'high', title: `Yüksek volatilite (%${vol60Annualized.toFixed(0)} yıllık)`, detail: 'Son 60 günde günlük dalgalanma yüksek; BIST 100 için tipik aralık %20-35\'tir.' });
  }
  if (maxDrawdown60 != null && maxDrawdown60 <= -15) {
    warnings.push({ level: 'warn', title: `Son 60 günde %${Math.abs(maxDrawdown60).toFixed(0)} maksimum düşüş`, detail: 'Tepe-dip kaybı belirgin; pozisyon büyüklüğü ve zarar-kes planı gözden geçirilebilir.' });
  }
  if (volCoverage > 0 && volCoverage < 0.7) {
    warnings.push({ level: 'info', title: `Volatilite kapsamı %${(volCoverage * 100).toFixed(0)}`, detail: 'Bazı pozisyonların fiyat geçmişi yok (fon/altın/döviz); volatilite ve düşüş sadece kapsanan kısmı yansıtır.' });
  }

  // Skor: konsantrasyon (0-60) + volatilite (0-40)
  const concScore = Math.min(60, hhi * 100 * 0.6 + (top?.weight ?? 0) * 40);
  const volScore = vol60Annualized == null ? 15 : Math.min(40, (vol60Annualized / 60) * 40);
  const score = Math.round(Math.max(0, Math.min(100, concScore + volScore)));
  const scoreLabel: RiskReport['scoreLabel'] = score < 30 ? 'Düşük' : score < 50 ? 'Orta' : score < 70 ? 'Yüksek' : 'Çok yüksek';

  return {
    totalValue,
    positionCount: merged.length,
    topWeight: top ? { symbol: top.symbol, weight: top.weight } : null,
    top3Weight,
    hhi,
    effectiveN,
    sectors,
    vol60Annualized,
    maxDrawdown60,
    volCoverage,
    score,
    scoreLabel,
    warnings,
  };
}

function kindLabel(kind: string): string {
  return kind === 'fund' ? 'Yatırım Fonu'
    : kind === 'gold' ? 'Altın'
    : kind === 'silver' ? 'Gümüş'
    : kind === 'forex' ? 'Döviz'
    : kind === 'crypto' ? 'Kripto'
    : 'Diğer';
}
