import type { Stock, MacroIndicator } from '@/data/types';
import type { CryptoPrice, CryptoMarketGlobal, AltcoinMover } from '@/data/api/coingecko';
import type { FearGreedSnapshot } from '@/data/api/feargreed';

export interface ReportInput {
  date: Date;
  cryptos: CryptoPrice[];
  globalCrypto: CryptoMarketGlobal | null;
  fearGreed: FearGreedSnapshot | null;
  topAltcoins: AltcoinMover[];
  macros: MacroIndicator[];
  futures: { label: string; value: number; changePct?: number }[];
  bist: Stock[];                       // tüm BIST evreni
  momentumStocks: Stock[];             // top 10 momentum
  trConditions: {
    riskLevel: 'Düşük' | 'Orta' | 'Yüksek';
    tradingFriendly: boolean;
    scalpFriendly: boolean;
    notes: string[];
  };
}

const fmtMoneyUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 10 ? 4 : 0 }).format(n);

const fmtMoneyTry = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n);

const pct = (n: number | undefined | null) => {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
};

const trDate = (d: Date) =>
  new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' }).format(d);

export function generateMarkdownReport(r: ReportInput): string {
  const lines: string[] = [];
  lines.push(`# 🌅 Hane Finans — Piyasa Raporu`);
  lines.push(`**${trDate(r.date)}** • ${r.date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`);
  lines.push('');

  // 1. Kripto
  lines.push('## 1. Kripto Analizi');
  for (const c of r.cryptos.slice(0, 3)) {
    lines.push(`- **${c.symbol}** (${c.name}): ${fmtMoneyUsd(c.usd)} \`(24s ${pct(c.change24h)})\``);
  }
  if (r.globalCrypto) {
    lines.push(`- **BTC Dominance**: %${r.globalCrypto.btcDominance.toFixed(2)} • **ETH Dominance**: %${r.globalCrypto.ethDominance.toFixed(2)}`);
    lines.push(`- Toplam piyasa değeri: ${fmtMoneyUsd(r.globalCrypto.totalMarketCapUsd / 1e9)}B`);
  }
  if (r.fearGreed) {
    lines.push(`- **Fear & Greed Index**: ${r.fearGreed.value}/100 — *${r.fearGreed.classification}*`);
  }
  const topAlt = r.topAltcoins
    .filter((a) => !['BTC', 'ETH', 'USDT', 'USDC', 'BUSD', 'DAI', 'BNB'].includes(a.symbol))
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 5);
  if (topAlt.length > 0) {
    lines.push(`- **Öne çıkan altcoinler (24s)**:`);
    for (const a of topAlt) {
      lines.push(`  - ${a.symbol} (${a.name}): ${pct(a.change24h)}`);
    }
  }
  lines.push('');

  // 2. BIST
  lines.push('## 2. BIST Analizi');
  const bist100 = r.macros.find((m) => m.key === 'BIST 100');
  const usd = r.macros.find((m) => m.key === 'USD/TRY');
  const eur = r.macros.find((m) => m.key === 'EUR/TRY');
  if (bist100) lines.push(`- **BIST 100**: ${bist100.value.toLocaleString('tr-TR')} \`(${pct(bist100.changePct)})\``);
  if (usd) lines.push(`- **USD/TRY**: ${usd.value.toFixed(2)} \`(${pct(usd.changePct)})\``);
  if (eur) lines.push(`- **EUR/TRY**: ${eur.value.toFixed(2)} \`(${pct(eur.changePct)})\``);

  // Sektör analizi
  const sectorAgg = new Map<string, { count: number; sumPct: number }>();
  for (const s of r.bist) {
    if (!s.sector) continue;
    const e = sectorAgg.get(s.sector) ?? { count: 0, sumPct: 0 };
    e.count += 1;
    e.sumPct += s.changePct;
    sectorAgg.set(s.sector, e);
  }
  const sectors = Array.from(sectorAgg.entries())
    .map(([name, e]) => ({ name, avg: e.sumPct / e.count, count: e.count }))
    .sort((a, b) => b.avg - a.avg);
  if (sectors.length > 0) {
    lines.push(`- **Sektör performansı (ortalama %)**:`);
    for (const s of sectors.slice(0, 4)) {
      lines.push(`  - ${s.name}: ${pct(s.avg)} (${s.count} hisse)`);
    }
  }
  lines.push('');

  // 3. Global Makro
  lines.push('## 3. Global Makro');
  for (const f of r.futures) {
    lines.push(`- **${f.label}**: ${f.value.toLocaleString('en-US')} \`(${pct(f.changePct)})\``);
  }
  const gold = r.macros.find((m) => m.key === 'Gram Altın');
  const brent = r.macros.find((m) => m.key === 'Brent');
  const vix = r.macros.find((m) => m.key === 'VIX');
  if (gold) lines.push(`- **Gram Altın**: ${fmtMoneyTry(gold.value)} \`(${pct(gold.changePct)})\``);
  if (brent) lines.push(`- **Brent Petrol**: $${brent.value.toFixed(2)} \`(${pct(brent.changePct)})\``);
  if (vix) lines.push(`- **VIX (Volatilite)**: ${vix.value.toFixed(2)} \`(${pct(vix.changePct)})\``);
  lines.push('');

  // 4. Trading ortamı
  lines.push('## 4. Trading Ortamı');
  lines.push(`- **Risk seviyesi**: ${r.trConditions.riskLevel}`);
  lines.push(`- **Genel trading uygun mu?**: ${r.trConditions.tradingFriendly ? 'Evet' : 'Dikkat'}`);
  lines.push(`- **Scalp uygunluğu**: ${r.trConditions.scalpFriendly ? 'Uygun (yüksek volatilite)' : 'Düşük volatilite — temkinli'}`);
  for (const n of r.trConditions.notes) lines.push(`- ${n}`);
  lines.push('');

  // 5. Top 10 momentum BIST
  lines.push('## 5. Günün Momentum Önerileri (BIST Top 10)');
  lines.push('');
  lines.push('| # | Sembol | Şirket | Fiyat (₺) | Değişim |');
  lines.push('|---|--------|--------|-----------|---------|');
  r.momentumStocks.slice(0, 10).forEach((s, i) => {
    lines.push(`| ${i + 1} | **${s.symbol}** | ${s.name} | ${s.price.toFixed(2)} | ${pct(s.changePct)} |`);
  });
  lines.push('');

  lines.push('---');
  lines.push(`*Hane Finans tarafından otomatik üretildi • ${r.date.toISOString()}*`);

  return lines.join('\n');
}

