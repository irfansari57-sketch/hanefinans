/**
 * Streak Badge — sidebar üst köşede veya header'da gösterilen seri rozeti.
 *
 * Görünüm: "🔥 12" (emoji + sayı), hover'da tooltip ("12 günlük seri • en uzun 30").
 * Tıklayınca /panel#streak-info'ya götürür (ileride detay sayfası eklenebilir).
 */

import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/store/auth';
import { useStreak } from '@/store/streak';
import { streakLevel } from '@/data/api/streakClient';
import { cn } from '@/lib/utils';

interface Props {
  /** Variant: compact (sidebar) veya full (panel widget). */
  variant?: 'compact' | 'full';
  className?: string;
}

export function StreakBadge({ variant = 'compact', className }: Props) {
  const user = useAuth((s) => s.user);
  const current = useStreak((s) => s.current);
  const longest = useStreak((s) => s.longest);
  const total = useStreak((s) => s.total);
  const refreshIfNeeded = useStreak((s) => s.refreshIfNeeded);
  const reset = useStreak((s) => s.reset);

  // Layout mount'unda + user değişikliğinde günde 1 ping
  useEffect(() => {
    if (!user) {
      reset();
      return;
    }
    refreshIfNeeded();
  }, [user, refreshIfNeeded, reset]);

  if (!user || current === 0) return null;

  const level = streakLevel(current);

  if (variant === 'compact') {
    return (
      <Link
        to="/panel"
        title={`${current} günlük seri • En uzun: ${longest} gün • Toplam ziyaret: ${total}`}
        className={cn(
          'group inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] font-bold transition hover:bg-warning/20',
          level.color,
          className,
        )}
      >
        <span className="text-[14px] leading-none transition-transform group-hover:scale-110">
          {level.emoji}
        </span>
        <span className="tabular-nums">{current}</span>
      </Link>
    );
  }

  return (
    <div className={cn('rounded-xl border border-warning/30 bg-gradient-to-br from-warning/10 to-accent/5 p-4', className)}>
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-warning/15 text-2xl">
          {level.emoji}
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn('text-2xl font-bold tabular-nums', level.color)}>{current}</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">günlük seri</span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            En uzun: <strong className="text-slate-200">{longest}</strong> gün •
            Toplam: <strong className="text-slate-200">{total}</strong> ziyaret
          </p>
        </div>
        <div className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
          {level.label}
        </div>
      </div>
    </div>
  );
}
