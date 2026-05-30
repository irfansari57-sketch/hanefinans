import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {icon && <div className="rounded-full bg-bg-soft p-4 text-slate-400">{icon}</div>}
      <div>
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {description && <p className="mt-1 max-w-xs text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
