import { useEffect, useMemo, useState } from 'react';
import { Newspaper, ExternalLink, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { loadNews } from '@/data/services';
import type { NewsItem } from '@/data/types';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/date';
import { SymbolBadge } from './SymbolBadge';
import { AdVideo } from './AdVideo';
import { BrandingBlock } from './BrandingBlock';
import { HaneModAdBanner } from './HaneModAdBanner';

const REFRESH_MS = 90_000;
const SCROLL_SPEED_SECONDS = 180;
const COLLAPSE_KEY = 'fa.rightNews.collapsed';
const DIRECTION_KEY = 'fa.rightNews.direction'; // 'up' | 'down', default 'up'

const sourceTone: Record<string, string> = {
  KAP: 'bg-accent/15 text-accent border-accent/20',
  Reuters: 'bg-warning/15 text-warning border-warning/20',
  Bloomberg: 'bg-warning/15 text-warning border-warning/20',
  'Diger': 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  GNews: 'bg-warning/15 text-warning border-warning/20',
};

export function RightNewsTicker() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* sessizce */
    }
  };

  // Scroll yonu: 'up' (asagidan yukari, default) | 'down' (yukaridan asagi)
  const [direction, setDirection] = useState<'up' | 'down'>(() => {
    try {
      const v = localStorage.getItem(DIRECTION_KEY);
      return v === 'down' ? 'down' : 'up';
    } catch {
      return 'up';
    }
  });

  const toggleDirection = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = direction === 'up' ? 'down' : 'up';
    setDirection(next);
    try {
      localStorage.setItem(DIRECTION_KEY, next);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const fetchIt = () => {
      loadNews({ max: 20 }).then((r) => {
        if (r.source === 'live' && r.data.length > 0) {
          setNews(r.data);
        }
        setLoading(false);
      });
    };
    fetchIt();
    const id = setInterval(fetchIt, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const repeated = useMemo(() => [...news, ...news], [news]);

  return (
    <aside className={cn(
      'relative z-10 hidden lg:flex lg:w-72 lg:flex-col xl:w-80 border-l border-border bg-bg-soft/80 backdrop-blur-md',
      collapsed && 'lg:w-72 xl:w-80',
    )}>
      <div className="border-b border-border bg-bg-card/40 p-2">
        <AdVideo />
      </div>

      {/* Hane Mod Studio branding + Copyright + Resmi YouTube — Gundem & Haberler'in ustunde.
          Tum kullanicilara gorunur (kayitli + kayitsiz). Sol sidebar'da da ayrica var. */}
      <div className="border-b border-border bg-bg-soft/40 px-2 py-3">
        <BrandingBlock />
        <div className="mt-3">
          <div className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            Resmi YouTube
          </div>
          <HaneModAdBanner variant="compact" />
        </div>
      </div>

      {/* Header — collapse + direction toggle */}
      <div className="flex w-full items-center border-b border-border transition hover:bg-bg-card/50">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex flex-1 items-center justify-between px-4 py-3 text-left"
          aria-expanded={!collapsed}
          aria-controls="right-news-content"
        >
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent">
              <Newspaper size={14} />
            </span>
            <div>
              <div className="text-xs font-semibold text-slate-100">Gundem &amp; Haberler</div>
              <div className="text-[10px] text-slate-500">
                {collapsed ? 'Acmak icin tikla' : `${news.length} haber - tikla kapat`}
              </div>
            </div>
          </div>
          <ChevronDown
            size={16}
            className={cn(
              'shrink-0 text-slate-400 transition-transform',
              collapsed ? '-rotate-90' : 'rotate-0',
            )}
          />
        </button>
        {!collapsed && (
          <button
            type="button"
            onClick={toggleDirection}
            className="mr-2 grid h-7 w-7 place-items-center rounded-md bg-bg-card/60 text-slate-400 ring-1 ring-border transition hover:bg-accent/15 hover:text-accent"
            title={direction === 'up' ? 'Asagidan yukari kayiyor — tikla yonu degistir' : 'Yukaridan asagi kayiyor — tikla yonu degistir'}
            aria-label="Akis yonunu degistir"
          >
            {direction === 'up' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />}
          </button>
        )}
      </div>

      {!collapsed && (
        <div id="right-news-content" className="news-ticker-mask relative flex-1 overflow-hidden">
          {news.length === 0 ? (
            <div className="p-4 text-center text-[11px] text-slate-500">
              {loading ? 'Haberler yukleniyor...' : 'Canli haber alinamadi.'}
            </div>
          ) : null}
          <div
            className={cn("news-ticker-track flex flex-col gap-2 px-3 py-2", direction === 'down' && 'dir-down')}
            style={{ animationDuration: `${SCROLL_SPEED_SECONDS}s` }}
          >
            {repeated.map((item, i) => {
              const tone = sourceTone[item.source] ?? sourceTone['Diger'];
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
                        <SymbolBadge key={s} symbol={s} className="!text-[9px] !px-1 !py-0.5" />
                      ))}
                      <span className={cn('font-medium', importanceTone)}>{importance}</span>
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
      )}

      {!collapsed && (
        <div className="border-t border-border bg-bg-soft/90 px-3 py-1.5 text-center text-[9px] text-slate-500">
          uzerine gel - dursun
        </div>
      )}
    </aside>
  );
}
