/**
 * Sektör Şampiyonu oyun kartı — haftalık 1-2-3 sıralı sektör tahmini.
 */

import { useEffect, useState } from 'react';
import { Factory, Trophy, CheckCircle2, XCircle, Award, Calendar, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SECTOR_INDICES,
  getThisWeek,
  updatePick,
  submitPicks,
  tryResolve,
  getHistory,
  getStats,
  type SectorChampionState,
} from '@/lib/sectorChampionGame';

export function SectorChampionCard() {
  const [state, setState] = useState<SectorChampionState>(() => getThisWeek());
  const [error, setError] = useState<string>('');
  const [history] = useState(() => getHistory());
  const [stats] = useState(() => getStats());

  useEffect(() => {
    tryResolve().then((r) => { if (r) setState({ ...r }); });
  }, []);

  const isSubmitted = !!state.submittedAt;
  const isResolved = !!state.resolvedAt;
  const allPicked = state.picks.every((p) => !!p);

  const handlePick = (sectorShort: string) => {
    if (isSubmitted) return;
    // Hangi slot bos? Sirayla 0, 1, 2
    const nextSlot = state.picks.findIndex((p) => !p) as 0 | 1 | 2 | -1;
    // Eger sektor zaten secilmisse, kaldir
    const existingSlot = state.picks.findIndex((p) => p === sectorShort);
    if (existingSlot >= 0) {
      setState({ ...updatePick(existingSlot as 0 | 1 | 2, undefined) });
      return;
    }
    if (nextSlot < 0 || nextSlot > 2) return;
    setState({ ...updatePick(nextSlot as 0 | 1 | 2, sectorShort) });
  };

  const handleSubmit = () => {
    setError('');
    const r = submitPicks();
    if (r.ok) setState({ ...r.state });
    else setError(r.error);
  };

  const getPickRank = (sectorShort: string): number | null => {
    const idx = state.picks.findIndex((p) => p === sectorShort);
    return idx >= 0 ? idx + 1 : null;
  };

  const getResultInfo = (sectorShort: string) => {
    if (!isResolved || !state.results) return null;
    const idx = state.results.findIndex((r) => r.sym === sectorShort);
    return idx >= 0 ? { rank: idx + 1, changePct: state.results[idx].changePct } : null;
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-transparent p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-orange-500/20 text-orange-400">
            <Factory size={20} strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-100">Haftanın Sektör Şampiyonu</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              <Calendar size={10} className="inline mr-1" />
              {state.weekStart} — {state.weekEnd}
            </p>
            <p className="text-[11px] text-slate-300 mt-1">
              Bu hafta en çok yükselecek <strong className="text-orange-400">3 sektörü</strong> sıraya koy. Puan:
              1. = 75, 2. = 50, 3. = 30. <strong className="text-warning">3'ünü de tutarsan +100 trifekta bonusu</strong>.
            </p>
          </div>
        </div>

        {/* 10 sektör grid */}
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 mb-3">
          {SECTOR_INDICES.map((s) => {
            const rank = getPickRank(s.short);
            const result = getResultInfo(s.short);
            const isPicked = rank !== null;
            const isCorrect = isResolved && rank !== null && result && rank === result.rank;
            const wasInTop3 = isResolved && result && result.rank <= 3;
            return (
              <button
                key={s.short}
                type="button"
                disabled={isSubmitted && !isResolved}
                onClick={() => handlePick(s.short)}
                className={cn(
                  'relative rounded-lg border-2 p-2.5 transition text-left',
                  isResolved && isCorrect && 'border-success bg-success/15',
                  isResolved && isPicked && !isCorrect && 'border-danger/40 bg-danger/10',
                  isResolved && !isPicked && wasInTop3 && 'border-warning/40 bg-warning/5',
                  isResolved && !isPicked && !wasInTop3 && 'border-border bg-bg-card opacity-60',
                  !isResolved && isPicked && 'border-orange-500 bg-orange-500/15 ring-1 ring-orange-500/40',
                  !isResolved && !isPicked && !isSubmitted && 'border-border bg-bg-soft hover:border-orange-500/40 hover:bg-orange-500/5 cursor-pointer',
                  !isResolved && !isPicked && isSubmitted && 'border-border bg-bg-card opacity-50',
                )}
              >
                {/* Pick rank badge */}
                {rank !== null && (
                  <div className={cn(
                    'absolute -top-2 -left-2 grid h-6 w-6 place-items-center rounded-full text-xs font-bold ring-2 ring-bg',
                    isResolved && isCorrect && 'bg-success text-bg-base',
                    isResolved && !isCorrect && 'bg-danger text-bg-base',
                    !isResolved && 'bg-orange-500 text-bg-base',
                  )}>
                    {rank}
                  </div>
                )}
                {/* Result rank badge (resolved) */}
                {isResolved && result && (
                  <div className={cn(
                    'absolute -top-2 -right-2 grid h-5 w-5 place-items-center rounded-md text-[10px] font-bold ring-1 ring-border',
                    result.rank === 1 ? 'bg-warning text-bg-base' :
                    result.rank <= 3 ? 'bg-slate-200 text-bg-base' :
                    'bg-slate-700 text-slate-400',
                  )}>
                    #{result.rank}
                  </div>
                )}
                <div className="font-mono text-xs font-bold text-slate-100">{s.short}</div>
                <div className="text-[9px] text-slate-400 truncate">{s.name}</div>
                {isResolved && result && (
                  <div className={cn(
                    'text-xs font-bold tabular-nums mt-0.5',
                    result.changePct > 0 ? 'text-success' : result.changePct < 0 ? 'text-danger' : 'text-slate-400',
                  )}>
                    {result.changePct >= 0 ? '+' : ''}{result.changePct.toFixed(2)}%
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected display */}
        {!isResolved && (
          <div className="rounded-md bg-bg-card p-3 mb-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Tahminin (sıralı):</div>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((n) => {
                const sym = state.picks[n - 1];
                return (
                  <div key={n} className={cn(
                    'flex-1 rounded-md border px-2 py-1.5 text-center font-mono text-sm',
                    sym ? 'border-orange-500/40 bg-orange-500/10 text-orange-400 font-bold' : 'border-border bg-bg-soft text-slate-500',
                  )}>
                    <span className="text-[10px] block">{n}.</span>
                    {sym ?? '—'}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-md bg-danger/15 px-3 py-2 text-xs text-danger ring-1 ring-danger/30">
            {error}
          </div>
        )}

        {!isSubmitted && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allPicked}
            className={cn(
              'w-full rounded-lg px-4 py-2.5 text-sm font-bold transition',
              allPicked ? 'bg-orange-500 text-bg-base hover:brightness-110' : 'bg-bg-card text-slate-500 cursor-not-allowed',
            )}
          >
            Tahminleri Gönder
          </button>
        )}

        {isSubmitted && !isResolved && (
          <div className="rounded-md bg-info/10 px-3 py-2 text-sm text-info ring-1 ring-info/30">
            <strong>Tahminin kaydedildi.</strong> Cuma 18:10 kapanışta sonuç açıklanacak.
          </div>
        )}

        {isResolved && (
          <div className={cn(
            'rounded-md p-3 ring-1',
            (state.correctSlots?.length ?? 0) === 3 ? 'bg-warning/15 text-warning ring-warning/30' :
            (state.correctSlots?.length ?? 0) >= 1 ? 'bg-success/15 text-success ring-success/30' :
            'bg-slate-500/15 text-slate-400 ring-slate-500/30',
          )}>
            <div className="flex items-center gap-2 mb-1">
              {(state.correctSlots?.length ?? 0) === 3 ? <Trophy size={16} /> : <Award size={16} />}
              <strong>
                {(state.correctSlots?.length ?? 0)}/3 doğru — +{state.points ?? 0} puan
              </strong>
            </div>
            {(state.correctSlots?.length ?? 0) === 3 && (
              <div className="text-[11px] flex items-center gap-1 mt-0.5">
                <Sparkles size={11} /> TRIFEKTA! +100 bonus kazandın.
              </div>
            )}
            <div className="text-[10px] mt-1">Pazartesi yeni hafta — yeni tahmin.</div>
          </div>
        )}
      </div>

      {stats.totalWeeks > 0 && (
        <div className="grid gap-2 grid-cols-3">
          <StatPill label="Hafta" value={stats.totalWeeks.toString()} />
          <StatPill label="Trifekta" value={stats.trifectas.toString()} tone="warning" />
          <StatPill label="Toplam Puan" value={stats.totalPoints.toString()} tone="success" />
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
    </div>
  );
}
