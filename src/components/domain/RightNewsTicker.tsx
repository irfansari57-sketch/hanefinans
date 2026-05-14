import { useEffect, useMemo, useState } from 'react';
import { Newspaper, Radio, ExternalLink } from 'lucide-react';
import { loadNews } from '@/data/services';
import type { NewsItem } from '@/data/types';
import { MOCK_NEWS } from '@/data/mock';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/date';

const REFRESH_MS = 5 * 60_000;
const SCROLL_SPEED_SECONDS = 90; // tek tur süresi

const sourceTone: Record<string, string> = {
  KAP: 'bg-accent/15 text-accent border-accent/20',
  Reuters: 'bg-warning/15 text-warning border-warning/20',
  Bloomberg: 'bg-warning/15 text-warning border-warning/20',
  Diğer: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  GNews: 'bg-warning/15 text-warning border-warning/20',
};

export function RightNewsTicker() {
  const [news, setNews] = useState<NewsItem[]>(MOCK_NEWS);
  const [source, setSource] = useState<'live' | 'mock'>('mock');

  useEffect(() => {
    const fetchIt = () => {
      loadNews({ max: 20 }).then((r) => {
        setNews(r.data.length > 0 ? r.data : MOCK_NEWS);
        setSource(r.source);
      });
    };
    fetchIt();
    const id = setInterval(fetchIt, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Sonsuz akış için iki kez render
  const repeated = useMemo(() => [...news, ...news], [news]);

  return (
    <aside className="relative z-10 hidden 2xl:flex 2xl:w-80 2xl:flex-col border-l border-border bg-bg-soft/80 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent">
            <Newspaper size={14} />
          </span>
          <div>
            <div className="text-xs font-semibold text-slate-100">Gündem & Haberler</div>
            <div className="text-[10px] text-slate-500">aşağıdan yukarı akış</div>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            source === 'live' ? 'bg-success/15 text-success' : 'bg-warning/10 text-warning',
          )}
        >
          {source === 'live' && <Radio size={9} />}
          {source === 'live' ? 'CANLI' : 'DEMO'}
        </span>
      </div>

      {/* Akan içerik — overflow gizle, transform animasyon ile aşağıdan yukarı kaydır */}
      <div className="news-ticker-mask relative flex-1 overflow-hidden">
        <div
          className="news-ticker-track flex flex-col gap-2 px-3 py-2"
          style={{ animationDuration: `${SCROLL_SPEED_SECONDS}s` }}
        >
          {repeated.map((item, i) => {
            const tone = sourceTone[item.source] ?? sourceTone['Diğer'];
            const importance = item.importance;
            const importanceTone =
              importance >= 8 ? 'text-danger' :
              importance >= 6 ? 'text-warning' :
              'text-slate-400';
            return (
              <article
                key={`${item.id}-${i}`}
                className="rounded-lg border border-border bg-bg-card/85 backdrop-blur-sm p-2.5 transition-colors hover:border-accent/40"
              >
                <div className="flex items-center justify-between gap-1 text-[9px]">
                  <div className="flex items-center gap-1">
                    <span className={cn('rounded border px-1 py-0.5 font-medium', tone)}>
                      {item.source}
                    </span>
                    {item.symbols.slice(0, 1).map((s) => (
                      <span
                        key={s}
                        className="rounded border border-border bg-bg-soft px-1 py-0.5 font-mono text-accent"
                      >
                        {s}
                      </span>
                    ))}
                    <span className={cn('font-medium', importanceTone)}>●{importance}</span>
                  </div>
                  <span className="shrink-0 text-slate-500">{formatRelative(item.publishedAt)}</span>
                </div>
                <h3 className="mt-1.5 text-[11px] font-medium leading-snug text-slate-200 line-clamp-3">
                  {item.title}
                </h3>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
                  >
                    detay <ExternalLink size={9} />
                  </a>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-bg-soft/90 px-3 py-1.5 text-center text-[9px] text-slate-500">
        ⏸ üzerine gel — dursun
      </div>
    </aside>
  );
}
