/**
 * Sanal Portföy oyun kartı — haftalık 100K turnuva.
 */

import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Plus, X, Award, TrendingUp, TrendingDown, Trophy, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BIST30_SYMBOLS } from '@/lib/dailyLeaderGame';
import {
  getThisWeek,
  submitPortfolio,
  tryResolve,
  getHistory,
  getStats,
  type PortfolioAllocation,
  type PortfolioState,
} from '@/lib/virtualPortfolioGame';

export function VirtualPortfolioCard() {
  const [portfolio, setPortfolio] = useState<PortfolioState>(() => getThisWeek());
  const [allocs, setAllocs] = useState<PortfolioAllocation[]>(() => portfolio.allocations);
  const [error, setError] = useState<string>('');
  const [history] = useState(() => getHistory());
  const [stats] = useState(() => getStats());

  useEffect(() => {
    tryResolve().then((resolved) => {
      if (resolved) setPortfolio({ ...resolved });
    });
  }, []);

  const isSubmitted = !!portfolio.submittedAt;
  const isResolved = !!portfolio.resolvedAt;

  const totalWeight = useMemo(() => allocs.reduce((s, a) => s + a.weight, 0), [allocs]);
  const remaining = 100 - totalWeight;
  const availableSymbols = BIST30_SYMBOLS.filter((sym) => !allocs.some((a) => a.symbol === sym));

  const addSymbol = (symbol: string) => {
    if (allocs.length >= 10) return;
    setAllocs([...allocs, { symbol, weight: Math.max(0, Math.min(remaining, 10)) }]);
  };

  const removeSymbol = (symbol: string) => {
    setAllocs(allocs.filter((a) => a.symbol !== symbol));
  };

  const updateWeight = (symbol: string, weight: number) => {
    setAllocs(allocs.map((a) => a.symbol === symbol ? { ...a, weight: Math.max(0, Math.min(100, weight)) } : a));
  };

  const handleSubmit = () => {
    setError('');
    const r = submitPortfolio(allocs);
    if (r.ok) {
      setPortfolio({ ...r.state });
    } else {
      setError(r.error);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-success/30 bg-gradient-to-br from-success/10 to-transparent p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-success/20 text-success">
            <DollarSign size={20} strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-100">Bu Haftanın Sanal Portföyü</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              <Calendar size={10} className="inline mr-1" />
              {portfolio.weekStart} — {portfolio.weekEnd} (Cuma kapanışında çözülür)
            </p>
            <p className="text-[11px] text-slate-300 mt-1">
              <strong className="text-success">100.000 TL</strong> sanal sermayeyle BIST 30'dan 5-10 hisse seç. Puan: getiri%×10.
            </p>
          </div>
        </div>

        {/* Submit edilmemis: form */}
        {!isSubmitted && (
          <>
            {/* Mevcut allocations */}
            {allocs.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {allocs.map((a) => (
                  <div key={a.symbol} className="flex items-center gap-2 rounded-md border border-border bg-bg-card p-2">
                    <span className="font-mono text-sm font-bold text-accent w-16">{a.symbol}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={a.weight}
                      onChange={(e) => updateWeight(a.symbol, parseFloat(e.target.value) || 0)}
                      className="input h-8 w-20 text-sm tabular-nums"
                    />
                    <span className="text-xs text-slate-400">%</span>
                    <span className="text-[11px] text-slate-500 ml-2">
                      {((portfolio.initialCapital * a.weight) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSymbol(a.symbol)}
                      className="ml-auto text-slate-500 hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Sembol ekle */}
            {allocs.length < 10 && availableSymbols.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                  <Plus size={11} className="inline mr-0.5" /> Sembol Ekle ({allocs.length}/10)
                </div>
                <div className="grid gap-1 grid-cols-4 sm:grid-cols-6 lg:grid-cols-10">
                  {availableSymbols.slice(0, 30).map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => addSymbol(sym)}
                      className="rounded border border-border bg-bg-soft px-2 py-1 text-[10px] font-mono font-bold text-slate-300 hover:border-success/40 hover:bg-success/5 hover:text-success transition"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Toplam % */}
            <div className="mt-3 rounded-md bg-bg-card p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300">Toplam Dağılım:</span>
                <span className={cn(
                  'font-bold tabular-nums',
                  Math.abs(totalWeight - 100) < 0.1 ? 'text-success' : 'text-warning',
                )}>
                  %{totalWeight.toFixed(1)} {Math.abs(totalWeight - 100) < 0.1 && '✓'}
                </span>
              </div>
              {Math.abs(totalWeight - 100) > 0.1 && (
                <div className="text-[10px] text-warning mt-1">
                  Kalan: %{remaining.toFixed(1)} (toplam %100 olmalı)
                </div>
              )}
            </div>

            {error && (
              <div className="mt-2 rounded-md bg-danger/15 px-3 py-2 text-xs text-danger ring-1 ring-danger/30">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={allocs.length < 5 || Math.abs(totalWeight - 100) > 0.1}
              className={cn(
                'w-full mt-3 rounded-lg px-4 py-2.5 text-sm font-bold transition',
                allocs.length >= 5 && Math.abs(totalWeight - 100) < 0.1
                  ? 'bg-success text-bg-base hover:brightness-110'
                  : 'bg-bg-card text-slate-500 cursor-not-allowed',
              )}
            >
              Portföyü Kaydet ({allocs.length}/5+)
            </button>
          </>
        )}

        {/* Submitted (henüz resolve edilmemis) */}
        {isSubmitted && !isResolved && (
          <>
            <div className="rounded-md bg-info/10 px-3 py-2 text-sm text-info ring-1 ring-info/30 mb-3">
              <strong>Portföyün kaydedildi.</strong> Cuma 18:10 kapanışta sonuç açıklanacak.
            </div>
            <div className="space-y-1.5">
              {portfolio.allocations.map((a) => (
                <div key={a.symbol} className="flex items-center justify-between rounded-md border border-border bg-bg-card px-3 py-1.5 text-xs">
                  <span className="font-mono font-bold text-accent">{a.symbol}</span>
                  <span className="text-slate-300">%{a.weight.toFixed(1)}</span>
                  <span className="text-slate-500 tabular-nums">
                    {((portfolio.initialCapital * a.weight) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Resolved */}
        {isResolved && portfolio.totalReturn != null && (
          <>
            <div className={cn(
              'rounded-md p-3 ring-1 mb-3',
              portfolio.totalReturn > 0
                ? 'bg-success/15 text-success ring-success/30'
                : 'bg-danger/15 text-danger ring-danger/30',
            )}>
              <div className="flex items-center gap-2 mb-1">
                {portfolio.totalReturn > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                <strong>Haftalık Getiri: {portfolio.totalReturn >= 0 ? '+' : ''}{portfolio.totalReturn.toFixed(2)}%</strong>
              </div>
              <div className="text-[11px]">
                Son değer: <strong>{(portfolio.finalValue ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL</strong>
                {' • '}
                <Award size={11} className="inline" /> <strong>+{portfolio.points ?? 0} puan</strong>
              </div>
            </div>
          </>
        )}
      </div>

      {stats.totalWeeks > 0 && (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          <StatPill label="Hafta" value={stats.totalWeeks.toString()} />
          <StatPill label="Kârlı" value={`${stats.profitableWeeks}/${stats.totalWeeks}`} tone="success" />
          <StatPill label="En İyi" value={`+${stats.bestReturn.toFixed(1)}%`} tone="success" />
          <StatPill label="Toplam Puan" value={stats.totalPoints.toString()} tone="warning" />
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'neutral' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-slate-100';
  return (
    <div className="rounded-md border border-border bg-bg-soft px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('text-base font-bold tabular-nums', toneClass)}>{value}</div>
    </div>
  );
}
