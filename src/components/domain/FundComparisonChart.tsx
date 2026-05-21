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
import { BarChart3, Info } from 'lucide-react';
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

export function FundComparisonChart({ fundCode, fundName, fundReturns }: Props) {
  const [period, setPeriod] = useState<PeriodKey>('1y');
  // Yahoo enstrümanlarının period'a göre getirileri
  // { period: { yahooSymbol: returnPct } }
  const [yahooReturns, setYahooReturns] = useState<Record<string, Partial<Record<PeriodKey, number | null>>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                title={`${b.label} — ${b.description}\n${v != null ? v.toFixed(2) + '%' : 'veri yok'}`}
              >
                {/* Value label */}
                <div
                  className={cn(
                    'absolute left-1/2 -translate-x-1/2 text-[10px] font-bold tabular-nums whitespace-nowrap',
                    v == null ? 'text-slate-600' :
                    isPositive ? 'text-success' : 'text-danger',
                  )}
                  style={{ bottom: `calc(${bottomPct + heightPct}% + 4px)` }}
                >
                  {v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—'}
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
        {/* X-axis labels */}
        <div className="flex gap-1.5 sm:gap-2 pt-2">
          {bars.map((b) => (
            <div key={b.key} className="flex-1 text-center">
              <div
                className={cn(
                  'truncate text-[10px] font-medium',
                  b.isFund ? 'text-warning' : 'text-slate-400',
                )}
                title={b.label}
              >
                {b.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 grid gap-1.5 text-[11px] sm:grid-cols-2">
        {bars.map((b) => (
          <div key={b.key} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm shrink-0"
              style={{ backgroundColor: b.color }}
            />
            <span className={cn('truncate', b.isFund ? 'font-semibold text-slate-100' : 'text-slate-400')}>
              {b.isFund ? `${b.label} — ${b.description}` : b.label}
            </span>
          </div>
        ))}
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
