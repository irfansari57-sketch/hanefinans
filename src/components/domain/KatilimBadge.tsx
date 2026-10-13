import { katilimLabel } from '@/hooks/useKatilim';
import type { KatilimIndex } from '@/data/katilim';

/**
 * "KATILIM" rozeti — hisse BIST Katılım endeksine (XKTUM vb.) dahilse.
 * Kaynak: BIST endeks bileşimi (FVT aracılığıyla, günlük yenilenir).
 * Yatırım tavsiyesi değildir; yalnızca endeks üyeliği bilgisidir.
 */
export function KatilimBadge({ indices, size = 'sm' }: { indices?: KatilimIndex[]; size?: 'sm' | 'md' }) {
  const label = katilimLabel(indices);
  if (!label) return null;
  const cls = size === 'md'
    ? 'px-2 py-0.5 text-[11px]'
    : 'px-1.5 py-px text-[10px]';
  return (
    <span
      title={label}
      className={`inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/10 font-semibold uppercase tracking-wide text-emerald-300 ${cls}`}
    >
      Katılım
    </span>
  );
}
