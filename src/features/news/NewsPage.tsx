import { useEffect, useMemo, useState } from 'react';
import { Search, Newspaper, RefreshCw, Radio } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { NewsCard } from '@/components/domain/NewsCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { MOCK_STOCKS } from '@/data/mock';
import { loadNews } from '@/data/services';
import type { NewsItem } from '@/data/types';
import { useWatchlist } from '@/store/watchlist';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';

// Module-level memo cache — sayfa değişimlerinde yeniden fetch'i önler
const NEWS_MEMO_TTL_MS = 3 * 60_000;
interface NewsMemo {
  fetchedAt: number;
  items: NewsItem[];
  source: 'live' | 'mock';
}
let newsMemo: NewsMemo | null = null;

export function NewsPage() {
  const watchlist = useWatchlist((s) => s.symbols);
  const [items, setItems] = useState<NewsItem[]>(() => newsMemo?.items ?? []);
  const [source, setSource] = useState<'live' | 'mock'>(() => newsMemo?.source ?? 'mock');
  const [loading, setLoading] = useState(() => !newsMemo);

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | string>('all');
  const [symbol, setSymbol] = useState<'all' | string>('all');
  const [minImportance, setMinImportance] = useState(0);
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);

  // Mevcut haber listesinden gelen unique kaynaklar
  const dynamicSources = useMemo(() => {
    const set = new Set(items.map((n) => n.source));
    return ['all', ...Array.from(set).sort()];
  }, [items]);

  // Memo cache sync
  useEffect(() => {
    if (items.length > 0) {
      newsMemo = {
        fetchedAt: Date.now(),
        items,
        source,
      };
    }
  }, [items, source]);

  useEffect(() => {
    const memoAge = newsMemo ? Date.now() - newsMemo.fetchedAt : Infinity;
    if (memoAge < NEWS_MEMO_TTL_MS) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    loadNews({ max: 25 })
      .then((r) => {
        if (!alive) return;
        setItems(r.data);
        setSource(r.source);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await loadNews({ max: 25 });
      setItems(r.data);
      setSource(r.source);
    } finally {
      setLoading(false);
    }
  };

  const symbolOptions = useMemo(
    () => Array.from(new Set(MOCK_STOCKS.map((s) => s.symbol))).sort(),
    [],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((n) => {
        if (sourceFilter !== 'all' && n.source !== sourceFilter) return false;
        if (symbol !== 'all' && !n.symbols.includes(symbol)) return false;
        if (n.importance < minImportance) return false;
        if (onlyWatchlist && !n.symbols.some((s) => watchlist.includes(s))) return false;
        if (q) {
          const blob = `${n.title} ${n.summary} ${n.symbols.join(' ')}`.toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }, [items, search, sourceFilter, symbol, minImportance, onlyWatchlist, watchlist]);

  return (
    <>
      <SeoHead title="Finans Haberleri" description="BIST, ekonomi, kripto ve makro piyasalardan güncel haberler. KAP, Reuters, AA, GNews kaynaklı türkçe finans akışı." path="/news" />

      <PageHeader
        title="Gelişmeler"
        subtitle="Mynet Finans, BloombergHT, AA Ekonomi ve Yahoo Finance kaynaklı canlı haber akışı."
        actions={
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs',
                source === 'live' && items.length > 0
                  ? 'bg-success/15 text-success'
                  : 'bg-warning/10 text-warning',
              )}
            >
              <Radio size={11} />
              {source === 'live' && items.length > 0 ? 'Canlı' : loading ? 'Yükleniyor…' : 'Veri yok'}
            </span>
            <button className="btn-secondary" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-2 rounded-xl border border-border bg-bg-soft p-3 sm:grid-cols-5">
        <div className="relative sm:col-span-2">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-8"
            placeholder="Başlık, özet, sembol…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          {dynamicSources.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'Tüm kaynaklar' : s}
            </option>
          ))}
        </select>
        <select className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          <option value="all">Tüm semboller</option>
          {symbolOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="input" value={minImportance} onChange={(e) => setMinImportance(Number(e.target.value))}>
          <option value={0}>Tüm önemler</option>
          <option value={5}>Önem ≥ 5</option>
          <option value={7}>Önem ≥ 7 (yüksek)</option>
          <option value={8}>Önem ≥ 8 (kritik)</option>
        </select>
      </div>

      <label className="mb-4 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-border bg-bg-soft accent-accent"
          checked={onlyWatchlist}
          onChange={(e) => setOnlyWatchlist(e.target.checked)}
        />
        Sadece takip listemdekiler
      </label>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Newspaper size={28} />}
          title={loading ? 'Haberler çekiliyor…' : items.length === 0 ? 'Canlı haber alınamadı' : 'Filtreyle eşleşen gelişme yok'}
          description={items.length === 0 && !loading ? 'Yenile butonuna basarak tekrar deneyebilirsin.' : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((n) => (
            <NewsCard key={n.id} item={n} />
          ))}
        </div>
      )}
    </>
  );
}
