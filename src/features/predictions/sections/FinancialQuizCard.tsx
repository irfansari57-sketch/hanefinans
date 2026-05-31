/**
 * Finansal Quiz oyun kartı — günlük 3 soru.
 */

import { useMemo, useState } from 'react';
import { Brain, CheckCircle2, XCircle, Lightbulb, Flame, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getTodaysQuiz,
  answerQuestion,
  finishQuiz,
  getHistory,
  getStats,
} from '@/lib/financialQuizGame';

const CATEGORY_LABELS: Record<string, string> = {
  temel: 'Temel Finans',
  bist: 'BIST Trivia',
  makro: 'Makro / Ekonomi',
  aktuel: 'Aktüel',
};

export function FinancialQuizCard() {
  const initial = useMemo(() => getTodaysQuiz(), []);
  const [submission, setSubmission] = useState(initial.submission);
  const questions = initial.questions;
  const [history] = useState(() => getHistory());
  const [stats, setStats] = useState(() => getStats());

  const allAnswered = submission.answers.every((a) => a !== null);
  const isFinished = !!submission.finishedAt;

  const handleAnswer = (qIdx: number, optIdx: number) => {
    if (isFinished) return;
    const next = answerQuestion(qIdx, optIdx);
    setSubmission({ ...next });
  };

  const handleFinish = () => {
    if (!allAnswered || isFinished) return;
    const next = finishQuiz();
    setSubmission({ ...next });
    setStats(getStats());
  };

  return (
    <div id="finansal-quiz" className="space-y-3">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-warning flex items-center gap-1.5">
        🧠 Finansal Quiz
      </h2>

      <div className="rounded-xl border border-warning/30 bg-gradient-to-br from-warning/10 to-transparent p-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning/20 text-warning">
            <Brain size={18} strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-100">Bugünün 3 sorusu</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Her doğru cevap <strong className="text-success">10 puan</strong>. 3/3 yaparsan{' '}
              <strong className="text-warning">+25 bonus</strong> (toplam 55p). Yarın yeni 3 soru.
            </p>
          </div>
        </div>

        {/* 3 Soru */}
        <div className="space-y-3 mb-3">
          {questions.map((q, qIdx) => {
            const userAnswer = submission.answers[qIdx];
            const showResult = isFinished;
            return (
              <div key={q.id} className="rounded-lg border border-border bg-bg-soft p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-warning/20 text-warning text-[10px] font-bold">
                    {qIdx + 1}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-slate-500">{CATEGORY_LABELS[q.category]}</span>
                </div>
                <h4 className="text-sm font-medium text-slate-100 mb-2.5">{q.question}</h4>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = userAnswer === optIdx;
                    const isCorrect = optIdx === q.correctIdx;
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        disabled={isFinished}
                        onClick={() => handleAnswer(qIdx, optIdx)}
                        className={cn(
                          'text-left rounded-md border-2 px-3 py-2 text-[12px] transition flex items-start gap-2',
                          showResult && isCorrect && 'border-success bg-success/15 text-success',
                          showResult && !isCorrect && isSelected && 'border-danger bg-danger/15 text-danger',
                          showResult && !isCorrect && !isSelected && 'border-border bg-bg-card text-slate-500 opacity-60',
                          !showResult && isSelected && 'border-accent bg-accent/15 text-accent ring-1 ring-accent/40',
                          !showResult && !isSelected && 'border-border bg-bg-card text-slate-300 hover:border-accent/40 hover:bg-accent/5 cursor-pointer',
                        )}
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-bg-soft text-[10px] font-bold ring-1 ring-border">
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span className="flex-1">{opt}</span>
                        {showResult && isCorrect && <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
                        {showResult && !isCorrect && isSelected && <XCircle size={14} className="mt-0.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {showResult && q.explanation && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md bg-accent/10 px-2.5 py-1.5 text-[11px] text-slate-300">
                    <Lightbulb size={11} className="mt-0.5 shrink-0 text-accent" />
                    <span>{q.explanation}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Finish button (henüz finish edilmediyse) */}
        {!isFinished && (
          <button
            type="button"
            onClick={handleFinish}
            disabled={!allAnswered}
            className={cn(
              'w-full rounded-lg px-4 py-2.5 text-sm font-bold transition',
              allAnswered
                ? 'bg-warning text-bg-base hover:brightness-110'
                : 'bg-bg-card text-slate-500 cursor-not-allowed',
            )}
          >
            {allAnswered ? 'Cevapları Gönder' : `Tüm soruları cevapla (${submission.answers.filter((a) => a !== null).length}/3)`}
          </button>
        )}

        {/* Sonuç */}
        {isFinished && (
          <div className={cn(
            'rounded-md p-3 flex items-start gap-2 text-sm',
            submission.correctCount === 3
              ? 'bg-warning/15 text-warning ring-1 ring-warning/30'
              : (submission.correctCount ?? 0) >= 2
              ? 'bg-success/15 text-success ring-1 ring-success/30'
              : 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/30',
          )}>
            <Award size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <strong>{submission.correctCount}/3 doğru — +{submission.points} puan</strong>
              {submission.correctCount === 3 && (
                <div className="text-[11px] mt-0.5">🌟 Tam isabet bonusu kazandın!</div>
              )}
              <div className="text-[11px] mt-0.5">Yarın yeni 3 soru seni bekliyor.</div>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      {stats.totalGames > 0 && (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          <StatPill label="Oynanan" value={stats.totalGames.toString()} />
          <StatPill label="Doğru" value={`${stats.totalCorrect}/${stats.totalQuestions}`} tone="success" />
          <StatPill label="İsabet %" value={`${stats.accuracy.toFixed(0)}%`} tone={stats.accuracy >= 70 ? 'success' : 'neutral'} />
          <StatPill label="Toplam Puan" value={stats.totalPoints.toString()} tone="warning" />
        </div>
      )}

      {stats.perfectStreak >= 2 && (
        <div className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-warning text-sm ring-1 ring-warning/30">
          <Flame size={14} />
          <strong>{stats.perfectStreak} gün ardışık 3/3</strong>
          <span className="text-[10px]">— BİLGİ MEYDAN OKUYANI!</span>
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
                <span className="font-mono text-slate-300">{g.correctCount}/3</span>
                <span className={cn(
                  'font-semibold tabular-nums',
                  g.correctCount === 3 ? 'text-warning' : (g.correctCount ?? 0) >= 2 ? 'text-success' : 'text-slate-500',
                )}>
                  +{g.points}
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
