import { cn } from '@/lib/utils';

export function MiniRow({ label, value, change, warningOnRise }: {
  label: string;
  value: string;
  change: number;
  warningOnRise?: boolean;
}) {
  const tone = change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-slate-400';
  const arrow = warningOnRise && change > 0 ? '⚠️' : change >= 0.5 ? '🟢' : change <= -0.5 ? '🔴' : '➡️';
  return (
    <div className="rounded-lg border border-border bg-bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-100">{value}</div>
      <div className={cn('text-[11px] tabular-nums', tone)}>
        {arrow} {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </div>
    </div>
  );
}
