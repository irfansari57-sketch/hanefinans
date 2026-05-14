import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Star, X, Search, RefreshCw, Radio } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StockRow } from '@/components/domain/StockRow';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { MOCK_STOCKS } from '@/data/mock';
import { loadStocks, clearServiceCaches } from '@/data/services';
import type { Stock } from '@/data/types';
import { useWatchlist } from '@/store/watchlist';
import { cn } from '@/lib/utils';

const AUTO_REFRESH_MS = 60_000;

export function WatchlistPage() {
  const [params] = useSearchParams();
  const focusSymbol = params.get('focus');
  const symbols = useWatchlist((s) => s.symbols);
  const add = useWatchlist((s) => s.add);
  const remove = useWatchlist((s) => s.remove);
  const has = useWatchlist((s) => s.has);

  const [stocks, setStocks] = useState<Stock[]>(MOCK_STOCKS);
  const [allStocks, setAllStocks] = useState<Stock[]>(MOCK_STOCKS);
  const [source, setSource] = useState<'live' | 'mock' | 'mixed'>('mock');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const focusRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(async (force = false) => {
    if (force) clearServiceCaches();
    setLoading(true);
    try {
      const [watched, all] = await Promise.all([loadStocks(symbols), loadStocks()]);
      setStocks(watched.data);
      setSource(watched.source);
      setAllStocks(all.data);
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, [symbols]);

  useEffect(() => {
    fetchData(true);
    const id = setInterval(() => fetchData(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    if (focusSymbol) {
      focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusSymbol]);

  const refresh = () => fetchData(true);

  const watched = useMemo(
    () => symbols.map((sym) => stocks.find((s) => s.symbol === sym)).filter((s): s is Stock => !!s),
    [symbols, stocks],
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allStocks
      .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, allStocks]);

  const summary = useMemo(() => {
    if (!watched.length) return null;
    const positives = watched.filter((s) => s.changePct > 0).length;
    const negatives = watched.filter((s) => s.changePct < 0).length;
    const avg = watched.reduce((s, x) => s + x.changePct, 0) / watched.length;
    return { positives, negatives, avg };
  }, [watched]);

  return (
    <>
      <PageHeader
        title="Takip Listem"
        subtitle="İlgilendiğin hisseleri takip et, fiyatları ve değişimleri gör."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading} label={source === 'live' ? 'CANLI' : source === 'mixed' ? 'KARMA' : 'DEMO'} />
            <button className="btn-secondary" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        }
      />

      <div className="mb-4 rounded-xl border border-border bg-bg-soft p-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-8"
            placeholder="Hisse ara ve ekle (örn: AKBNK)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {searchResults.length > 0 && (
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {searchResults.map((s) => {
              const watching = has(s.symbol);
              return (
                <button
                  key={s.symbol}
                  type="button"
                  onClick={() => {
                    if (watching) remove(s.symbol);
                    else add(s.symbol);
                  }}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition',
                    watching
                      ? 'border-warning/30 bg-warning/5 text-slate-200'
                      : 'border-border bg-bg-card hover:border-slate-500/40',
                  )}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-accent">{s.symbol}</span>
                      <span className="text-xs text-slate-300">{s.name}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{s.sector}</div>
                  </div>
                  <span className={cn('flex items-center gap-1 text-xs', watching ? 'text-warning' : 'text-slate-400')}>
                    {watching ? (
                      <>
                        <X size={12} /> Çıkar
                      </>
                    ) : (
                      <>
                        <Plus size={12} /> Ekle
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {summary && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-bg-soft p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Takipte</div>
            <div className="mt-1 text-xl font-semibold">{watched.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-bg-soft p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Bugün Yeşil / Kırmızı</div>
            <div className="mt-1 text-xl font-semibold">
              <span className="text-success">{summary.positives}</span>
              <span className="mx-1 text-slate-600">/</span>
              <span className="text-danger">{summary.negatives}</span>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg-soft p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Ortalama Değişim</div>
            <div className={cn('mt-1 text-xl font-semibold', summary.avg >= 0 ? 'text-success' : 'text-danger')}>
              {summary.avg >= 0 ? '+' : ''}
              {summary.avg.toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      {watched.length === 0 ? (
        <EmptyState
          icon={<Star size={28} />}
          title="Takip listen boş"
          description="Yukarıdan hisse arayıp listene ekleyebilirsin."
        />
      ) : (
        <div className="rounded-xl border border-border bg-bg-soft p-2">
          <div className="divide-y divide-border">
            {watched.map((s) => (
              <div
                key={s.symbol}
                ref={focusSymbol === s.symbol ? focusRef : undefined}
                className={cn(focusSymbol === s.symbol && 'rounded-lg ring-2 ring-accent/50')}
              >
                <StockRow stock={s} showWatch showActions />
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        {source === 'live'
          ? 'Fiyatlar Twelve Data\'dan canlı, 60 saniye önbelleğe alınır.'
          : 'Fiyatlar şu an mock\'tur. Ayarlar > API Bağlantıları sayfasından Twelve Data anahtarını ekleyerek canlıya geçebilirsin.'}
      </p>
    </>
  );
}
