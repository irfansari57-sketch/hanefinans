import { Link } from 'react-router-dom';
import { ChevronRight, Star, Zap } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ScalpRec, ScalpTf } from './types';
import { isLongForTf, tfLabel } from './scalpHelpers';
import { ScalpCard } from './ScalpCard';

export function ScalpRowItem({ rec, rank, selectedTf, watched, onToggle }: {
  rec: ScalpRec;
  rank: number;
  selectedTf: ScalpTf;
  watched: boolean;
  onToggle: () => void;
}) {
  const { stock } = rec;
  const isLong = isLongForTf(rec, selectedTf);
  const tone = stock.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = stock.changePct >= 0 ? '+' : '';
  const leanColor = rec.bigPlayerLean === 'alıcı' ? 'text-success'
    : rec.bigPlayerLean === 'satıcı' ? 'text-danger'
    : 'text-slate-400';
  const leanLabel = rec.bigPlayerLean === 'alıcı' ? 'Alici'
    : rec.bigPlayerLean === 'satıcı' ? 'Satici'
    : 'Kararsiz';

  return (
    <details className={cn(
      'group rounded-lg border transition',
      isLong ? 'border-success/40 bg-success/5' : 'border-border bg-bg-soft hover:border-accent/40',
    )}>
      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm select-none [&::-webkit-details-marker]:hidden">
        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md border font-bold text-xs', isLong ? 'border-success/40 bg-success/10 text-success' : 'border-accent/30 bg-accent/10 text-accent')}>
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link to={`/stock/${stock.symbol}`} className="font-mono font-bold text-slate-100 hover:text-accent" onClick={(e) => e.stopPropagation()}>
              {stock.symbol}
            </Link>
            {stock.sector && (
              <span className="rounded border border-border bg-bg-card px-1 py-0.5 text-[9px] text-slate-400">{stock.sector}</span>
            )}
            {isLong && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                <Zap size={8} />{tfLabel(selectedTf)} GC
              </span>
            )}
            {((selectedTf === '5m' && rec.scalp5mFreshCross) || (selectedTf === '15m' && rec.scalp15mFreshCross)) && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                TAZE
              </span>
            )}
            {watched && <Star size={10} className="text-warning" fill="currentColor" />}
          </div>
          <div className="truncate text-[10px] text-slate-500">{stock.name}</div>
        </div>
        <div className="hidden lg:flex items-center gap-1 text-[9px]">
          {(['1h', '4h', '1d'] as const).map((tfKey) => {
            const t = tfKey === '1h' ? rec.trend1h : tfKey === '4h' ? rec.trend4h : rec.trend1d;
            const label = tfKey === '1h' ? '1H' : tfKey === '4h' ? '4H' : '1G';
            const selected = selectedTf === tfKey;
            if (!t) return <span key={tfKey} className={cn('rounded px-1 py-0.5 text-slate-500', selected ? 'ring-1 ring-accent' : 'bg-slate-500/15')}>{label}</span>;
            const cls = t.trend === 'long' ? 'bg-success/15 text-success' : t.trend === 'short' ? 'bg-danger/15 text-danger' : 'bg-slate-500/15 text-slate-400';
            return <span key={tfKey} className={cn('rounded px-1 py-0.5 font-mono', cls, selected && 'ring-1 ring-accent')}>{label}</span>;
          })}
        </div>
        <span className={cn('hidden md:inline-block w-16 text-right text-[10px] font-semibold', leanColor)}>
          {leanLabel}
        </span>
        <div className="w-20 text-right">
          <div className="text-sm font-bold tabular-nums text-slate-100">{formatMoney(stock.price)}</div>
          <div className={cn('text-[10px] font-semibold tabular-nums', tone)}>{sign}{stock.changePct.toFixed(2)}%</div>
        </div>
        <ChevronRight size={14} className="shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border">
        <ScalpCard rec={rec} rank={rank} watched={watched} onToggle={onToggle} />
      </div>
    </details>
  );
}
