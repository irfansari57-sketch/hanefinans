/**
 * FundComparisonChart — fonun getirisini diğer enstrümanlarla (BIST 30/100, USD, EUR,
 * Altın, TÜFE, Mevduat) karşılaştıran dikey bar chart.
 *
 * Veri kaynakları:
 *  - Fon: TEFAS feed'inden gelen returns (props ile)
 *  - BIST 30/100, USD/TRY, EUR/TRY, Altın: Yahoo Finance (lazy, async)
 *  - TÜFE, Mevduat: benchmarks.ts'teki sabit son bilinen değerler
 */

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Info, Wallet } from 'lucide-react';
import { fetchHistoricalYahoo, computePeriodReturns } from '@/data/api/yahoo';
import {
  TUFE_BENCHMARK, MEVDUAT_BENCHMARK, YAHOO_BENCHMARKS,
  computeYtdReturn,
  type BenchmarkPeriod,
} from '@/data/benchmarks';
import { cn } from '@/lib/utils';

type PeriodKey = BenchmarkPeriod;

const PERIOD_LABELS: Record<PeriodKey, string> = {
  '1w': 'Haftalık',
  '1m': 'Aylık',
  '3m': '3 Aylık',
  '6m': '6 Aylık',
  ytd: 'YBİ',
  '1y': '1 Yıllık',
};

// Yahoo historical range — period bazına göre veri penceresi
const PERIOD_TO_RANGE: Record<PeriodKey, '1mo' | '3mo' | '6mo' | '1y' | '2y'> = {
  '1w': '1mo',
  '1m': '3mo',
  '3m': '6mo',
  '6m': '1y',
  ytd: '1y',
  '1y': '2y',
};

interface FundReturns {
  '1w': number | null;
  '1m': number | null;
  '3m': number | null;
  '6m': number | null;
  ytd: number | null;
  '1y': number | null;
}

interface Props {
  /** Fon kodu (etikette gösterilir). */
  fundCode: string;
  /** Fon tam adı (legend'da tooltip). */
  fundName: string;
  /** TEFAS feed'inden gelen fon getirileri. */
  fundReturns: FundReturns;
}

interface BarData {
  key: string;
  label: string;
  description: string;
  color: string;
  /** % getiri — null = yükleniyor veya veri yok. */
  value: number | null;
  /** Bu fon mu (özel vurgu için). */
  isFund?: boolean;
}

const INVESTMENT_PRESETS = [
  { label: '100K', value: 100_000 },
  { label: '500K', value: 500_000 },
  { label: '1M', value: 1_000_000 },
  { label: '10M', value: 10_000_000 },
];

const INVESTMENT_LS_KEY = 'iq.fundCompare.investment';
const DEFAULT_INVESTMENT = 1_000_000;

function readSavedInvestment(): number {
  try {
    const raw = localStorage.getItem(INVESTMENT_LS_KEY);
    if (!raw) return DEFAULT_INVESTMENT;
    const v = parseInt(raw, 10);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_INVESTMENT;
  } catch {
    return DEFAULT_INVESTMENT;
  }
}

function formatMoneyTR(v: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v);
}

/** Kompakt para formatı: 1.500.000 → 1.5M, 830.300 → 830K, 50.000 → 50K */
function formatCompactTR(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return sign + (m >= 10 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '')) + 'M';
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return sign + (k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')) + 'K';
  }
  return sign + Math.round(abs).toString();
}

