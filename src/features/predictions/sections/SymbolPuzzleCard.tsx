/**
 * Sembol Bulmaca oyun kartı — günlük puzzle, 3 ipucu, 3 deneme.
 */

import { useState } from 'react';
import { Search, Lightbulb, CheckCircle2, XCircle, Flame, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BIST_UNIQUE } from '@/data/bistAll';
import {
  getTodaysPuzzle,
  revealHint,
  submitGuess,
  getHistory,
  getStats,
  type SymbolPuzzleState,
  type PuzzleHint,
} from '@/lib/symbolPuzzleGame';

export function SymbolPuzzleCard() {
  const [puzzle, setPuzzle] = useState<SymbolPuzzleState>(() => getTodaysPuzzle());
  const [query, setQuery] = useState('');
  const [history] = useState(() => getHistory());
  const [stats] = useState(() => getStats());

  // Otokomple
  const suggestions = query.trim().length >= 2
    ? BIST_UNIQUE.filter((s) =>
        s.symbol.toLowerCase().includes(query.toLowerCase()) ||
        s.name.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 6)
    : [];

  const handleHint = (level: 1 | 2 | 3) => {
    if (puzzle.guessedAt) return;
    if (puzzle.hintsUsed.includes(level)) return;
    setPuzzle({ ...revealHint(level) });
  };

  const handleSubmit = (guess: string) => {
    if (!guess.trim() || puzzle.guessedAt) return;
    const { state } = submitGuess(guess);
    setPuzzle({ ...state });
    setQuery('');
  };

  const remainingAttempts = 3 - puzzle.attempts.length;
  const isFinished = !!puzzle.guessedAt;

  return (
    <div id="sembol-bulmaca" className="space-y-3">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
        🔤 Sembol Bulmaca
      </h2>

      <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-transparent p-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-purple-500/20 text-purple-400 text-xl">
            🔍
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-100">Hangi şirket?</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              İpuçlarıyla hangi BIST şirketinin sembolünü veya adını bul. İlk denemede{' '}
              <strong className="text-success">50 puan</strong>, ikinci 35, üçüncü 20. Her ipucu puan maliyetli.
            </p>
          </div>
        </div>

        {/* 3 İpucu */}
        <div className="space-y-2 mb-3">
          {puzzle.hints.map((hint) => {
            const isOpen = puzzle.hintsUsed.includes(hint.level);
            return (
              <button
                key={hint.level}
                type="button"
                disabled={isOpen || isFinished}
                onClick={() => handleHint(hint.level)}
                className={cn(
                  'w-full text-left rounded-lg border-2 px-3 py-2 transition flex items-start gap-2',
                  isOpen
                    ? 'border-warning/40 bg-warning/10 cursor-default'
                    : 'border-border bg-bg-soft hover:border-warning/40 hover:bg-warning/5 cursor-pointer',
                )}
              >
                <div className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold',
                  isOpen ? 'bg-warning text-bg-base' : 'bg-bg-card text-slate-400',
                )}>
                  {hint.level}
                </div>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
                    {isOpen ? `İpucu ${hint.level}` : `İpucu ${hint.level} (-${hint.costPoints} puan)`}
                  </div>
                  <div className={cn('text-sm', isOpen ? 'text-slate-100 font-medium' : 'text-slate-500')}>
                    {isOpen ? hint.text : <span className="italic">Tıkla aç</span>}
                  </div>
                </div>
                {isOpen ? <Eye size={14} className="mt-1 text-warning" /> : <Lightbulb size={14} className="mt-1 text-slate-500" />}
              </button>
            );
          })}
        </div>

        {/* Onceki denemeler */}
        {puzzle.attempts.length > 0 && !isFinished && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {puzzle.attempts.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-md bg-danger/15 px-2 py-0.5 text-[11px] text-danger ring-1 ring-danger/30">
                <XCircle size={10} /> {a}
              </span>
            ))}
            <span className="text-[11px] text-slate-400">
              {remainingAttempts} deneme kaldı
            </span>
          </div>
        )}

        {/* Input + autocomplete (sadece henuz cevaplanmadiysa) */}
        {!isFinished && (
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-8 w-full"
              placeholder="Şirket adı veya sembol yaz (örn: AKBNK veya Akbank)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) handleSubmit(query);
              }}
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-bg-card shadow-xl max-h-48 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s.symbol}
                    type="button"
                    onClick={() => handleSubmit(s.symbol)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent/10 border-b border-border/50 last:border-0"
                  >
                    <span className="font-mono font-semibold text-accent">{s.symbol}</span>
                    <span className="text-xs text-slate-400 truncate ml-2">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sonuç */}
        {isFinished && (
          <div className={cn(
            'mt-3 rounded-md p-3 flex items-start gap-2 text-sm',
            puzzle.correct
              ? 'bg-success/15 text-success ring-1 ring-success/30'
              : 'bg-danger/15 text-danger ring-1 ring-danger/30',
          )}>
            {puzzle.correct ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <div className="flex-1">
              {puzzle.correct ? (
                <>
                  <strong>Tebrikler!</strong> Doğru cevap <span className="font-mono">{puzzle.symbol}</span> ({puzzle.name}).
                  <div className="text-[11px] text-success/80 mt-0.5">
                    +{puzzle.points} puan ({puzzle.attempts.length}. denemede, {puzzle.hintsUsed.length} ipucuyla)
                  </div>
                </>
              ) : (
                <>
                  Bu sefer olmadı. Doğru cevap: <strong className="font-mono">{puzzle.symbol}</strong> ({puzzle.name}).
                  <div className="text-[11px] text-danger/80 mt-0.5">
                    Yarın yeni bir bulmaca seni bekliyor.
                  </div>
                </>
              )}
            </div>
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
        </div>
      )}

      {history.length > 0 && (
        <details className="rounded-md border border-border bg-bg-soft">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-bg-card">
            Geçmiş ({history.length})
          </summary>
          <div className="border-t border-border max-h-60 overflow-y-auto">
            {history.map((g) => (
              <div key={g.date} className="flex items-center justify-between px-3 py-2 text-[11px] border-b border-border/50 last:border-0">
                <span className="text-slate-400">{g.date}</span>
                <span className="font-mono text-slate-300">{g.symbol}</span>
                <span className={cn('font-semibold tabular-nums', g.correct ? 'text-success' : 'text-danger')}>
                  {g.correct ? `+${g.points}` : '0'}
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
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-slate-100';
  return (
    <div className="rounded-md border border-border bg-bg-soft px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('text-base font-bold tabular-nums', toneClass)}>{value}</div>
    </div>
  );
}
