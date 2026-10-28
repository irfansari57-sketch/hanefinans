/**
 * EligibilityBadge — "Nitelikli" (kilit, amber) / "Genel" (açık, nötr) yatırımcı uygunluğu rozeti (28 Eki 2026).
 * Tooltip: neden + SPK 50 milyon TL kuralı. Yatırım tavsiyesi değildir.
 */
import { Lock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { eligibilityOf, QUALIFIED_RULE_NOTE } from '@/lib/investorEligibility';

export function EligibilityBadge({ name, category, size = 'sm', showGenel = false, className }: {
  name: string | null | undefined;
  category?: string | null;
  size?: 'sm' | 'md';
  /** Listelerde kalabalık olmasın diye "Genel" varsayılan gizli; detay sayfasında gösterilir */
  showGenel?: boolean;
  className?: string;
}) {
  const e = eligibilityOf(name, category);
  if (e.kind === 'genel' && !showGenel) return null;
  const q = e.kind === 'nitelikli';
  const Icon = q ? Lock : Users;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded border font-bold uppercase tracking-wider whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[11px]',
        q ? 'border-warning/50 bg-warning/15 text-warning' : 'border-border bg-bg-card text-fg-2',
        e.confidence === 'low' && 'opacity-70',
        className,
      )}
      title={`${q ? 'Yalnız nitelikli yatırımcı' : 'Genel yatırımcıya açık'} — ${e.reason}.\n${QUALIFIED_RULE_NOTE}`}
      aria-label={q ? 'Yalnız nitelikli yatırımcıya satılır' : 'Genel yatırımcıya açık'}
    >
      <Icon size={size === 'sm' ? 9 : 12} />
      {e.label}{e.confidence === 'low' ? '?' : ''}
    </span>
  );
}