export function generateTelegramText(r: ReportInput): string {
  // Telegram için sade Markdown (Telegram Bot API limit: 4096 karakter)
  const lines: string[] = [];
  const dateStr = trDate(r.date);
  lines.push(`🌅 *Hane Finans — Piyasa Raporu*`);
  lines.push(`_${dateStr}_`);
  lines.push('');

  lines.push(`*KRİPTO*`);
  for (const c of r.cryptos.slice(0, 3)) {
    const arrow = c.change24h >= 0 ? '🟢' : '🔴';
    lines.push(`${arrow} ${c.symbol}: ${fmtMoneyUsd(c.usd)} (${pct(c.change24h)})`);
  }
  if (r.globalCrypto) lines.push(`BTC Dominance: %${r.globalCrypto.btcDominance.toFixed(1)}`);
  if (r.fearGreed) lines.push(`F&G: ${r.fearGreed.value}/100 — ${r.fearGreed.classification}`);
  lines.push('');

  const bist100 = r.macros.find((m) => m.key === 'BIST 100');
  const usd = r.macros.find((m) => m.key === 'USD/TRY');
  const eur = r.macros.find((m) => m.key === 'EUR/TRY');
  lines.push(`*BIST*`);
  if (bist100) lines.push(`BIST 100: ${bist100.value.toLocaleString('tr-TR')} (${pct(bist100.changePct)})`);
  if (usd) lines.push(`USD/TRY: ${usd.value.toFixed(2)} (${pct(usd.changePct)})`);
  if (eur) lines.push(`EUR/TRY: ${eur.value.toFixed(2)} (${pct(eur.changePct)})`);
  lines.push('');

  lines.push(`*GLOBAL*`);
  for (const f of r.futures) lines.push(`${f.label}: ${f.value.toLocaleString('en-US')} (${pct(f.changePct)})`);
  const gold = r.macros.find((m) => m.key === 'Gram Altın');
  const brent = r.macros.find((m) => m.key === 'Brent');
  if (gold) lines.push(`Gram Altın: ${fmtMoneyTry(gold.value)} (${pct(gold.changePct)})`);
  if (brent) lines.push(`Brent: $${brent.value.toFixed(2)} (${pct(brent.changePct)})`);
  lines.push('');

  lines.push(`*BIST TOP 10 MOMENTUM*`);
  r.momentumStocks.slice(0, 10).forEach((s, i) => {
    const arrow = s.changePct >= 0 ? '🟢' : '🔴';
    lines.push(`${i + 1}. ${arrow} ${s.symbol} ${pct(s.changePct)} — ${s.price.toFixed(2)}₺`);
  });
  lines.push('');

  lines.push(`Risk: ${r.trConditions.riskLevel} • Trading: ${r.trConditions.tradingFriendly ? '✅' : '⚠️'} • Scalp: ${r.trConditions.scalpFriendly ? '✅' : '⚠️'}`);

  return lines.join('\n');
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
