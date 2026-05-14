import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface LiveBadgeProps {
  /** En son güncelleme zamanı (ms). undefined → "canlı bekleniyor". */
  updatedAt?: number;
  /** İçerik etiketi (varsayılan "CANLI"). */
  label?: string;
  /** Boyut. */
  size?: 'sm' | 'md';
  /** Yenileniyor mu — true ise hızlı pulse + farklı renk. */
  refreshing?: boolean;
}

function formatAgo(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 5) return 'şimdi';
  if (diff < 60) return `${diff} sn önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  return `${Math.floor(diff / 3600)} sa önce`;
}

export function LiveBadge({ updatedAt, label = 'CANLI', size = 'sm', refreshing = false }: LiveBadgeProps) {
  // Saniye sayacı için tick
  const [, force] = useState(0);
  useEffect(() => {
    if (!updatedAt) return;
    const id = setInterval(() => force((v) => v + 1), 5000);
    return () => clearInterval(id);
  }, [updatedAt]);

  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 font-medium uppercase tracking-wider text-success', text)}>
      <span className="relative inline-flex">
        <span className={cn('animate-ping absolute inline-flex rounded-full bg-success opacity-75', dotSize)} />
        <span className={cn('relative inline-flex rounded-full bg-success', dotSize)} />
      </span>
      {refreshing ? 'GÜNCELLENİYOR' : label}
      {updatedAt && !refreshing && (
        <span className="ml-1 normal-case text-success/70 font-normal">• {formatAgo(updatedAt)}</span>
      )}
    </span>
  );
}
