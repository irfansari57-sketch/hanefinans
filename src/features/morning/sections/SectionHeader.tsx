import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SectionHeader({
  icon: Icon, title, tone,
}: { icon: LucideIcon; title: string; tone: 'warning' | 'success' | 'danger' | 'accent' }) {
  const tones = {
    warning: 'bg-warning/15 text-warning',
    success: 'bg-success/15 text-success',
    danger:  'bg-danger/15 text-danger',
    accent:  'bg-accent/15 text-accent',
  };
  return (
    <div className="flex items-center gap-3">
      <span className={cn('grid h-10 w-10 place-items-center rounded-lg', tones[tone])}>
        <Icon size={18} />
      </span>
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
    </div>
  );
}
