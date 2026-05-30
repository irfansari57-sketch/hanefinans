import type { Stock, MacroIndicator } from '@/data/types';
import type { FearGreedSnapshot } from '@/data/api/feargreed';
import type { assessTradingConditions } from '@/lib/momentum';
import type { CryptoTA, BistTA } from './types';

/**
 * Günlük rapor Telegram metnini (Markdown) üret.
 * Kripto + BIST + Global makro + Trading ortamı özetleri.
 */
export function buildTelegramText(p: {
  cryptoTA: CryptoTA[];
  stocks: Stock[];
  macros: MacroIndicator[];
  futures: Array<{ label: string; value: number; changePct: number }>;
  fearGreed: FearGreedSnapshot | null;
  conditions: ReturnType<typeof assessTradingConditions>;
  topGainersTA: BistTA[];
}): string {
  const date = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  const lines: string[] = [];
  lines.push(`📊 *Günlük Piyasa Raporu — ${date}*`);
  lines.push('');

  // KRİPTO
  lines.push('*KRİPTO*');
  for (const ta of p.cryptoTA) {
    const arrow = ta.change24h >= 0 ? '🟢' : '🔴';
    lines.push(`${arrow} ${ta.symbol}: $${ta.priceUsd.toLocaleString('en-US')} (${ta.change24h >= 0 ? '+' : ''}${ta.change24h.toFixed(2)}%)`);
    lines.push(`  RSI ${ta.rsi.toFixed(1)} — ${ta.rsiNote}${ta.macdBullish ? ' • MACD bullish ✅' : ta.macdBearish ? ' • MACD bearish ⚠️' : ''}`);
  }
  if (p.fearGreed) lines.push(`F&G: ${p.fearGreed.value}/100 — ${p.fearGreed.classification}`);
  lines.push('');

  // BIST
  const bist = p.macros.find((m) => m.key === 'BIST 100');
  const usd = p.macros.find((m) => m.key === 'USD/TRY');
  const eur = p.macros.find((m) => m.key === 'EUR/TRY');
  lines.push('*BIST*');
  if (bist) lines.push(`BIST100: ${bist.value.toLocaleString('tr-TR')} (${(bist.changePct ?? 0) >= 0 ? '+' : ''}${(bist.changePct ?? 0).toFixed(2)}%)`);
  if (usd) lines.push(`USD/TRY: ${usd.value.toFixed(2)}`);
  if (eur) lines.push(`EUR/TRY: ${eur.value.toFixed(2)}`);

  if (p.topGainersTA.length > 0) {
    lines.push('');
    lines.push('*BIST Top Gainers + RSI*');
    p.topGainersTA.slice(0, 5).forEach((t, i) => {
      const rsiTxt = t.rsi != null ? ` RSI ${t.rsi.toFixed(0)}${(t.rsi ?? 0) >= 75 ? ' ⚠️' : ''}` : '';
      lines.push(`${i + 1}. ${t.stock.symbol} +${t.stock.changePct.toFixed(2)}%${rsiTxt}`);
    });
  }
  lines.push('');

  // MAKRO
  lines.push('*GLOBAL MAKRO*');
  for (const f of p.futures) {
    lines.push(`${f.label.split(' ')[0]}: ${f.value.toLocaleString('en-US')} (${f.changePct >= 0 ? '+' : ''}${f.changePct.toFixed(2)}%)`);
  }
  const vix = p.macros.find((m) => m.key === 'VIX');
  const brent = p.macros.find((m) => m.key === 'Brent');
  const gold = p.macros.find((m) => m.key === 'Gram Altın');
  if (brent) lines.push(`Brent: $${brent.value.toFixed(2)} (${(brent.changePct ?? 0) >= 0 ? '+' : ''}${(brent.changePct ?? 0).toFixed(2)}%)`);
  if (gold)  lines.push(`Gram Altın: ${gold.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺ (${(gold.changePct ?? 0) >= 0 ? '+' : ''}${(gold.changePct ?? 0).toFixed(2)}%)`);
  if (vix)   lines.push(`VIX: ${vix.value.toFixed(2)} ${(vix.changePct ?? 0) > 0 ? '⚠️' : ''}`);
  lines.push('');

  // TRADING ORTAMI
  lines.push('*TRADING ORTAMI*');
  lines.push(`Risk: ${p.conditions.riskLevel}`);
  lines.push(`Trading: ${p.conditions.tradingFriendly ? '✅' : '⚠️'} • Scalp: ${p.conditions.scalpFriendly ? '✅' : '⚠️'}`);

  return lines.join('\n');
}
