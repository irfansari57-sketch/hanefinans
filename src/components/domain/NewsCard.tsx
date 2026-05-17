import { ExternalLink } from 'lucide-react';
import type { NewsItem } from '@/data/types';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/date';
import { BookmarkButton } from './BookmarkButton';
import { NoteButton } from './NoteButton';
import { SymbolBadge } from './SymbolBadge';
import { activityRepo } from '@/data/repositories';

interface NewsCardProps {
  item: NewsItem;
}

const sourceTone: Record<NewsItem['source'], string> = {
  KAP: 'bg-accent/15 text-accent border-accent/20',
  Reuters: 'bg-warning/15 text-warning border-warning/20',
  Bloomberg: 'bg-warning/15 text-warning border-warning/20',
  Diğer: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
};

function importanceBg(importance: number) {
  if (importance >= 8) return 'bg-danger/15 text-danger border-danger/20';
  if (importance >= 6) return 'bg-warning/15 text-warning border-warning/20';
  if (importance >= 4) return 'bg-accent/15 text-accent border-accent/20';
  return 'bg-slate-500/15 text-slate-400 border-slate-500/20';
}

export function NewsCard({ item }: NewsCardProps) {
  const onDetail = () => {
    activityRepo
      .log({ type: 'news-viewed', newsId: item.id, symbol: item.symbols[0], detail: item.title.slice(0, 80) })
      .catch(() => {});
  };

  return (
    <article className="rounded-xl border border-border bg-bg-soft p-4 transition-colors hover:border-slate-500/40">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.symbols.map((s) => (
            <SymbolBadge key={s} symbol={s} />
          ))}
          <span className={cn('rounded border px-1.5 py-0.5 text-[11px]', sourceTone[item.source])}>
            {item.source}
          </span>
          <span className={cn('rounded border px-1.5 py-0.5 text-[11px]', importanceBg(item.importance))}>
            Önem {item.importance}
          </span>
        </div>
        <span className="shrink-0 text-slate-500">{formatRelative(item.publishedAt)}</span>
      </div>
      <h3 className="mt-2.5 text-sm font-semibold leading-snug text-slate-100">{item.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.summary}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={onDetail}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-accent transition hover:bg-accent/10"
          >
            Detay <ExternalLink size={11} />
          </a>
        )}
        <BookmarkButton item={item} />
        <NoteButton newsId={item.id} hint={`Haber: ${item.title.slice(0, 50)}…`} />
      </div>
    </article>
  );
}
