import { Check, Target } from 'lucide-react';
import type { FearGreedSnapshot } from '@/data/api/feargreed';
import type { Stock, MacroIndicator } from '@/data/types';
import type { assessTradingConditions } from '@/lib/momentum';
import { cn } from '@/lib/utils';
import type { CryptoTA, BistTA, IndexTA } from './types';
import { SectionHeader } from './SectionHeader';

/**
 * Risk + scalp + portföy önerisi paneli. Şu anda sayfa JSX'inde bağlı değil ama
 * algoritmik tüm hesap mantığı korunduğu için ileride hızlıca aktive edilebilir.
 */
export function TradingDashboard({
  fearGreed, cryptoTA, bist100, bist100TA, topGainersTA, conditions, vix, usdTry, stocks,
}: {
  fearGreed: FearGreedSnapshot | null;
  cryptoTA: CryptoTA[];
  bist100: MacroIndicator | undefined;
  bist100TA: IndexTA | undefined;
  topGainersTA: BistTA[];
  conditions: ReturnType<typeof assessTradingConditions>;
  vix: MacroIndicator | undefined;
  usdTry: MacroIndicator | undefined;
  stocks: Stock[];
}) {
  // Önerilen portföy dağılımı — risk seviyesi + F&G + BIST trendine göre
  const fgVal = fearGreed?.value ?? 50;
  const bistTrend = bist100TA?.trend ?? 'yatay';
  const riskLow = conditions.riskLevel === 'Düşük';
  let cryptoPct = 20, bistPct = 50, cashPct = 30;
  if (fgVal > 70) { cryptoPct = 15; bistPct = 40; cashPct = 45; } // greed → temkinli
  else if (fgVal < 30) { cryptoPct = 30; bistPct = 50; cashPct = 20; } // fear → fırsat
  if (bistTrend === 'yukarı') { bistPct += 10; cashPct -= 10; }
  else if (bistTrend === 'aşağı') { bistPct -= 15; cashPct += 15; }
  if (!riskLow) { cashPct += 10; bistPct -= 5; cryptoPct -= 5; }
  // Normalize
  const sum = cryptoPct + bistPct + cashPct;
  cryptoPct = Math.max(0, Math.round((cryptoPct / sum) * 100));
  bistPct = Math.max(0, Math.round((bistPct / sum) * 100));
  cashPct = 100 - cryptoPct - bistPct;

  const overbought = topGainersTA.filter((t) => (t.rsi ?? 0) >= 75).length;
  const bestSectors = (() => {
    const agg = new Map<string, { count: number; sum: number }>();
    for (const s of stocks) {
      if (!s.sector) continue;
      const e = agg.get(s.sector) ?? { count: 0, sum: 0 };
      e.count += 1;
      e.sum += s.changePct;
      agg.set(s.sector, e);
    }
    return Array.from(agg.entries())
      .map(([name, e]) => ({ name, avg: e.sum / e.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3);
  })();

  // BIST seans saatleri (TR saati)
  const now = new Date();
  const tz = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const isOpen = !isWeekend && hour >= 10 && hour < 18;
  const sessionStatus = isWeekend
    ? 'Hafta sonu — BIST kapalı'
    : hour < 10
      ? `BIST açılışa ${10 - hour} sa kaldı (10:00)`
      : hour < 18
        ? `BIST açık (${tz} • kapanış 18:00)`
        : 'BIST kapandı — yarın 10:00 açılış';

  return (
    <section className="glass-card mb-5 p-5">
      <SectionHeader icon={Target} title="Trading Ortamı Değerlendirmesi" tone="accent" />
      <p className="mt-1 ml-13 text-xs text-slate-400">
        Risk, momentum ve makro koşullara göre bugünün trading ortamı.
      </p>

      {/* Üst özet — büyük göstergeler */}
      <div className="mt-4 grid gap-2 grid-cols-2 lg:grid-cols-4">
        <BigStat
          label="Risk Seviyesi"
          value={conditions.riskLevel.toUpperCase()}
          tone={conditions.riskLevel === 'Düşük' ? 'success' : conditions.riskLevel === 'Orta' ? 'warning' : 'danger'}
          hint={conditions.tradingFriendly ? 'Genel trading uygun' : 'Genel olarak temkinli ol'}
        />
        <BigStat
          label="Scalp Uygunluğu"
          value={conditions.scalpFriendly ? 'EVET' : 'TEMKİNLİ'}
          tone={conditions.scalpFriendly ? 'success' : 'warning'}
          hint={vix ? `VIX ${vix.value.toFixed(1)}` : 'Volatilite bilinmiyor'}
        />
        <BigStat
          label="Fear & Greed"
          value={fearGreed ? `${fearGreed.value}/100` : '—'}
          tone={fgVal >= 60 ? 'success' : fgVal >= 40 ? 'warning' : 'danger'}
          hint={fearGreed?.classification ?? ''}
        />
        <BigStat
          label="BIST Seansı"
          value={isOpen ? 'AÇIK' : 'KAPALI'}
          tone={isOpen ? 'success' : 'warning'}
          hint={sessionStatus}
        />
      </div>

      {/* 3 kategori boxları */}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <TradingBox
          title="Kripto için Uygunluk"
          verdict={fgVal > 55 ? 'orta-yüksek' : fgVal < 35 ? 'fırsat penceresi' : 'orta'}
          verdictTone={fgVal > 55 ? 'success' : fgVal < 35 ? 'success' : 'warning'}
          bullets={[
            fearGreed ? `Fear & Greed ${fearGreed.value} — ${fearGreed.classification}` : 'F&G verisi yok',
            cryptoTA[0]?.macdBullish ? `${cryptoTA[0].symbol} MACD bullish cross ✅` : null,
            cryptoTA[0]?.macdBearish ? `${cryptoTA[0].symbol} MACD bearish cross ⚠️` : null,
            cryptoTA[0] ? `${cryptoTA[0].symbol} RSI ${cryptoTA[0].rsi.toFixed(1)} — ${cryptoTA[0].rsiNote}` : null,
            cryptoTA[0] && cryptoTA[0].adxBullish != null
              ? `Trend: ${cryptoTA[0].adxLabel}${cryptoTA[0].adxBullish ? ' (alıcı baskın)' : ' (satıcı baskın)'}`
              : null,
          ].filter(Boolean) as string[]}
        />
        <TradingBox
          title="BIST için Uygunluk"
          verdict={bistTrend === 'yukarı' ? 'olumlu' : bistTrend === 'aşağı' ? 'risk yüksek' : 'kararsız'}
          verdictTone={bistTrend === 'yukarı' ? 'success' : bistTrend === 'aşağı' ? 'danger' : 'warning'}
          bullets={[
            bist100 ? `BIST100 ${(bist100.changePct ?? 0) >= 0 ? '+' : ''}${(bist100.changePct ?? 0).toFixed(2)}% • ${bist100.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}` : null,
            bist100TA ? `Kısa vadeli trend: ${bist100TA.trend.toUpperCase()}` : null,
            bist100TA?.rsi != null ? `BIST RSI ${bist100TA.rsi.toFixed(1)} — ${bist100TA.rsiNote}` : null,
            overbought > 0 ? `${overbought} hisse RSI ≥75 — aşırı alımda, kar realizasyonu olabilir` : 'Aşırı alımda hisse az — temiz alım ortamı',
            ...conditions.notes,
          ].filter(Boolean) as string[]}
        />
        <TradingBox
          title="Scalp / Day-Trade Uygunluğu"
          verdict={conditions.scalpFriendly ? 'EVET — fırsat var' : 'TEMKİNLİ ol'}
          verdictTone={conditions.scalpFriendly ? 'success' : 'warning'}
          bullets={[
            vix ? `VIX ${vix.value.toFixed(1)} — ${(vix.value > 22) ? 'yüksek volatilite' : 'düşük-orta volatilite'}` : null,
            usdTry ? `USD/TRY ${usdTry.value.toFixed(2)} (${(usdTry.changePct ?? 0) >= 0 ? '+' : ''}${(usdTry.changePct ?? 0).toFixed(2)}%)` : null,
            conditions.scalpFriendly
              ? 'Hızlı giriş-çıkış için uygun, sıkı stop kullan'
              : 'Geniş stop, küçük pozisyon — sabırlı ol',
            `Risk seviyesi: ${conditions.riskLevel.toUpperCase()}`,
          ].filter(Boolean) as string[]}
        />
      </div>

      {/* Önerilen portföy dağılımı */}
      <div className="mt-5 rounded-lg border border-border bg-bg-card p-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-200">Önerilen Portföy Dağılımı (bugünün koşullarına göre)</h4>
        <div className="flex h-5 overflow-hidden rounded">
          {bistPct > 0 && <div className="flex items-center justify-center bg-success text-[10px] font-bold text-white" style={{ width: `${bistPct}%` }}>BIST {bistPct}%</div>}
          {cryptoPct > 0 && <div className="flex items-center justify-center bg-warning text-[10px] font-bold text-white" style={{ width: `${cryptoPct}%` }}>Kripto {cryptoPct}%</div>}
          {cashPct > 0 && <div className="flex items-center justify-center bg-slate-600 text-[10px] font-bold text-white" style={{ width: `${cashPct}%` }}>Nakit/Altın {cashPct}%</div>}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Bu öneri F&G ({fgVal}), BIST trendi ({bistTrend}) ve risk seviyesine ({conditions.riskLevel}) göre algoritmik olarak hesaplandı — yatırım tavsiyesi değildir.
        </p>
      </div>

      {/* Öne çıkan sektörler */}
      {bestSectors.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-200">Bugünün Öne Çıkan Sektörleri</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {bestSectors.map((s, i) => (
              <div key={s.name} className={cn(
                'rounded border p-2',
                s.avg >= 0 ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5',
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">{i + 1}. {s.name}</span>
                  <span className={cn('text-xs font-bold tabular-nums', s.avg >= 0 ? 'text-success' : 'text-danger')}>
                    {s.avg >= 0 ? '+' : ''}{s.avg.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function BigStat({ label, value, tone, hint }: {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'danger';
  hint?: string;
}) {
  const tones = {
    success: 'border-success/30 bg-success/5 text-success',
    warning: 'border-warning/30 bg-warning/5 text-warning',
    danger: 'border-danger/30 bg-danger/5 text-danger',
  };
  return (
    <div className={cn('rounded-lg border p-3', tones[tone])}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

function TradingBox({
  title, verdict, verdictTone, bullets,
}: {
  title: string;
  verdict: string;
  verdictTone: 'success' | 'warning' | 'danger';
  bullets: string[];
}) {
  const tones = {
    success: 'bg-success/15 text-success border-success/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
    danger:  'bg-danger/15 text-danger border-danger/30',
  };
  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <h5 className="text-sm font-semibold text-slate-200">{title}</h5>
      <div className={cn('mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider', tones[verdictTone])}>
        <Check size={11} /> {verdict}
      </div>
      <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
