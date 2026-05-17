import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/**
 * Sayfalama kontrolü — uzun listelerde (hisseler, fonlar) ekranı yormasın diye.
 * Önceki/Sonraki butonları + sayfa numaraları (1-2-3 ... son).
 * Toplam <= 1 sayfa ise hiç render edilmez.
 */
export function Pagination({ currentPage, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  // Görünür sayfa numaraları: aktif sayfa etrafında 2'şer + ilk + son + "…"
  const pages: (number | 'ellipsis')[] = [];
  const push = (n: number) => {
    if (!pages.includes(n)) pages.push(n);
  };
  push(1);
  for (let n = currentPage - 1; n <= currentPage + 1; n++) {
    if (n >= 2 && n <= totalPages - 1) push(n);
  }
  if (totalPages >= 2) push(totalPages);
  // Boşluklarda "…" yerleştir
  const withEllipsis: (number | 'ellipsis')[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && typeof p === 'number' && typeof pages[i - 1] === 'number' && p - (pages[i - 1] as number) > 1) {
      withEllipsis.push('ellipsis');
    }
    withEllipsis.push(p);
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-[11px] text-slate-500">
        <span className="text-slate-300">{start}–{end}</span> / {totalItems}
      </span>
      <div className="inline-flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-1 text-[11px] text-slate-300 transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-slate-300"
        >
          <ChevronLeft size={12} /> Önceki
        </button>
        {withEllipsis.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="px-1 text-[11px] text-slate-600">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                'min-w-[28px] rounded-md border px-2 py-1 text-[11px] tabular-nums transition',
                p === currentPage
                  ? 'border-accent/50 bg-accent/15 text-accent font-semibold'
                  : 'border-border bg-bg-soft text-slate-400 hover:border-accent/30 hover:text-accent',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-1 text-[11px] text-slate-300 transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-slate-300"
        >
          Sonraki <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
