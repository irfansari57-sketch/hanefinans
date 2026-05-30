import { Link } from 'react-router-dom';
import { Radio } from 'lucide-react';
import type { MacroIndicator } from '@/data/types';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/format';
import { macroKeyToRoute } from '@/lib/macroRoutes';

interface MacroCardProps {
  item: MacroIndicator;
  compact?: boolean;
}

export function MacroCard({ item, compact = false }: MacroCardProps) {
  const sign = (item.changePct ?? 0) >= 0 ? '+' : '';
  const tone =
    item.changePct == null
      ? 'text-slate-400'
      : item.changePct >= 0
      ? 'text-success'
      : 'text-danger';
  const route = macroKeyToRoute(item.key);

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</div>
        {item.source !== 'live' && (
          <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-warning">
            mock
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <div className={cn(compact ? 'text-lg' : 'text-xl', 'font-semibold text-slate-100')}>
          {formatNumber(item.value, item.value >= 1000 ? 0 : 2)}
        </div>
        {item.unit && <span className="text-xs text-slate-500">{item.unit}</span>}
      </div>
      <div className="mt-0.5 flex items-center justify-between text-xs">
        {item.changePct != null ? (
          <span className={tone}>
            {sign}
            {item.changePct.toFixed(2)}%
          </span>
        ) : (
          <span className="text-slate-500">{item.subLabel ?? ''}</span>
        )}
        {item.subLabel && item.changePct != null && (
          <span className="text-slate-500">{item.subLabel}</span>
        )}
      </div>
    </>
  );

  const baseClass = cn(
    'block rounded-xl border border-border bg-bg-soft transition',
    compact ? 'p-3' : 'p-4',
  );

  if (route) {
    return (
      <Link to={route} className={cn(baseClass, 'hover:border-accent/40 hover:bg-bg-soft/80')}>
        {inner}
      </Link>
    );
  }
  return <div className={baseClass}>{inner}</div>;
}
