/**
 * Temettü Takvimi Widget — yaklaşan BIST temettü olaylarını gösterir.
 * Compact modda Piyasa Özeti altında Ekonomik Takvim'in yanında yer alır.
 */
import { Link } from 'react-router-dom';
import { Coins, ChevronRight } from 'lucide-react';
import { upcomingDividends } from '@/data/dividendCalendar';
import { cn } from '@/lib/utils';

interface Props {
  compact?: boolean;
  maxItems?: number;
  daysAhead?: number;
  className?: string;
}

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
}

function formatTRY(v: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(v);
}

export function DividendCalendarWidget({ compact = false, maxItems = 6, daysAhead = 90, className }: Props) {
  const events = upcomingDividends(new Date(), daysAhead).slice(0, maxItems);

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-bg-card/60 backdrop-blur-sm overflow-hidden',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-bg-soft/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-warning/15 text-warning">
            <Coins size={14} />
          </span>
          <div>
            <div className="text-xs font-semibold text-slate-100">Temettü Takvimi</div>
            <div className="text-[10px] text-slate-500">
              {events.length > 0 ? `${events.length} yaklaşan olay` : 'Yaklaşan olay yok'}
            </div>
          </div>
        </div>
        <Link
          to="/takvim?tab=temettu"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[10px] text-slate-400 transition hover:border-warning/40 hover:text-warning"
        >
          tümü <ChevronRight size={10} />
        </Link>
      </div>
      <div className="divide-y divide-border">
        {events.length === 0 && (
          <div className="p-4 text-center text-[11px] text-slate-500">
            Önümüzdeki {daysAhead} gün için kayıtlı temettü olayı yok.
          </div>
        )}
        {events.map((e) => (
          <Link
            key={`${e.symbol}-${e.exDate}`}
            to={`/hisse/${e.symbol}`}
            className={cn(
              'flex items-center justify-between gap-3 px-3 py-2 transition hover:bg-bg-soft/40',
              compact ? 'py-1.5' : 'py-2',
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-11 shrink-0 rounded-md border border-warning/20 bg-warning/10 px-1 py-0.5 text-center text-[9px] font-semibold uppercase text-warning">
                {formatShortDate(e.exDate)}
              </div>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-slate-100 truncate">
                  {e.symbol} <span className="ml-1 font-normal text-[10px] text-slate-500">{e.name}</span>
                </div>
                {!compact && e.note && (
                  <div className="text-[10px] text-slate-500 truncate">{e.note}</div>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[12px] font-bold text-success">{formatTRY(e.grossPerShare)} ₺</div>
              {e.yieldPct != null && (
                <div className="text-[10px] text-slate-400">%{e.yieldPct.toFixed(1)} verim</div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
