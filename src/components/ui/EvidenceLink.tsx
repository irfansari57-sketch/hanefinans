import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface EvidenceRow {
  label: string;
  value: string;
  /** Kaynak kısa adı: FVT, Yahoo, KAP, bars_daily, TCMB… */
  source?: string;
  /** ISO ya da okunur zaman */
  at?: string;
}

/**
 * "▸" kanıt işareti — Design 03 Signature #2.
 * Her analiz/AI cümlesinin yanında durur; tıklanınca cümleyi üreten veri
 * satırlarını gösterir. Dipnot mantığı: chatbot değil, kaynak.
 * Kanıtsız cümle render edilmez (rows boşsa hiçbir şey çizilmez).
 */
export function EvidenceLink({ rows, title = 'Kanıt', className }: { rows: EvidenceRow[]; title?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!rows || rows.length === 0) return null;
  return (
    <span ref={ref} className={cn('relative inline-block align-baseline', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${title}: ${rows.length} veri satırı`}
        onClick={() => setOpen((v) => !v)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded text-accent hover:bg-accent/15"
      >
        <span aria-hidden className="text-[11px] leading-none">▸</span>
      </button>
      {open && (
        <span
          role="dialog"
          className="absolute left-0 top-5 z-40 w-72 rounded-md border border-border bg-bg-soft p-2 text-left shadow-none"
        >
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-3">{title}</span>
          <span className="block divide-y divide-border">
            {rows.map((r, i) => (
              <span key={i} className="flex items-baseline justify-between gap-3 py-1 text-xs">
                <span className="text-fg-2">{r.label}</span>
                <span className="text-right">
                  <span className="font-mono text-fg">{r.value}</span>
                  {(r.source || r.at) && (
                    <span className="block text-[10px] text-fg-3">{[r.source, r.at].filter(Boolean).join(' · ')}</span>
                  )}
                </span>
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}
