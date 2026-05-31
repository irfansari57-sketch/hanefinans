/**
 * Ekonomik Takvim Widget — Kürate edilmiş TR-odakli olay listesi.
 *
 * Eski TradingView embed kaldirildi (kullanici talebi: TR-specific kurate icerik).
 *
 * KULLANIM:
 *   <EconomicCalendarWidget />              // full, /takvim sayfasi icin
 *   <EconomicCalendarWidget compact />      // sticky right rail icin
 *   <EconomicCalendarWidget maxItems={5} /> // limited
 */

import { useMemo } from 'react';
import { CalendarClock, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CURATED_CALENDAR,
  upcomingEvents,
  type CalendarEvent,
  type EventImportance,
  type EventCategory,
} from '@/data/curatedCalendar';

interface Props {
  /** Sticky/dar kolon icin kompakt — sadece bashk + tarih + onem */
  compact?: boolean;
  /** Max gosterilecek olay sayisi (compact=5, full=20). */
  maxItems?: number;
  /** Kaca gun ilerideki olaylari goster (default: 14). */
  daysAhead?: number;
  className?: string;
}

const CATEGORY_LABEL: Record<EventCategory, string> = {
  monetary: 'Para Politikasi',
  data: 'Veri',
  political: 'Siyasi',
  holiday: 'Tatil',
  derivatives: 'Vade',
  corporate: 'Sirket',
};

const COUNTRY_FLAG: Record<string, string> = {
  TR: '🇹🇷',
  US: '🇺🇸',
  EU: '🇪🇺',
  UK: '🇬🇧',
  GLOBAL: '🌐',
};

const IMPORTANCE_DOT: Record<EventImportance, string> = {
  high: 'bg-danger',
  medium: 'bg-warning',
  low: 'bg-slate-500',
};

const IMPORTANCE_LABEL: Record<EventImportance, string> = {
  high: 'Yuksek etki',
  medium: 'Orta etki',
  low: 'Dusuk etki',
};

function formatDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const dayName = ['Paz', 'Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt'][d.getDay()];
  const dayNum = d.getDate();
  const monthName = ['Oca', 'Sub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Agu', 'Eyl', 'Eki', 'Kas', 'Ara'][d.getMonth()];

  if (diffDays === 0) return 'Bugun';
  if (diffDays === 1) return 'Yarin';
  if (diffDays > 1 && diffDays < 7) return `${dayName} (${dayNum} ${monthName})`;
  return `${dayNum} ${monthName} ${dayName}`;
}

function ImpactIcon({ impact }: { impact?: CalendarEvent['impact'] }) {
  if (impact === 'bullish') return <TrendingUp size={11} className="text-success" />;
  if (impact === 'bearish') return <TrendingDown size={11} className="text-danger" />;
  if (impact === 'neutral') return <Minus size={11} className="text-slate-400" />;
  return null;
}

export function EconomicCalendarWidget({
  compact = false,
  maxItems,
  daysAhead = 14,
  className,
}: Props) {
  const limit = maxItems ?? (compact ? 5 : 25);
  const events = useMemo(() => {
    const ev = upcomingEvents(new Date(), daysAhead);
    return ev.slice(0, limit);
  }, [daysAhead, limit]);

  if (events.length === 0) {
    return (
      <div className={cn('rounded-xl border border-border bg-bg-soft p-4 text-center text-xs text-slate-500', className)}>
        <CalendarClock size={20} className="mx-auto mb-2 opacity-50" />
        Yaklasan onemli olay yok.
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-border bg-bg-soft overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-bg-card/50">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <CalendarClock size={13} className="text-warning" />
          Ekonomik Takvim
        </div>
        <span className="text-[10px] text-slate-500">{events.length} olay</span>
      </div>

      <ul className="divide-y divide-border max-h-[640px] overflow-y-auto">
        {events.map((e) => (
          <li key={e.id} className={cn('px-3 py-2.5', compact ? 'space-y-1' : 'space-y-1.5')}>
            {/* Header: tarih + onem nokta + ulke */}
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span
                className={cn('w-1.5 h-1.5 rounded-full', IMPORTANCE_DOT[e.importance])}
                title={IMPORTANCE_LABEL[e.importance]}
                aria-label={IMPORTANCE_LABEL[e.importance]}
              />
              <span className="font-semibold text-slate-300">{formatDate(e.date)}</span>
              {e.time && <span className="tabular-nums">{e.time}</span>}
              <span className="text-base leading-none">{COUNTRY_FLAG[e.country] ?? '•'}</span>
              <span className="ml-auto text-[9px] uppercase tracking-wider text-slate-500">
                {CATEGORY_LABEL[e.category]}
              </span>
            </div>

            {/* Title */}
            <div className="flex items-start gap-1.5">
              <ImpactIcon impact={e.impact} />
              <h4 className={cn('font-semibold text-slate-100', compact ? 'text-xs' : 'text-sm')}>
                {e.title}
              </h4>
            </div>

            {/* Description + expectation (full only) */}
            {!compact && (e.description || e.expectation) && (
              <div className="space-y-1 pl-4 text-[11px] leading-relaxed text-slate-400">
                {e.description && <p>{e.description}</p>}
                {e.expectation && (
                  <p className="flex items-start gap-1 text-slate-300">
                    <AlertCircle size={10} className="mt-0.5 shrink-0 text-accent" />
                    <span>{e.expectation}</span>
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="border-t border-border px-3 py-1.5 text-[9px] text-slate-500">
        Kaynaklar: TCMB, FED, ECB, TÜİK, BLS, Eurostat, BIST. Tarihler resmi takvimlere göre.
      </div>
    </div>
  );
}

/** Export count helper — Layout/Panel'de "5 yaklasan olay" gibi badge icin. */
export function useUpcomingEventCount(daysAhead = 7): number {
  return upcomingEvents(new Date(), daysAhead).length;
}

// Re-export for convenience
export { CURATED_CALENDAR, upcomingEvents };
export type { CalendarEvent };
