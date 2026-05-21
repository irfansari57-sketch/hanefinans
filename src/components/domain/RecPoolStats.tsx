/**
 * RecPoolStats — Öneriler sayfasının tüm tab'larında kullanılan generic
 * pool istatistik bileşeni (toplam adet, ortalama, dağılım, top/bottom).
 *
 * Algoritmik tab'daki ScalpPoolStats pattern'ini soyutlar. Her tab kendi
 * box konfigürasyonunu üretir (RecPoolStats sadece grid + tone uygular).
 */

import { cn } from '@/lib/utils';

export type StatTone = 'slate' | 'success' | 'danger' | 'accent' | 'warning';

export interface PoolStatBoxData {
  label: string;
  value: string;
  sub?: string;
  tone: StatTone;
}

export function PoolStatBox({ label, value, sub, tone }: PoolStatBoxData) {
  const colorClass =
    tone === 'success' ? 'text-success'
    : tone === 'danger' ? 'text-danger'
    : tone === 'accent' ? 'text-accent'
    : tone === 'warning' ? 'text-warning'
    : 'text-slate-100';
  return (
    <div className="rounded-lg border border-border bg-bg-soft px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-0.5 text-base font-bold tabular-nums leading-tight', colorClass)}>{value}</div>
      {sub && <div className="text-[9px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * 6 sütunlu (lg) pool stats grid'i.
 * Mobile: 2 cols, Tablet: 3 cols, Desktop: 6 cols.
 */
export function RecPoolStats({ boxes, title }: { boxes: PoolStatBoxData[]; title?: string }) {
  return (
    <div className="card mb-3 p-3">
      {title && <div className="mb-2 text-xs font-semibold text-slate-300">{title}</div>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {boxes.map((b, i) => <PoolStatBox key={i} {...b} />)}
      </div>
    </div>
  );
}
