import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastAction {
  /** Buton etiketi — örn. "Geri Al" */
  label: string;
  /** Tıklayınca çalışacak callback (toast otomatik kapanır) */
  onClick: () => void;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  ttlMs: number;
  /** Opsiyonel: sağ tarafta aksiyon butonu (Geri Al, vb.) */
  action?: ToastAction;
}

interface ToastState {
  items: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => number;
  dismiss: (id: number) => void;
}

let counter = 1;

export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (t) => {
    const id = counter++;
    set((s) => ({ items: [...s.items, { id, ...t }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

interface ToastExtras {
  ttlMs?: number;
  action?: ToastAction;
}

/** Kolaylık fonksiyonları — bileşen dışından çağırılır. */
export const toast = {
  success: (title: string, message?: string, extras?: ToastExtras) =>
    useToast.getState().push({ kind: 'success', title, message, ttlMs: extras?.ttlMs ?? 4000, action: extras?.action }),
  error: (title: string, message?: string, extras?: ToastExtras) =>
    useToast.getState().push({ kind: 'error', title, message, ttlMs: extras?.ttlMs ?? 6000, action: extras?.action }),
  info: (title: string, message?: string, extras?: ToastExtras) =>
    useToast.getState().push({ kind: 'info', title, message, ttlMs: extras?.ttlMs ?? 4000, action: extras?.action }),
  warning: (title: string, message?: string, extras?: ToastExtras) =>
    useToast.getState().push({ kind: 'warning', title, message, ttlMs: extras?.ttlMs ?? 5000, action: extras?.action }),
  /** Programatik dismiss — push'tan dönen id ile manuel kapatma */
  dismiss: (id: number) => useToast.getState().dismiss(id),
};

const ICONS = {
  success: CheckCircle2,
  error:   XCircle,
  info:    Info,
  warning: AlertTriangle,
} as const;

const STYLES: Record<ToastKind, string> = {
  success: 'border-success/40 bg-success/10 text-success',
  error:   'border-danger/40 bg-danger/10 text-danger',
  info:    'border-accent/40 bg-accent/10 text-accent',
  warning: 'border-warning/40 bg-warning/10 text-warning',
};

/** Sayfanın sağ alt köşesinde stack — Layout'tan render edilir. */
export function ToastContainer() {
  const items = useToast((s) => s.items);
  const dismiss = useToast((s) => s.dismiss);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2 sm:bottom-6 sm:right-6 max-w-[calc(100vw-2rem)]">
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);
  const Icon = ICONS[item.kind];

  useEffect(() => {
    const t = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 200);
    }, item.ttlMs);
    return () => clearTimeout(t);
  }, [item.ttlMs, onDismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-80 max-w-full items-start gap-3 rounded-lg border bg-bg-card/95 p-3 shadow-2xl backdrop-blur-md',
        STYLES[item.kind],
        exiting ? 'toast-exit' : 'toast-enter',
      )}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-100">{item.title}</div>
        {item.message && <div className="mt-0.5 text-xs text-slate-300 leading-relaxed">{item.message}</div>}
      </div>
      {item.action && (
        <button
          onClick={() => {
            try { item.action!.onClick(); } catch { /* */ }
            setExiting(true);
            setTimeout(onDismiss, 200);
          }}
          className="shrink-0 rounded-md border border-current/30 bg-current/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider transition hover:bg-current/20"
          style={{ borderColor: 'currentColor' }}
        >
          {item.action.label}
        </button>
      )}
      <button
        onClick={() => {
          setExiting(true);
          setTimeout(onDismiss, 200);
        }}
        className="shrink-0 rounded p-0.5 text-slate-500 transition hover:text-slate-200"
        aria-label="Kapat"
      >
        <X size={14} />
      </button>
    </div>
  );
}
