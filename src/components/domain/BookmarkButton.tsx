import { useEffect, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { bookmarksRepo } from '@/data/repositories';
import { cn } from '@/lib/utils';
import type { NewsItem } from '@/data/types';

interface BookmarkButtonProps {
  item: NewsItem;
  size?: number;
}

export function BookmarkButton({ item, size = 13 }: BookmarkButtonProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let alive = true;
    bookmarksRepo.isBookmarked(item.id).then((b) => alive && setActive(b));
    return () => {
      alive = false;
    };
  }, [item.id]);

  const toggle = async () => {
    const next = await bookmarksRepo.toggle({
      newsId: item.id,
      snapshot: {
        title: item.title,
        source: item.source,
        symbols: item.symbols,
        publishedAt: item.publishedAt,
      },
    });
    setActive(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition',
        active ? 'text-accent hover:bg-accent/10' : 'text-slate-400 hover:bg-bg-card hover:text-slate-200',
      )}
      title={active ? 'Kayıttan kaldır' : 'Kaydet'}
    >
      <Bookmark size={size} fill={active ? 'currentColor' : 'none'} />
      <span className="hidden sm:inline">{active ? 'Kayıtlı' : 'Kaydet'}</span>
    </button>
  );
}
