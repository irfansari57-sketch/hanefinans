import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, RefreshCw, Info, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { useWatchlist } from '@/store/watchlist';
import { runIndicatorAgent, type IndicatorAgentResponse, type IndicatorSignal, labelTone } from '@/data/api/indicatorAgent';
import { cn } from '@/lib/utils';

/**
 * Indicator Agent karti -- watchlist veya default popular BIST sembollerinde
 * teknik sinyal taramasi. RSI, MACD, MA cross, hacim.
 */
export function IndicatorAgentCard() {
  const watchlist = useWatchlist((s) => s.symbols);
  const symbols = watchlist.length > 0 ? watchlist : undefined; // undefined -> default 15 BIST

  const [data, setData] = useState<IndicatorAgentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = async (force = false) => {
    setRefreshing(force);
    if (!force) setLoading(true);
    const res = await runIndicatorAgent({ symbols, force });
    setData(res);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.join(',')]);

  if (loading && !data) {
    return (
      <div className="card p-4">
        <Header refreshing={false} onRefresh={() => run(true)} />
        <div className="grid gap-2 md:grid-cols-2">
          <Skeleton variant="rect" height={140} />
          <Skeleton variant="rect" height={140} />
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
          Indicator Agent suanda ulasilamiyor. Yerel dev sunucusunda Pages Functions
          calismaz -- production'da gorulur.
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
          <div className="font-semibold">Indicator Agent hata verdi</div>
        </div>
      </div>
    );
  }

  // Sadece guclu sinyalleri goster (|strength| >= 20)
  const strong = data.signals.filter((s) => Math.abs(s.strength) >= 20);
  const buys = strong.filter((s) => s.strength > 0).slice(0, 5);
  const sells = strong.filter((s) => s.strength < 0).slice(0, 5);

  if (strong.length === 0) {
    return (
      <div className="card p-4">
        <Header
          refreshing={refreshing}
          onRefresh={() => run(true)}
          generatedAt={data.generatedAt}
          scanned={data.scannedSymbols}
        />
        <div className="rounded-lg border border-border bg-bg-soft p-3 text-xs text-slate-400">
          Bu turda guclu sinyal yok ({data.scannedSymbols} sembol tarandi).
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
        scanned={data.scannedSymbols}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span className="rounded bg-success/15 px-1.5 py-0.5 text-success">+{buys.length} alici</span>
        <span className="rounded bg-danger/15 px-1.5 py-0.5 text-danger">{sells.length} satici</span>
        <span className="ml-auto text-slate-500">RSI/MACD/MA/Hacim</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SignalList title="Alici Sinyaller" items={buys} tone="success" emptyText="Alici sinyal yok" />
        <SignalList title="Satici Sinyaller" items={sells} tone="danger" emptyText="Satici sinyal yok" />
      </div>
    </div>
  );
}

function Header({ refreshing, onRefresh, generatedAt, scanned }: {
  refreshing: boolean;
  onRefresh: () => void;
  generatedAt?: string;
  scanned?: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent">
        <Activity size={14} />
      </span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Indicator Agent</h2>
      <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
        teknik
      </span>
      {generatedAt && (
        <span className="text-[10px] text-slate-500">
          {new Date(generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          {scanned != null && ` · ${scanned} sembol`}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="btn-ghost ml-auto text-xs"
      >
        <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> Yenile
      </button>
    </div>
  );
}

function SignalList({ title, items, tone, emptyText }: {
  title: string;
  items: IndicatorSignal[];
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
          <Icon size={12} />{title}
        </div>
        <div className="text-xs text-slate-500">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border p-3', borderClass, bgClass)}>
      <div className={cn('mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider', colorClass)}>
        <Icon size={12} />{title}
      </div>
      <div className="space-y-2">
        {items.map((s) => (
          <SignalRow key={s.symbol} signal={s} />
        ))}
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: IndicatorSignal }) {
  const tone = labelTone(signal.label);
  const sign = signal.changePct >= 0 ? '+' : '';
  return (
    <div className="rounded-md border border-border bg-bg-card px-2.5 py-2 text-xs">
      <div className="flex items-center gap-2">
        <Link to={`/stock/${signal.symbol}`} className="font-mono font-bold text-slate-100 hover:text-accent">
          {signal.symbol}
        </Link>
        <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold tabular-nums uppercase tracking-wider', tone.bg, tone.text)}>
          {signal.label}
        </span>
        <span className="ml-auto font-mono text-slate-400">
          ₺{signal.price.toFixed(2)}
        </span>
        <span className={cn('font-mono tabular-nums text-[10px]',
          signal.changePct >= 0 ? 'text-success' : 'text-danger')}>
          {sign}{signal.changePct.toFixed(2)}%
        </span>
      </div>
      <div className="mt-1 space-y-0.5">
        {signal.reasons.map((r, i) => (
          <div key={i} className="text-[10px] leading-snug text-slate-300">
            <span className="mr-1 text-slate-600">·</span>{r}
          </div>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-slate-500">
        {signal.metrics.rsi != null && (
          <span className="rounded bg-slate-500/15 px-1 py-0.5">RSI {signal.metrics.rsi.toFixed(0)}</span>
        )}
        {signal.metrics.macdCross && (
          <span className="rounded bg-slate-500/15 px-1 py-0.5">MACD {signal.metrics.macdCross === 'up' ? '↑' : '↓'}</span>
        )}
        {signal.metrics.volumeRatio != null && signal.metrics.volumeRatio >= 1.5 && (
          <span className="rounded bg-slate-500/15 px-1 py-0.5">Vol {signal.metrics.volumeRatio.toFixed(1)}x</span>
        )}
      </div>
    </div>
  );
}
