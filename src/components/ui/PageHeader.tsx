import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  // Kompakt varyant (11 Eylul 2026): buyuk hero'lar viewport'un ust kismini
  // fazla kapliyordu, kullanici icerik/hesaplayici/liste'ye hemen ulasmali.
  // - Baslik: text-2xl -> text-base
  // - Alt yazi: text-sm -> text-[11px] (tek satirlik hint)
  // - Alt bosluk: mb-6 -> mb-3
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h1 className="text-base font-semibold tracking-tight text-slate-100">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400 line-clamp-1 sm:line-clamp-none">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