export function FundComparisonChart({ fundCode, fundName, fundReturns }: Props) {
  const [period, setPeriod] = useState<PeriodKey>('1y');
  const [investment, setInvestment] = useState<number>(() => readSavedInvestment());
  // Yahoo enstrümanlarının period'a göre getirileri
  // { period: { yahooSymbol: returnPct } }
  const [yahooReturns, setYahooReturns] = useState<Record<string, Partial<Record<PeriodKey, number | null>>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kullanıcı seçtiği yatırım tutarını localStorage'a kaydet
  useEffect(() => {
    try {
      localStorage.setItem(INVESTMENT_LS_KEY, String(investment));
    } catch {
      /* ignore */
    }
  }, [investment]);

  // Period değiştiğinde Yahoo verisini çek (eğer bu period için henüz çekilmediyse)
  useEffect(() => {
    const needs = YAHOO_BENCHMARKS.filter((b) => yahooReturns[b.yahooSymbol]?.[period] === undefined);
    if (needs.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const range = PERIOD_TO_RANGE[period];
        const results = await Promise.all(needs.map(async (b) => {
          try {
            const hist = await fetchHistoricalYahoo(b.yahooSymbol, range, '1d', { bistSuffix: false });
            if (!hist) return [b.yahooSymbol, null] as const;
            let val: number | null = null;
            if (period === 'ytd') {
              val = computeYtdReturn(hist.closes);
            } else {
              const r = computePeriodReturns(hist.closes);
              switch (period) {
                case '1w': val = r['1h'] ?? null; break;
                case '1m': val = r['1a'] ?? null; break;
                case '3m': val = r['3a'] ?? null; break;
                case '6m': val = r['6a'] ?? null; break;
                case '1y': val = r['1y'] ?? null; break;
              }
            }
            return [b.yahooSymbol, val] as const;
          } catch {
            return [b.yahooSymbol, null] as const;
          }
        }));
        if (cancelled) return;
        setYahooReturns((prev) => {
          const next = { ...prev };
          for (const [sym, val] of results) {
            const prevSym = next[sym] ?? {};
            next[sym] = { ...prevSym, [period]: val };
          }
          return next;
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Veri çekilemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [period, yahooReturns]);

  // Tüm bar'ları topla, değere göre büyükten küçüğe sırala
  const bars = useMemo<BarData[]>(() => {
    const all: BarData[] = [];
    // Fon
    all.push({
      key: 'FUND',
      label: fundCode,
      description: fundName,
      color: '#f87171', // distinctive coral/red — fund highlight
      value: fundReturns[period] ?? null,
      isFund: true,
    });
    // Yahoo enstrümanları
    for (const b of YAHOO_BENCHMARKS) {
      const v = yahooReturns[b.yahooSymbol]?.[period];
      all.push({
        key: b.yahooSymbol,
        label: b.label,
        description: b.description,
        color: b.color,
        value: v ?? null,
      });
    }
    // Statik benchmarks
    all.push({
      key: 'TUFE',
      label: TUFE_BENCHMARK.label,
      description: TUFE_BENCHMARK.description,
      color: TUFE_BENCHMARK.color,
      value: TUFE_BENCHMARK.returns[period],
    });
    all.push({
      key: 'MEVDUAT',
      label: MEVDUAT_BENCHMARK.label,
      description: MEVDUAT_BENCHMARK.description,
      color: MEVDUAT_BENCHMARK.color,
      value: MEVDUAT_BENCHMARK.returns[period],
    });

    // Değere göre büyükten küçüğe sırala — null'lar sona
    return all.sort((a, b) => {
      if (a.value == null && b.value == null) return 0;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      return b.value - a.value;
    });
  }, [fundCode, fundName, fundReturns, yahooReturns, period]);

  const validValues = bars.map((b) => b.value).filter((v): v is number => v != null);
  const maxValue = validValues.length > 0 ? Math.max(...validValues) : 0;
  const minValue = validValues.length > 0 ? Math.min(0, ...validValues) : 0;
  const range = Math.max(maxValue - minValue, 1);

  return (
    <section className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
            <BarChart3 size={16} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Fon Getiri Karşılaştır</h3>
            <p className="text-[10px] text-slate-500">
              {fundCode} vs. BIST, Döviz, Altın, TÜFE, Mevduat
            </p>
          </div>
        </div>
        {/* Period toggle */}
        <div className="inline-flex flex-wrap rounded-md border border-border bg-bg-soft p-0.5">
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-sm px-2 py-1 text-[10px] uppercase tracking-wider transition',
                period === p ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Yatırım tutarı seçici — barların üstünde TL kazanç göstermek için */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/40 bg-slate-900/30 p-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Wallet size={12} className="text-accent" />
          <span>Yatırım tutarı:</span>
        </div>
        <div className="inline-flex rounded-md border border-slate-700/50 bg-bg-card p-0.5">
          {INVESTMENT_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setInvestment(p.value)}
              className={cn(
                'rounded-sm px-2 py-0.5 text-[10px] font-medium transition',
                investment === p.value
                  ? 'bg-accent/20 text-accent'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {p.label} ₺
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-slate-500">veya</span>
          <input
            type="number"
            value={investment}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (Number.isFinite(v) && v > 0) setInvestment(Math.min(1_000_000_000, v));
            }}
            step={10000}
            min={1000}
            className="w-28 rounded border border-slate-700/50 bg-bg-card px-1.5 py-0.5 text-center tabular-nums text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <span className="text-slate-500">₺</span>
        </div>
        <div className="ml-auto text-[10px] text-slate-500">
          Bugün yatırıp seçili dönem sonu değerlendirildiğinde
        </div>
      </div>

      {/* Bar chart */}
      <div className="relative">
        {loading && (
          <div className="absolute right-2 top-0 z-10 text-[10px] text-slate-500">
            yükleniyor…
          </div>
        )}
        <div className="flex h-64 items-end gap-1.5 sm:gap-2 border-b border-border pb-1 pt-6">
          {bars.map((b) => {
            const v = b.value;
            const isPositive = v != null && v >= 0;
            // TL kazanç: yatırım × (getiri%/100)
            const tlKazanc = v != null ? (investment * v) / 100 : null;
            // Yüzde yüksekliğini range'e göre hesapla
            // Negatif değerler için zero-line aşağıdan
            const zeroPct = (-minValue / range) * 100; // 0%'in altta nerede olduğu (0..100)
            let heightPct = 0;
            let bottomPct = zeroPct;
            if (v != null) {
              const valPct = (Math.abs(v) / range) * 100;
              heightPct = valPct;
              if (!isPositive) bottomPct = zeroPct - valPct;
            }

            return (
              <div
                key={b.key}
                className="group relative flex h-full flex-1 flex-col items-center justify-end"
                title={
                  `${b.label} — ${b.description}\n` +
                  `${v != null ? v.toFixed(2) + '%' : 'veri yok'}` +
                  (tlKazanc != null
                    ? `\n${formatMoneyTR(investment)} ₺ yatırım → ${formatMoneyTR(investment + tlKazanc)} ₺ (${tlKazanc >= 0 ? '+' : ''}${formatMoneyTR(tlKazanc)} ₺)`
                    : '')
                }
              >
                {/* Value label — daha büyük, tam opasite, okunakli */}
                <div
                  className={cn(
                    'absolute left-1/2 -translate-x-1/2 flex flex-col items-center whitespace-nowrap',
                  )}
                  style={{ bottom: `calc(${bottomPct + heightPct}% + 6px)` }}
                >
                  <span
                    className={cn(
                      'text-xs font-bold tabular-nums leading-tight',
                      v == null ? 'text-slate-500' :
                      isPositive ? 'text-emerald-400' : 'text-red-400',
                    )}
                  >
                    {v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—'}
                  </span>
                  {tlKazanc != null && (
                    <span
                      className={cn(
                        'text-[11px] font-semibold tabular-nums leading-tight mt-0.5',
                        tlKazanc >= 0 ? 'text-emerald-300' : 'text-red-300',
                      )}
                    >
                      {tlKazanc >= 0 ? '+' : ''}{formatCompactTR(tlKazanc)} ₺
                    </span>
                  )}
                </div>
                {/* Bar */}
                {v != null && (
                  <div
                    className={cn(
                      'absolute left-1 right-1 rounded-t transition-all',
                      b.isFund ? 'ring-2 ring-warning/40 ring-offset-2 ring-offset-bg-soft' : '',
                    )}
                    style={{
                      backgroundColor: b.color,
                      bottom: `${bottomPct}%`,
                      height: `${heightPct}%`,
                      opacity: v == null ? 0.3 : 0.9,
                    }}
                  />
                )}
                {/* Zero line marker (if there are negative bars) */}
                {minValue < 0 && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 h-px bg-slate-600"
                    style={{ bottom: `${zeroPct}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {/* X-axis labels — belirgin ve okunakli */}
        <div className="flex gap-1.5 sm:gap-2 pt-3">
          {bars.map((b) => (
            <div key={b.key} className="flex-1 text-center">
              <div
                className={cn(
                  'truncate text-xs font-semibold',
                  b.isFund ? 'text-amber-400' : 'text-slate-300',
                )}
                title={b.label}
              >
                {b.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend + TL vade sonu değerleri — buyuk font, tam kontrast */}
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {bars.map((b) => {
          const v = b.value;
          const tlKazanc = v != null ? (investment * v) / 100 : null;
          const vadeSonu = tlKazanc != null ? investment + tlKazanc : null;
          return (
            <div key={b.key} className="flex items-center gap-2">
              <span
                className="inline-block h-4 w-4 rounded shrink-0"
                style={{ backgroundColor: b.color }}
              />
              <span className={cn(
                'truncate flex-1',
                b.isFund ? 'font-bold text-slate-100' : 'font-medium text-slate-200',
              )}>
                {b.isFund ? `${b.label} — ${b.description}` : b.label}
              </span>
              {vadeSonu != null && (
                <span className={cn(
                  'text-sm font-bold tabular-nums shrink-0',
                  tlKazanc! >= 0 ? 'text-emerald-400' : 'text-red-400',
                )}>
                  {formatCompactTR(vadeSonu)} ₺
                </span>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-2 text-[10px] text-danger">
          Bazı veriler çekilemedi: {error}
        </div>
      )}

      <div className="mt-3 flex items-start gap-1.5 rounded-md border border-border/50 bg-bg-soft/50 p-2 text-[10px] text-slate-500">
        <Info size={11} className="mt-0.5 shrink-0" />
        <span>
          BIST/Döviz/Altın değerleri Yahoo Finance'tan canlı çekilir. TÜFE (TÜİK)
          ve Mevduat Faizi (TCMB Ağırlıklı Ortalama) son bilinen değerlerdir,
          aylık güncellenir.
        </span>
      </div>
    </section>
  );
}
