import type { PeriodReturns as PeriodReturnsT } from '@/data/api/yahoo';
import { cn } from '@/lib/utils';

interface Props {
  returns: PeriodReturnsT;
  selected?: keyof PeriodReturnsT;
  onSelect?: (k: keyof PeriodReturnsT) => void;
}

const PERIODS: Array<{ key: keyof PeriodReturnsT; label: string }> = [
  { key: '1g', label: '1 Gün' },
  { key: '1h', label: '1 Hafta' },
  { key: '1a', label: '1 Ay' },
  { key: '3a', label: '3 Ay' },
  { key: '6a', label: '6 Ay' },
  { key: '1y', label: '1 Yıl' },
];

export function PeriodReturns({ returns, selected, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PERIODS.map((p) => {
        const v = returns[p.key];
        const tone = v == null ? 'text-slate-500' : v >= 0 ? 'text-success' : 'text-danger';
        const sign = v == null ? '' : v >= 0 ? '+' : '';
        const isSelected = selected === p.key;
        return (
          <button
            key={p.key}
            type="button"
            disabled={v == null}
            onClick={() => onSelect?.(p.key)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition',
              isSelected
                ? 'border-accent bg-accent/10'
                : 'border-border bg-bg-soft hover:border-slate-500/40 hover:bg-bg-card',
              v == null && 'opacity-50',
            )}
          >
            <span className="text-[10px] uppercase tracking-wider text-slate-500">{p.label}</span>
            <span className={cn('text-sm font-semibold tabular-nums', tone)}>
              {v == null ? '—' : `${sign}${v.toFixed(2)}%`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
