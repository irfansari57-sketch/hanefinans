/**
 * PinnableAccordion — başlık + pin toggle + açılır gövde.
 *
 * Pin'lenince localStorage'da user-namespaced anahtarda saklanır
 * (`fa.panel.accordion-pin.<id>.<userId>`) → sonraki sayfa açılışında
 * açık olarak gelir. Pin'lenmemiş accordion'lar default kapalıdır.
 *
 * Cross-user kontaminasyon yok: chat_id fix'iyle aynı pattern.
 */

import { useState, useEffect, type ReactNode, type MouseEvent } from 'react';
import { ChevronRight, Pin, PinOff } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { cn } from '@/lib/utils';

interface Props {
  /** Accordion'a özgü stabil id (örn. "agent-sentiment"). LocalStorage anahtarında kullanılır. */
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  iconColorClass?: string;
  /** Pin'siz default durum (genelde false = kapalı). */
  defaultOpen?: boolean;
  children: ReactNode;
}

function pinKey(id: string, userId: string | number | null | undefined): string {
  return `fa.panel.accordion-pin.${id}.${userId ?? 'anon'}`;
}

export function PinnableAccordion({
  id, title, description, icon, iconColorClass = 'bg-accent/15 text-accent',
  defaultOpen = false, children,
}: Props) {
  const user = useAuth((s) => s.user);
  const userId = user?.id ?? 'anon';
  const key = pinKey(id, userId);

  const [pinned, setPinned] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(defaultOpen);

  // İlk mount + user/key değişikliğinde localStorage'dan oku
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      const isPinned = v === '1';
      setPinned(isPinned);
      setOpen(isPinned || defaultOpen);
    } catch {
      // localStorage erişiminde sorun varsa default kapalı
    }
  }, [key, defaultOpen]);

  const togglePin = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !pinned;
    setPinned(next);
    try {
      localStorage.setItem(key, next ? '1' : '0');
    } catch {
      /* */
    }
    // Pin'lerken kart kapalıysa otomatik aç (mantıklı UX)
    if (next) setOpen(true);
  };

  return (
    <details
      className={cn(
        'mb-2 sm:mb-2 overflow-hidden rounded-xl border bg-bg-soft transition',
        pinned ? 'border-warning/30' : 'border-border',
      )}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2 select-none [&::-webkit-details-marker]:hidden hover:bg-bg-card/30">
        {icon && (
          <span className={cn('grid h-7 w-7 sm:h-8 sm:w-8 shrink-0 place-items-center rounded-lg', iconColorClass)}>
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            {pinned && (
              <span className="rounded-full bg-warning/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">
                Pinli
              </span>
            )}
          </div>
          {description && <p className="mt-0.5 text-[11px] text-slate-500 truncate">{description}</p>}
        </div>
        <button
          type="button"
          onClick={togglePin}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition',
            pinned
              ? 'border-warning/40 bg-warning/10 text-warning'
              : 'border-border bg-bg-card text-slate-400 hover:border-warning/30 hover:text-warning',
          )}
          title={pinned
            ? 'Pin\'i kaldır (sonraki açılışta kapalı gelir)'
            : 'Pinle (her sayfa açılışında otomatik açık gelir)'}
          aria-label={pinned ? 'Pin\'i kaldır' : 'Pinle'}
        >
          {pinned ? <Pin size={11} fill="currentColor" /> : <PinOff size={11} />}
          <span className="hidden sm:inline">{pinned ? 'Pinli' : 'Pin'}</span>
        </button>
        <ChevronRight
          size={14}
          className={cn('shrink-0 text-slate-500 transition-transform', open && 'rotate-90')}
        />
      </summary>
      <div className="border-t border-border bg-bg-card p-2 sm:p-3">
        {children}
      </div>
    </details>
  );
}
