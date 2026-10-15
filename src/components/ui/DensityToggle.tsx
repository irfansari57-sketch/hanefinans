import { useDensity, DENSITY_LABELS, type Density } from '@/store/density';
import { cn } from '@/lib/utils';

const ORDER: Density[] = ['comfortable', 'standard', 'compact'];

/** Sade / Standart / Yoğun — segment anahtarı (Design 03). */
export function DensityToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const density = useDensity((s) => s.density);
  const setDensity = useDensity((s) => s.setDensity);
  const items = compact ? (['comfortable', 'compact'] as Density[]) : ORDER;
  return (
    <div
      role="radiogroup"
      aria-label="Yoğunluk"
      className={cn('inline-flex h-7 overflow-hidden rounded-md border border-border bg-bg-soft', className)}
    >
      {items.map((d) => {
        const on = density === d;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setDensity(d)}
            className={cn(
              'px-2.5 text-xs transition',
              on ? 'bg-bg-card text-fg' : 'text-fg-2 hover:text-fg',
            )}
          >
            {DENSITY_LABELS[d]}
          </button>
        );
      })}
    </div>
  );
}
