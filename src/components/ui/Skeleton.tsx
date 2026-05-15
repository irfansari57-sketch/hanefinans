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
