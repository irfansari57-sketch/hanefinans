import type { ReactNode } from 'react';
import { ShareButton } from './ShareButton';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Paylas butonunu gizle (bazi sayfalar icin ozel). Varsayilan false = gorunur. */
  hideShare?: boolean;
}

export function PageHeader({ title, subtitle, actions, hideShare = false }: PageHeaderProps) {
  // Kompakt varyant (11 Eylul 2026): buyuk hero'lar viewport'un ust kismini
  // fazla kapliyordu, kullanici icerik/hesaplayici/liste'ye hemen ulasmali.
  // - Baslik: text-2xl -> text-base
  // - Alt yazi: text-sm -> text-[11px] (tek satirlik hint)
  // - Alt bosluk: mb-6 -> mb-3
  // - Paylas butonu: her sayfa basliginda saga, Web Share API + fallback copy link
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
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {!hideShare && <ShareButton title={`${title} | InvestliQ`} text={subtitle} />}
      </div>
    </div>
  );
}
