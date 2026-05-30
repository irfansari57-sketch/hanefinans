import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  /** Aspect ratio short cuts */
  variant?: 'text' | 'circle' | 'rect' | 'line';
  width?: string | number;
  height?: string | number;
}

/** Animasyonlu shimmer placeholder — yükleniyor gösteren komponentlerde. */
export function Skeleton({ className, variant = 'rect', width, height }: SkeletonProps) {
  const presets = {
    text:   'h-3 rounded',
    circle: 'rounded-full',
    rect:   'rounded-md',
    line:   'h-1 rounded',
  };
  const style: React.CSSProperties = {};
  if (width)  style.width  = typeof width  === 'number' ? `${width}px`  : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;
  return <div className={cn('skeleton', presets[variant], className)} style={style} />;
}

/** Önceden hazır sayfa-seviyesi skeleton kompozisyonu. */
export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={180} height={28} />
        <div className="flex gap-2">
          <Skeleton variant="rect" width={80} height={32} />
          <Skeleton variant="rect" width={100} height={32} />
        </div>
      </div>
      <Skeleton variant="rect" height={120} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rect" height={80} />
        ))}
      </div>
      <Skeleton variant="rect" height={300} />
    </div>
  );
}

/** Liste/satır odaklı skeleton. */
export function RowSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-bg-card p-3">
          <Skeleton variant="circle" width={32} height={32} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="40%" />
          </div>
          <Skeleton variant="rect" width={60} height={20} />
        </div>
      ))}
    </div>
  );
}

/**
 * Tablo görünümlü sayfalar (Stocks, Funds, Watchlist) için.
 * Stikipte kolonlu, gerçek tablonun şeklini taklit eder — content shift olmaz.
 */
export function TableSkeleton({ rows = 10, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-soft">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-bg-card/40 px-3 py-2.5">
        <Skeleton variant="text" width={20} height={10} />
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} variant="text" width={i === 0 ? 80 : 50} height={10} />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton variant="text" width={16} height={12} />
            {Array.from({ length: cols }).map((__, c) => (
              <Skeleton key={c} variant="text" width={c === 0 ? 70 : 50} height={12} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kart grid skeleton — özet kutuları ve kart koleksiyonları için. */
export function CardGridSkeleton({ count = 6, cols = 3 }: { count?: number; cols?: 2 | 3 | 4 }) {
  const colsClass = cols === 2 ? 'sm:grid-cols-2' : cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';
  return (
    <div className={cn('grid gap-3 grid-cols-1', colsClass)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-bg-card p-4">
          <Skeleton variant="text" width={80} height={10} />
          <Skeleton className="mt-2" variant="text" width="60%" height={24} />
          <Skeleton className="mt-3" variant="text" width="40%" height={14} />
        </div>
      ))}
    </div>
  );
}
