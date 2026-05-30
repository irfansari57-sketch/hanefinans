import { Link } from 'react-router-dom';
import { ChevronRight, ExternalLink } from 'lucide-react';
import type { FundPerformance } from '@/data/types';
import { cn } from '@/lib/utils';

/**
 * TEFAS fonu akordeon satırı. Summary'de kod + kategori + 1Y getiri,
 * açılınca tüm dönem performansları + detay linkleri.
 */
export function FundAccordionItem({ fund, rank }: { fund: FundPerformance; rank: number }) {
  const yearTone = fund.year >= 0 ? 'text-success' : 'text-danger';
  const isLong = fund.year > 0;

  return (
    <details className={cn(
      'group rounded-lg border transition',
      isLong ? 'border-success/40 bg-success/5' : 'border-border bg-bg-soft hover:border-accent/40',
    )}>
      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm select-none [&::-webkit-details-marker]:hidden">
        <span className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-md border font-bold text-xs',
          isLong ? 'border-success/40 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning',
        )}>
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link to={`/fund/${fund.code}`} className="font-mono font-bold text-slate-100 hover:text-accent" onClick={(e) => e.stopPropagation()}>
              {fund.code}
            </Link>
            <span className="rounded border border-border bg-bg-card px-1 py-0.5 text-[9px] text-slate-400">{fund.category}</span>
            {fund.tefas && (
              <span className="rounded bg-success/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">TEFAS</span>
            )}
          </div>
          {fund.name && <div className="truncate text-[10px] text-slate-500">{fund.name}</div>}
        </div>
        <div className="hidden md:flex items-center gap-1 text-[9px]">
          <PerfMicro label="1A" value={fund.month} />
          <PerfMicro label="3A" value={fund.threeMonth} />
          <PerfMicro label="YTD" value={fund.ytd} />
        </div>
        <div className="w-20 text-right">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">1 Yıl</div>
          <div className={cn('text-sm font-bold tabular-nums', yearTone)}>
            {fund.year >= 0 ? '+' : ''}{fund.year.toFixed(2)}%
          </div>
        </div>
        <ChevronRight size={14} className="shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
      </summary>

      <div className="border-t border-border bg-bg-card p-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <PerfMini label="Gün" value={fund.day} />
          <PerfMini label="1 Hafta" value={fund.week} />
          <PerfMini label="1 Ay" value={fund.month} />
          <PerfMini label="3 Ay" value={fund.threeMonth} />
          <PerfMini label="6 Ay" value={fund.sixMonth} />
          <PerfMini label="YTD" value={fund.ytd} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`/fund/${fund.code}`} className="btn-primary">
            Detay <ChevronRight size={14} />
          </Link>
          <a
            href={`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${fund.code}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20"
          >
            TEFAS <ExternalLink size={11} />
          </a>
          <a
            href={`https://fintables.com/fonlar/${fund.code}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
          >
            Fintables <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </details>
  );
}

/** Summary'de compact mini perf chip (1A/3A/YTD için). */
function PerfMicro({ label, value }: { label: string; value: number }) {
  if (!Number.isFinite(value)) {
    return <span className="rounded bg-bg-card px-1 py-0.5 text-slate-500">{label} —</span>;
  }
  const tone = value >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger';
  return (
    <span className={cn('rounded px-1 py-0.5 font-mono tabular-nums', tone)}>
      {label} {value >= 0 ? '+' : ''}{value.toFixed(1)}
    </span>
  );
}

function PerfMini({ label, value }: { label: string; value: number }) {
  if (!Number.isFinite(value)) {
    return (
      <div className="rounded bg-bg-card px-2 py-1.5">
        <div className="text-[10px] text-slate-500">{label}</div>
        <div className="tabular-nums text-slate-600">—</div>
      </div>
    );
  }
  const tone = value >= 0 ? 'text-success' : 'text-danger';
  return (
    <div className="rounded bg-bg-card px-2 py-1.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={cn('text-sm font-medium tabular-nums', tone)}>
        {value >= 0 ? '+' : ''}{value.toFixed(2)}%
      </div>
    </div>
  );
}
