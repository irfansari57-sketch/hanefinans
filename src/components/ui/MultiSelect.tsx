import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useIsMobile';

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Sağda gösterilen sayaç (ör. üye hisse sayısı) */
  count?: number;
}

interface Props {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Arama kutusu eşiği — bu sayıdan fazla seçenek varsa arama görünür */
  searchFrom?: number;
  className?: string;
}

/**
 * Çoklu seçim açılır kutusu (Design 03). Desktop: popover; mobil (<768): alt tabaka.
 * Klavye: Esc kapatır. Seçili sayısı düğmede rozet olarak görünür.
 */
export function MultiSelect({ label, options, selected, onChange, searchFrom = 8, className }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => { if (!open) setQ(''); }, [open]);

  const visible = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr-TR');
    return t ? options.filter((o) => o.label.toLocaleLowerCase('tr-TR').includes(t)) : options;
  }, [options, q]);

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const n = selected.length;

  const list = (
    <>
      {options.length >= searchFrom && (
        <div className="relative mb-2">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
          <input
            autoFocus={!isMobile}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ara…"
            className="input h-8 w-full pl-8 text-xs"
          />
        </div>
      )}
      <div className={cn('overflow-y-auto', isMobile ? 'max-h-[55vh]' : 'max-h-72')} role="listbox" aria-multiselectable>
        {visible.length === 0 && <div className="px-2 py-3 text-xs text-fg-3">Eşleşme yok</div>}
        {visible.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => toggle(o.value)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 text-left text-[13px] hover:bg-bg-card',
                isMobile ? 'h-11' : 'h-8',
                on ? 'text-fg' : 'text-fg-2',
              )}
            >
              <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded border', on ? 'border-accent bg-accent text-accent-fg' : 'border-border')}>
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.count != null && <span className="font-mono text-[11px] text-fg-3">{o.count}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <button type="button" onClick={() => onChange([])} disabled={n === 0} className="text-xs text-fg-2 hover:text-fg disabled:opacity-40">Temizle</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary h-7 px-3 text-xs">Tamam</button>
      </div>
    </>
  );

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-chip items-center gap-1.5 rounded-md border px-2.5 text-xs transition',
          n > 0 ? 'border-accent/50 bg-accent/10 text-fg' : 'border-border bg-bg-soft text-fg-2 hover:text-fg',
        )}
      >
        <span>{label}</span>
        {n > 0 && <span className="rounded bg-accent/20 px-1 font-mono text-[10px] font-bold text-accent">{n}</span>}
        <ChevronDown size={13} className={cn('transition', open && 'rotate-180')} />
      </button>

      {open && !isMobile && (
        <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-md border border-border bg-bg-soft p-2">
          {list}
        </div>
      )}

      {open && isMobile && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setOpen(false)}>
          <div className="w-full rounded-t-2xl border-t border-border bg-bg-soft p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-fg">{label}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat" className="rounded p-1 text-fg-2 hover:text-fg"><X size={16} /></button>
            </div>
            {list}
          </div>
        </div>
      )}
    </div>
  );
}
