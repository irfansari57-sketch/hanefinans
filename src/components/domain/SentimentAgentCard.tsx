import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, RefreshCw, TrendingUp, TrendingDown, Minus, Sparkles, Info, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { runSentimentAgent, type SentimentAgentResponse, type SentimentAgentItem } from '@/data/api/sentimentAgent';
import { cn } from '@/lib/utils';

/**
 * Sentiment Agent kartı — Claude Haiku ile haber başlıklarından
 * sembol bazlı sentiment skoru. Pozitif top 5 + negatif top 5 + örnek manşetler.
 *
 * Tetiklenme: Component mount edildiğinde otomatik. Manuel "yenile" butonu var.
 * Cache: client 30 dk, edge 1 saat (function tarafı).
 *
 * Dev sunucuda Pages Functions yoksa graceful empty state gösterir.
 */
export function SentimentAgentCard({ symbols }: { symbols?: string[] }) {
  const [data, setData] = useState<SentimentAgentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = async (force = false) => {
    setRefreshing(force);
    if (!force) setLoading(true);
    const res = await runSentimentAgent({ symbols, force });
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
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent">
            <MessageSquare size={14} />
          </span>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Sentiment Agent</h2>
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">claude</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Skeleton variant="rect" height={120} />
          <Skeleton variant="rect" height={120} />
        </div>
      </div>
    );
  }

  // Network error or not-JSON (dev mode without Pages Functions)
  if (!data) {
    return (
      <div className="card p-4">
        <Header refreshing={refreshing} onRefresh={() => run(true)} />
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          <Info size={12} className="mr-1 inline -mt-0.5" />
          Sentiment Agent şu anda ulaşılamıyor. Yerel dev sunucusunda Pages Functions
          çalışmaz — production'da (<span className="font-mono">hanefinans.net</span>) görülür.
        </div>
      </div>
    );
  }

  // API error response
  if (!data.ok) {
    return (
      <div className="card p-4">
        <Header refreshing={refreshing} onRefresh={() => run(true)} />
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          <AlertTriangle size={12} className="mt-0.5" />
          <div>
            <div className="font-semibold">Sentiment Agent hata verdi</div>
            <div className="mt-1 text-[11px] text-slate-400">{data.error ?? 'Bilinmeyen hata'}</div>
          </div>
        </div>
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <div className="card p-4">
        <Header refreshing={refreshing} onRefresh={() => run(true)} />
        <div className="rounded-lg border border-border bg-bg-soft p-3 text-xs text-slate-400">
          {data.note ?? 'Bu turda haber bulunamadı.'}
        </div>
      </div>
    );
  }

  // Pozitif top 5 + negatif top 5
  const positives = data.items.filter((i) => i.label === 'positive').slice(0, 5);
  const negatives = [...data.items].filter((i) => i.label === 'negative').sort((a, b) => a.score - b.score).slice(0, 5);
  const neutralCount = data.items.filter((i) => i.label === 'neutral').length;

  return (
    <div className="card p-4">
      <Header refreshing={refreshing} onRefresh={() => run(true)} generatedAt={data.generatedAt} newsCount={data.sourceNewsCount} />

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span className="rounded bg-success/15 px-1.5 py-0.5 text-success">
          +{positives.length} olumlu
        </span>
        <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-slate-400">
          {neutralCount} nötr
        </span>
        <span className="rounded bg-danger/15 px-1.5 py-0.5 text-danger">
          −{negatives.length} olumsuz
        </span>
        <span className="ml-auto text-slate-500">
          model: {data.model}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SentimentList title="En Olumlu" items={positives} tone="success" emptyText="Olumlu sinyal yok" />
        <SentimentList title="En Olumsuz" items={negatives} tone="danger" emptyText="Olumsuz sinyal yok" />
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
        <MessageSquare size={14} />
      </span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Sentiment Agent</h2>
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
        title="Yeniden çalıştır (cache'i atla)"
      >
        <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> Yenile
      </button>
    </div>
  );
}

function SentimentList({ title, items, tone, emptyText }: {
  title: string;
  items: SentimentAgentItem[];
  tone: 'success' | 'danger';
  emptyText: string;
}) {
  const Icon = tone === 'success' ? TrendingUp : TrendingDown;
  const colorClass = tone === 'success' ? 'text-success' : 'text-danger';
  const borderClass = tone === 'success' ? 'border-success/30' : 'border-danger/30';
  const bgClass = tone === 'success' ? 'bg-success/5' : 'bg-danger/5';

  if (items.length === 0) {
    return (
      <div className={cn('rounded-lg border bg-bg-soft p-3', borderClass)}>
        <div className={cn('mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider', colorClass)}>
          <Icon size={12} />
          {title}
        </div>
        <div className="text-xs text-slate-500">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border p-3', borderClass, bgClass)}>
      <div className={cn('mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider', colorClass)}>
        <Icon size={12} />
        {title}
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <SentimentRow key={it.symbol} item={it} tone={tone} />
        ))}
      </div>
    </div>
  );
}

function SentimentRow({ item, tone }: { item: SentimentAgentItem; tone: 'success' | 'danger' }) {
  const colorClass = tone === 'success' ? 'text-success' : 'text-danger';
  const sign = item.score >= 0 ? '+' : '';
  // Sample: en yüksek mutlak skorlu manşeti seç
  const sample = [...item.samples].sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0];

  return (
    <div className="rounded-md border border-border bg-bg-card px-2.5 py-2 text-xs">
      <div className="flex items-center gap-2">
        <Link to={`/stock/${item.symbol}`} className="font-mono font-bold text-slate-100 hover:text-accent">
          {item.symbol}
        </Link>
        <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold tabular-nums uppercase', colorClass)}>
          {sign}{item.score.toFixed(2)}
        </span>
        <span className="text-[10px] text-slate-500">{item.newsCount} haber</span>
      </div>
      {item.rationale && (
        <div className="mt-1 text-[11px] leading-snug text-slate-300">
          {item.rationale}
        </div>
      )}
      {sample && (
        <div className="mt-1 truncate text-[10px] text-slate-500" title={sample.title}>
          <Minus size={8} className="-mt-0.5 mr-0.5 inline" />
          {sample.title} <span className="text-slate-600">— {sample.source}</span>
        </div>
      )}
    </div>
  );
}
