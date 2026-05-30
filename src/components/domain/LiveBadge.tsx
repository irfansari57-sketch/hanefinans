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
  // Kullanıcı isteğiyle tüm canlı rozetleri gizlendi.
  void updatedAt; void label; void size; void refreshing;
  return null;
}
