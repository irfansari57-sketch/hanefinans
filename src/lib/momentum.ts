import type { Stock, MacroIndicator } from '@/data/types';

/**
 * Basit momentum skoru:
 *   skor = |changePct| × yön ağırlığı (yükselen avantajlı) + sektör boost
 * Demo amaçlı; gerçek momentum için RSI/MACD vs. gerek.
 */
export function rankMomentum(stocks: Stock[], topN = 10): Stock[] {
  const scored = stocks
    .filter((s) => s.price > 0 && Number.isFinite(s.changePct))
    .map((s) => {
      const absChange = Math.abs(s.changePct);
      // Yükselen tarafı %20 öncelikli
      const directionalBoost = s.changePct > 0 ? 1.2 : 1.0;
      const score = absChange * directionalBoost;
      return { stock: s, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => x.stock);
  return scored;
}

/** Piyasa koşullarını VIX + BIST100 değişimi + döviz hareketi üzerinden öz değerlendir. */
export function assessTradingConditions(macros: MacroIndicator[]): {
  riskLevel: 'Düşük' | 'Orta' | 'Yüksek';
  tradingFriendly: boolean;
  scalpFriendly: boolean;
  notes: string[];
} {
  const vix = macros.find((m) => m.key === 'VIX')?.value ?? 18;
  const bist = macros.find((m) => m.key === 'BIST 100')?.changePct ?? 0;
  const usdTry = macros.find((m) => m.key === 'USD/TRY')?.changePct ?? 0;

  const notes: string[] = [];

  // VIX bazlı risk
  let riskLevel: 'Düşük' | 'Orta' | 'Yüksek' = 'Orta';
  if (vix < 15) riskLevel = 'Düşük';
  else if (vix > 25) riskLevel = 'Yüksek';
  notes.push(`VIX ${vix.toFixed(1)} → küresel volatilite ${riskLevel.toLowerCase()}`);

  const scalpFriendly = vix > 18 || Math.abs(bist) > 1.0;
  const tradingFriendly = vix < 30 && Math.abs(usdTry) < 2;

  if (Math.abs(bist) >= 1.5) notes.push(`BIST 100 ${bist.toFixed(2)}% — güçlü yönlü hareket`);
  if (Math.abs(usdTry) >= 1) notes.push(`USD/TRY ${usdTry.toFixed(2)}% — kur baskısı`);

  return { riskLevel, tradingFriendly, scalpFriendly, notes };
}
