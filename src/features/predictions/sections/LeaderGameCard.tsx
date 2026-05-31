/**
 * Bugünün Lideri oyun kartı — PredictionsPage'e mount edilir.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, CheckCircle2, XCircle, Trophy, Sparkles, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getTodaysGame,
  submitPick,
  getHistory,
  getStats,
  tryResolveToday,
  type LeaderGameState,
} from '@/lib/dailyLeaderGame';

export function LeaderGameCard() {
  const [game, setGame] = useState<LeaderGameState>(() => getTodaysGame());
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [history, setHistory] = useState(() => getHistory());
  const [stats, setStats] = useState(() => getStats());

  // Sayfa açıldığında resolve dener (kapanış sonrası)
  useEffect(() => {
    tryResolveToday().then((resolved) => {
      if (resolved) {
        setGame(resolved);
        setHistory(getHistory());
        setStats(getStats());
      }
    });
  }, []);

  const handlePick = (symbol: string) => {
    if (game.resolvedAt) return;
    if (game.pick === symbol) return;
    setSubmitting(symbol);
    try {
      const next = submitPick(symbol);
      setGame({ ...next });
    } catch (err) {
      // ignore
    } finally {
      setSubmitting(null);
    }
  };

  const isAfterClose = (() => {
    const n = new Date();
    return n.getHours() > 18 || (n.getHours() === 18 && n.getMinutes() >= 10);
  })();

  return (
    <div id="bugunun-lideri" className="space-y-3">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-info flex items-center gap-1.5">
        {game.mode === 'top' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        Bugünün Lideri {game.mode === 'top' ? '— En Çok Yükselen' : '— En Çok Düşen'}
      </h2>

      <div className="rounded-xl border border-info/30 bg-gradient-to-br from-info/10 to-transparent p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-info/20 text-info">
            {game.mode === 'top' ? <TrendingUp size={18} strokeWidth={2.5} /> : <TrendingDown size={18} strokeWidth={2.5} />}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-100">
              {game.mode === 'top' ? 'En çok yükselecek 5 hisse hangisi?' : 'En çok düşecek 5 hisse hangisi?'}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Aşağıdaki 5 BIST 30 hissesinden bugün kapanışta{' '}
              {game.mode === 'top' ? 'en çok yükselen' : 'en çok düşen'} olacağını tahmin et.
              Doğru tahmin <strong className="text-success">50 puan</strong>, üst sıraya yakın seçim ekstra bonus.
            </p>
          </div>
        </div>

        {/* 5 hisse grid */}
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-5">
          {game.pool.map((sym) => {
            const isPicked = game.pick === sym;
            const isWinner = game.winner === sym;
            const isResolved = !!game.resolvedAt;
            const change = game.changes?.[sym];
            return (
              <button
                key={sym}
                type="button"
                disabled={isResolved}
                onClick={() => handlePick(sym)}
                className={cn(
                  'rounded-lg border-2 p-3 transition text-left',
                  isResolved && isWinner && 'border-success bg-success/15 ring-2 ring-success/40',
                  isResolved && !isWinner && isPicked && 'border-danger/40 bg-danger/10 opacity-70',
                  isResolved && !isWinner && !isPicked && 'border-border bg-bg-card opacity-50',
                  !isResolved && isPicked && 'border-accent bg-accent/15 ring-2 ring-accent/40 shadow-[0_0_12px_rgba(56,189,248,0.4)]',
                  !isResolved && !isPicked && 'border-border bg-bg-soft hover:border-accent/40 hover:bg-bg-card cursor-pointer',
                  submitting === sym && 'animate-pulse',
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-bold text-slate-100">{sym}</span>
                  {isResolved && isWinner && <Trophy size={14} className="text-success" />}
                  {!isResolved && isPicked && <CheckCircle2 size={14} className="text-accent" />}
                </div>
                {isResolved && change != null && (
                  <div className={cn(
                    'text-sm font-bold tabular-nums',
                    change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-slate-400',
                  )}>
                    {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                  </div>
                )}
                {!isResolved && (
                  <div className="text-[10px] text-slate-500">
                    {isPicked ? 'Tahminin ✓' : 'Seç'}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Status badge */}
        {game.resolvedAt && (
          <div className={cn(
            'mt-3 rounded-md p-3 flex items-center gap-2 text-sm',
            game.pick === game.winner
              ? 'bg-success/15 text-success ring-1 ring-success/30'
              : game.pick
              ? 'bg-danger/15 text-danger ring-1 ring-danger/30'
              : 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/30',
          )}>
            {game.pick === game.winner ? (
              <>
                <CheckCircle2 size={16} />
                <strong>Tebrikler! +{game.points} puan kazandın.</strong>
                {game.points && game.points > 50 && (
                  <span className="text-[10px] uppercase tracking-wider">(+25 lider bonusu)</span>
                )}
              </>
            ) : game.pick ? (
              <>
                <XCircle size={16} />
                <span>Bu sefer olmadı — kazanan <strong>{game.winner}</strong>. Yarın yeni şans!</span>
              </>
            ) : (
              <>
                <span>Bugün tahmin yapmadın — kazanan <strong>{game.winner}</strong>.</span>
              </>
            )}
          </div>
        )}

        {!game.resolvedAt && game.pick && (
          <div className="mt-3 text-[11px] text-accent flex items-center gap-1">
            <Sparkles size={11} />
            Tahminin kaydedildi: <strong>{game.pick}</strong> — sonuç kapanışta (18:10) belli olur.
          </div>
        )}
        {!game.resolvedAt && !game.pick && (
          <div className="mt-3 text-[11px] text-slate-400">
            Yukarıdan tek bir hisse seç. {isAfterClose ? 'Kapanış geçti, sonuç birazdan çekilir.' : 'Kapanış: bugün 18:10.'}
          </div>
        )}
      </div>

      {/* Stats */}
      {stats.totalGames > 0 && (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          <StatPill label="Oynanan" value={stats.totalGames.toString()} />
          <StatPill label="Doğru" value={stats.correctCount.toString()} tone="success" />
          <StatPill label="İsabet %" value={`${stats.accuracy.toFixed(0)}%`} tone={stats.accuracy >= 50 ? 'success' : 'neutral'} />
          <StatPill label="Toplam Puan" value={stats.totalPoints.toString()} tone="warning" />
        </div>
      )}

      {stats.currentStreak >= 2 && (
        <div className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-warning text-sm ring-1 ring-warning/30">
          <Flame size={14} />
          <strong>{stats.currentStreak} gün ardışık doğru</strong>
          <span className="text-[10px] text-warning/80">— streak çarpanı aktif</span>
        </div>
      )}

      {/* Geçmiş */}
      {history.length > 0 && (
        <details className="rounded-md border border-border bg-bg-soft">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-bg-card">
            Geçmiş ({history.length})
          </summary>
          <div className="border-t border-border max-h-60 overflow-y-auto">
            {history.map((g) => (
              <div key={g.date} className="flex items-center justify-between px-3 py-2 text-[11px] border-b border-border/50 last:border-0">
                <span className="text-slate-400">{g.date}</span>
                <span className="font-mono text-slate-300">{g.pick} → {g.winner}</span>
                <span className={cn(
                  'font-semibold tabular-nums',
                  g.pick === g.winner ? 'text-success' : 'text-danger',
                )}>
                  {g.pick === g.winner ? `+${g.points ?? 50}` : '0'}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function StatPill({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'neutral' }) {
  const toneClass = tone === 'success' ? 'text-success'
    : tone === 'warning' ? 'text-warning'
    : 'text-slate-100';
  return (
    <div className="rounded-md border border-border bg-bg-soft px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('text-base font-bold tabular-nums', toneClass)}>{value}</div>
    </div>
  );
}
