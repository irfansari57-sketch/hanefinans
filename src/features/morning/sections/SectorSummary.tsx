import type { FearGreedSnapshot } from '@/data/api/feargreed';
import { fearGreedTone } from '@/data/api/feargreed';
import type { Stock } from '@/data/types';
import { cn } from '@/lib/utils';

/**
 * Sektör ortalama getirisi paneli. Şu anda JSX'te kullanılmıyor.
 */
export function SectorSummary({ stocks }: { stocks: Stock[] }) {
  const agg = new Map<string, { count: number; sum: number }>();
  for (const s of stocks) {
    if (!s.sector) continue;
    const e = agg.get(s.sector) ?? { count: 0, sum: 0 };
    e.count += 1;
    e.sum += s.changePct;
    agg.set(s.sector, e);
  }
  const sectors = Array.from(agg.entries())
    .map(([name, e]) => ({ name, avg: e.sum / e.count, count: e.count }))
    .sort((a, b) => b.avg - a.avg);

  if (sectors.length === 0) return null;
  return (
    <div className="mt-5 rounded-lg border border-border bg-bg-card p-3">
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Öne Çıkan Sektörler</h5>
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {sectors.map((s) => (
          <div key={s.name} className="flex items-center justify-between rounded bg-bg-soft px-2.5 py-1 text-xs">
            <span className="truncate text-slate-300">{s.name}</span>
            <span className={cn('tabular-nums font-medium', s.avg >= 0 ? 'text-success' : 'text-danger')}>
              {s.avg >= 0 ? '+' : ''}{s.avg.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SummaryRow({ name, value, change, warningOnRise, highlight }: {
  name: string;
  value: string;
  change: number;
  warningOnRise?: boolean;
  highlight?: boolean;
}) {
  const arrow = warningOnRise && change > 0 ? '⚠️' : change >= 1 ? '🟢' : change <= -1 ? '🔴' : change > 0 ? '➡️' : '➡️';
  const tone = change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-slate-400';
  return (
    <tr className={cn('hover:bg-bg-soft', highlight && 'bg-accent/5')}>
      <td className={cn('px-3 py-2.5', highlight ? 'font-semibold text-accent' : 'text-slate-200')}>{name}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">{value}</td>
      <td className={cn('px-3 py-2.5 text-right tabular-nums', tone)}>
        {arrow} {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </td>
    </tr>
  );
}

export function MiniStat({ label, value, change }: { label: string; value: string; change?: number }) {
  const showChange = change != null;
  const tone = showChange ? (change >= 0 ? 'text-success' : 'text-danger') : 'text-slate-400';
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-100">{value}</div>
      {showChange && (
        <div className={cn('mt-0.5 text-xs tabular-nums', tone)}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

export function FearGreedMini({ fg }: { fg: FearGreedSnapshot }) {
  const t = fearGreedTone(fg.value);
  const tones = {
    danger:  'text-danger',
    warning: 'text-warning',
    slate:   'text-slate-300',
    success: 'text-success',
    accent:  'text-accent',
  } as const;
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">Fear & Greed</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn('text-xl font-bold tabular-nums', tones[t.tone])}>{fg.value}</span>
        <span className="text-[10px] text-slate-500">/100</span>
      </div>
      <div className={cn('mt-0.5 text-xs', tones[t.tone])}>{t.label}</div>
    </div>
  );
}

export function FuturesRow({ name, value, change, warningOnRise }: {
  name: string;
  value: number;
  change: number;
  warningOnRise?: boolean;
}) {
  const arrow = warningOnRise && change > 0 ? '⚠️' : change >= 0.05 ? '🟢' : change <= -0.05 ? '🔴' : '➡️';
  const tone = change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-slate-400';
  return (
    <tr className="hover:bg-bg-soft">
      <td className="px-3 py-2.5 text-slate-200">{name}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">{value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
      <td className={cn('px-3 py-2.5 text-right tabular-nums', tone)}>
        {arrow} {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </td>
    </tr>
  );
}
