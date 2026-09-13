import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  /** String veya ReactNode — hata detay + link gibi kompleks içerik icin */
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {icon && <div className="rounded-full bg-bg-soft p-4 text-slate-400">{icon}</div>}
      <div>
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {description && (
          typeof description === 'string'
            ? <p className="mt-1 max-w-xs text-xs text-slate-500">{description}</p>
            : <div className="mt-1 max-w-md text-xs text-slate-500">{description}</div>
        )}
      </div>
      {action}
    </div>
  );
}
