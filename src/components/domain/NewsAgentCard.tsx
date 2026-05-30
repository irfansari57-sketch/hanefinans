import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Newspaper, RefreshCw, Sparkles, Info, AlertTriangle, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { runNewsAgent, type NewsAgentResponse, type NewsAgentStory, categoryEmoji } from '@/data/api/newsAgent';
import { cn } from '@/lib/utils';

/**
 * News Agent kartı — Claude Haiku ile günün top 5 BIST-ilgili haber özeti.
 * Her hikaye: rank + başlık + 2 cümle özet + kategori + etki + semboller + kaynak.
 */
export function NewsAgentCard({ maxStories = 5 }: { maxStories?: number }) {
  const [data, setData] = useState<NewsAgentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = async (force = false) => {
    setRefreshing(force);
    if (!force) setLoading(true);
    const res = await runNewsAgent({ maxStories, force });
    setData(res);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !data) {
    return (
      <div className="card p-4">
        <Header refreshing={false} onRefresh={() => run(true)} />
        <div className="space-y-2">
          {Array.from({ length: maxStories }).map((_, i) => (
            <Skeleton key={i} variant="rect" height={72} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-4">
        <Header refreshing={refreshing} onRefresh={() => run(true)} />
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          <Info size={12} className="mr-1 inline -mt-0.5" />
          News Agent şu anda ulaşılamıyor. Yerel dev sunucusunda Pages Functions
          çalışmaz — production'da (<span className="font-mono">hanefinans.net</span>) görülür.
        </div>
      </div>
    );
  }

  if (!data.ok) {
    return (
      <div className="card p-4">
        <Header refreshing={refreshing} onRefresh={() => run(true)} />
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          <AlertTriangle size={12} className="mt-0.5" />
          <div>
            <div className="font-semibold">News Agent hata verdi</div>
            <div className="mt-1 text-[11px] text-slate-400">{data.error ?? 'Bilinmeyen'}</div>
          </div>
        </div>
      </div>
    );
  }

  if (data.stories.length === 0) {
    return (
      <div className="card p-4">
        <Header refreshing={refreshing} onRefresh={() => run(true)} />
        <div className="rounded-lg border border-border bg-bg-soft p-3 text-xs text-slate-400">
          Bu turda öne çıkan haber bulunamadı.
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <Header
        refreshing={refreshing}
        onRefresh={() => run(true)}
        generatedAt={data.generatedAt}
        newsCount={data.sourceNewsCount}
      />
      <div className="space-y-2">
        {data.stories.map((s) => (
          <StoryRow key={s.rank} story={s} />
        ))}
      </div>
    </div>
  );
}

function Header({ refreshing, onRefresh, generatedAt, newsCount }: {
  refreshing: boolean;
  onRefresh: () => void;
  generatedAt?: string;
  newsCount?: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent">
        <Newspaper size={14} />
      </span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">News Agent</h2>
      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
        <Sparkles size={9} className="-mt-0.5 mr-0.5 inline" />
        claude
      </span>
      {generatedAt && (
        <span className="text-[10px] text-slate-500">
          {new Date(generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          {newsCount != null && ` · ${newsCount} haber tarandı`}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="btn-ghost ml-auto text-xs"
        title="Yeniden çalıştır"
      >
        <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> Yenile
      </button>
    </div>
  );
}

function StoryRow({ story }: { story: NewsAgentStory }) {
  const impactClass =
    story.impact === 'pozitif' ? 'text-success' :
    story.impact === 'negatif' ? 'text-danger' : 'text-slate-400';
  const impactIcon =
    story.impact === 'pozitif' ? <TrendingUp size={11} /> :
    story.impact === 'negatif' ? <TrendingDown size={11} /> : <Minus size={11} />;

  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <span className="font-mono text-base font-bold text-slate-500">{story.rank}</span>
          <span className="text-base">{categoryEmoji(story.category)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug text-slate-100">
              {story.title}
            </h3>
            <span className={cn('flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider', impactClass,
              story.impact === 'pozitif' ? 'bg-success/15' : story.impact === 'negatif' ? 'bg-danger/15' : 'bg-slate-500/15')}>
              {impactIcon}{story.impact}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{story.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
            {story.symbols.map((sym) => (
              <Link
                key={sym}
                to={`/stock/${sym}`}
                className="rounded bg-accent/15 px-1.5 py-0.5 font-mono font-semibold text-accent hover:bg-accent/25"
              >
                {sym}
              </Link>
            ))}
            <span className="rounded bg-slate-500/15 px-1.5 py-0.5 uppercase tracking-wider text-slate-400">
              {story.category}
            </span>
            <span className="ml-auto flex items-center gap-1 text-slate-500">
              {story.sourceUrl ? (
                <a
                  href={story.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-accent"
                  title={story.sourceTitle}
                >
                  {story.sourceName} <ExternalLink size={9} />
                </a>
              ) : (
                <span title={story.sourceTitle}>{story.sourceName}</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
