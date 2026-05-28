import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { Plus, Star, X, Search, RefreshCw, PiggyBank, TrendingUp, ExternalLink } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { MOCK_STOCKS } from '@/data/mock';
import { loadStocks, clearServiceCaches } from '@/data/services';
import { fundsRepo } from '@/data/repositories';
import { fetchTefasFeed, type TefasFundData } from '@/data/api/tefasGithub';
import { computePeriodReturns, type PeriodReturns } from '@/data/api/yahoo';
import { useYahooHistoricals } from '@/data/api/yahooQueries';
import type { Stock } from '@/data/types';
import { useWatchlist } from '@/store/watchlist';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';
import { SortableHeader } from '@/components/ui/SortableHeader';

type WlSortKey = 'price' | 'changePct' | 'r1h' | 'r1a' | 'r3a' | 'r6a' | 'r1y';

type StockPeriod = '1g' | '1h' | '1a' | '3a' | '6a' | '1y';
const PERIOD_LABELS: Record<StockPeriod, string> = {
  '1g': '1 Gün',
  '1h': '1 Hafta',
  '1a': '1 Ay',
  '3a': '3 Ay',
  '6a': '6 Ay',
  '1y': '1 Yıl',
};

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
  const focusRef = useRef<HTMLTableRowElement | null>(null);
  const [kind, setKind] = useState<'stocks' | 'funds'>('stocks');
  const [tefasFunds, setTefasFunds] = useState<TefasFundData[] | null>(null);
  const [stockPeriod, setStockPeriod] = useState<StockPeriod>('1h');
  const [wlSortKey, setWlSortKey] = useState<WlSortKey>('r1h');
  const [wlSortDir, setWlSortDir] = useState<'asc' | 'desc'>('desc');
  // Dönem seçici değişince sort key'i ona uydur
  useEffect(() => {
    const map: Record<StockPeriod, WlSortKey> = {
      '1g': 'changePct', '1h': 'r1h', '1a': 'r1a', '3a': 'r3a', '6a': 'r6a', '1y': 'r1y',
    };
    setWlSortKey(map[stockPeriod]);
    setWlSortDir('desc');
  }, [stockPeriod]);
  const setWlSort = (k: WlSortKey) => {
    if (k === wlSortKey) setWlSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setWlSortKey(k); setWlSortDir('desc'); }
  };

  // ----- Watchlist hisse dönem getirileri (TanStack Query) -----
  // 22 farklı yerde tekrarlanan Yahoo batch fetch artık tek hook.
  // Aynı sembol başka sayfada açıksa cache paylaşılır → çift istek yok.
  const stockSymbols = kind === 'stocks' ? symbols : [];
  const historicalQueries = useYahooHistoricals(stockSymbols, {
    range: '1y',
    interval: '1d',
    bistSuffix: true,
    staleTime: 5 * 60_000,
  });
  const returnsLoading = historicalQueries.some((q) => q.isLoading);
  const stockReturns = useMemo<Record<string, PeriodReturns>>(() => {
    const map: Record<string, PeriodReturns> = {};
    stockSymbols.forEach((sym, i) => {
      const hist = historicalQueries[i]?.data;
      if (!hist || hist.bars.length === 0) return;
      const closes = hist.bars.map((b) => ({ date: b.time * 1000, close: b.close }));
      map[sym] = computePeriodReturns(closes);
    });
    return map;
    // historicalQueries her render yeni referans → length + status ile invalidate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stockSymbols.join(','),
    historicalQueries.map((q) => q.dataUpdatedAt).join(','),
  ]);

  // Takipteki fonlar (Dexie)
  const watchedFunds = useLiveQuery(() => fundsRepo.active(), []) ?? [];

  // TEFAS feed — fonların NAV ve getirisi
  useEffect(() => {
    if (kind !== 'funds') return;
    fetchTefasFeed().then((feed) => {
      if (feed?.funds) setTefasFunds(feed.funds);
    });
  }, [kind]);

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

  // Dönem getirileri artık useYahooHistoricals ile (yukarıda) — manuel batch kaldırıldı.

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
    // Seçili döneme göre değer çek: 1g → günlük changePct, diğerleri → tarihsel getiri.
    // Henüz tarihsel veri yüklenmemiş semboller sayıma dahil edilmez (avg yamulmasın diye).
    const getVal = (sym: string, dayChange: number): number | null => {
      if (stockPeriod === '1g') return dayChange;
      const r = stockReturns[sym]?.[stockPeriod];
      return r == null ? null : r;
    };
    let positives = 0;
    let negatives = 0;
    let sum = 0;
    let count = 0;
    for (const s of watched) {
      const v = getVal(s.symbol, s.changePct);
      if (v == null) continue;
      if (v > 0) positives += 1;
      else if (v < 0) negatives += 1;
      sum += v;
      count += 1;
    }
    const avg = count > 0 ? sum / count : 0;
    return { positives, negatives, avg, count, total: watched.length };
  }, [watched, stockReturns, stockPeriod]);

  // Takipteki fonların TEFAS verisi ile birleşimi
  const watchedFundsWithData = useMemo(() => {
    if (!tefasFunds) return watchedFunds.map((f) => ({ entry: f, tefas: undefined as TefasFundData | undefined }));
    const tefasMap = new Map(tefasFunds.map((t) => [t.code, t]));
    return watchedFunds.map((f) => ({ entry: f, tefas: tefasMap.get(f.code) }));
  }, [watchedFunds, tefasFunds]);

  return (
    <>
      <SeoHead title="Takip Listem" description="Favori BIST hisseleriniz ve TEFAS fonlarınız tek ekranda. Performans karşılaştırma, dönem getirileri." path="/watchlist" noindex />

      <PageHeader
        title="Takip Listem"
        subtitle="İlgilendiğin hisse ve fonları takip et, fiyatları ve değişimleri gör."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading} label={source === 'live' ? 'CANLI' : source === 'mixed' ? 'KARMA' : 'DEMO'} />
            <button className="btn-secondary" onClick={refresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        }
      />

      {/* Tab: Hisseler / Fonlar — Radix Tabs, ok tuşları ile keyboard nav */}
      <Tabs.Root
        value={kind}
        onValueChange={(v) => setKind(v as 'stocks' | 'funds')}
      >
        <Tabs.List
          aria-label="Takip listesi türü"
          className="mb-4 inline-flex rounded-lg border border-border bg-bg-soft p-1"
        >
          <Tabs.Trigger
            value="stocks"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
              'data-[state=active]:bg-bg-card data-[state=active]:text-slate-100',
              'data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200',
            )}
          >
            <TrendingUp size={13} /> Hisseler ({symbols.length})
          </Tabs.Trigger>
          <Tabs.Trigger
            value="funds"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
              'data-[state=active]:bg-bg-card data-[state=active]:text-slate-100',
              'data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200',
            )}
          >
            <PiggyBank size={13} /> Fonlar ({watchedFunds.length})
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="funds" className="focus:outline-none">
          <FundsTab watchedFundsWithData={watchedFundsWithData} />
        </Tabs.Content>

        <Tabs.Content value="stocks" className="focus:outline-none">
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
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              {PERIOD_LABELS[stockPeriod]} Yeşil / Kırmızı
            </div>
            <div className="mt-1 text-xl font-semibold">
              <span className="text-success">{summary.positives}</span>
              <span className="mx-1 text-slate-600">/</span>
              <span className="text-danger">{summary.negatives}</span>
              {summary.count < summary.total && (
                <span className="ml-2 text-[10px] font-normal text-slate-500">
                  ({summary.count}/{summary.total})
                </span>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg-soft p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Ortalama Değişim · {PERIOD_LABELS[stockPeriod]}
            </div>
            <div className={cn('mt-1 text-xl font-semibold', summary.avg >= 0 ? 'text-success' : 'text-danger')}>
              {summary.count === 0 ? (
                <span className="text-slate-500">—</span>
              ) : (
                <>
                  {summary.avg >= 0 ? '+' : ''}
                  {summary.avg.toFixed(2)}%
                </>
              )}
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
        <>
          {/* Dönem seçici — seçili döneme göre kartlar sıralanır ve büyük getiri gösterilir */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Performans</span>
            <div className="inline-flex flex-wrap rounded-lg border border-border bg-bg-soft p-1">
              {(['1g', '1h', '1a', '3a', '6a', '1y'] as const).map((pk) => (
                <button
                  key={pk}
                  onClick={() => setStockPeriod(pk)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition',
                    stockPeriod === pk
                      ? 'bg-accent/20 text-accent'
                      : 'text-slate-400 hover:text-slate-200',
                  )}
                >
                  {PERIOD_LABELS[pk]}
                </button>
              ))}
            </div>
            {returnsLoading && (
              <span className="text-[10px] text-slate-500">
                <RefreshCw size={10} className="inline animate-spin mr-1" />
                Geçmiş veriler yükleniyor…
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
            <table className="w-full min-w-[860px] text-xs">
              <thead className="border-b border-border bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="sticky left-0 z-20 bg-bg-soft px-2 py-2.5 text-left">#</th>
                  <th className="sticky left-8 z-20 bg-bg-soft px-2 py-2.5 text-left">Sembol</th>
                  <th className="px-2 py-2.5 text-left hidden md:table-cell">Şirket / Sektör</th>
                  <SortableHeader label="Fiyat" sortKey="price" activeKey={wlSortKey} dir={wlSortDir} onClick={setWlSort} />
                  <SortableHeader label="Gün %" sortKey="changePct" activeKey={wlSortKey} dir={wlSortDir} onClick={setWlSort} />
                  <SortableHeader label="1 Hafta %" sortKey="r1h" activeKey={wlSortKey} dir={wlSortDir} onClick={setWlSort} className="hidden lg:table-cell" />
                  <SortableHeader label="1 Ay %" sortKey="r1a" activeKey={wlSortKey} dir={wlSortDir} onClick={setWlSort} />
                  <SortableHeader label="3 Ay %" sortKey="r3a" activeKey={wlSortKey} dir={wlSortDir} onClick={setWlSort} />
                  <SortableHeader label="6 Ay %" sortKey="r6a" activeKey={wlSortKey} dir={wlSortDir} onClick={setWlSort} className="hidden lg:table-cell" />
                  <SortableHeader label="1 Yıl %" sortKey="r1y" activeKey={wlSortKey} dir={wlSortDir} onClick={setWlSort} />
                  <th className="px-2 py-2.5 text-center w-12">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {[...watched]
                  .sort((a, b) => {
                    const getVal = (s: Stock): number => {
                      switch (wlSortKey) {
                        case 'price':     return s.price;
                        case 'changePct': return s.changePct;
                        case 'r1h':       return stockReturns[s.symbol]?.['1h'] ?? -Infinity;
                        case 'r1a':       return stockReturns[s.symbol]?.['1a'] ?? -Infinity;
                        case 'r3a':       return stockReturns[s.symbol]?.['3a'] ?? -Infinity;
                        case 'r6a':       return stockReturns[s.symbol]?.['6a'] ?? -Infinity;
                        case 'r1y':       return stockReturns[s.symbol]?.['1y'] ?? -Infinity;
                      }
                    };
                    const av = getVal(a);
                    const bv = getVal(b);
                    return wlSortDir === 'asc' ? av - bv : bv - av;
                  })
                  .map((s, i) => (
                    <WatchlistStockRow
                      key={s.symbol}
                      stock={s}
                      rank={i + 1}
                      period={stockPeriod}
                      returns={stockReturns[s.symbol]}
                      onRemove={() => remove(s.symbol)}
                      isFocused={focusSymbol === s.symbol}
                      focusRef={focusSymbol === s.symbol ? focusRef : undefined}
                    />
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-4 text-xs text-slate-500">
        {source === 'live'
          ? 'Fiyatlar Twelve Data\'dan canlı, 60 saniye önbelleğe alınır.'
          : 'Fiyatlar şu an mock\'tur. Ayarlar > API Bağlantıları sayfasından Twelve Data anahtarını ekleyerek canlıya geçebilirsin.'}
      </p>
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}

interface WatchlistStockRowProps {
  stock: Stock;
  rank: number;
  period: StockPeriod;
  returns: PeriodReturns | undefined;
  onRemove: () => void;
  isFocused?: boolean;
  focusRef?: React.RefObject<HTMLTableRowElement> | undefined;
}

/**
 * Watchlist hisse tablo satırı — Fonlar sayfasındaki düzen ile uyumlu:
 * Sticky # ve Sembol kolonları, min-w korunur, çok kolon mobile'da gizlenir.
 */
function WatchlistStockRow({ stock, rank, period, returns, onRemove, isFocused, focusRef }: WatchlistStockRowProps) {
  const dayChange = stock.changePct;
  const dayTone = dayChange >= 0 ? 'text-success' : 'text-danger';
  const sign = (v: number) => (v >= 0 ? '+' : '');
  const returnsTone = (v: number | undefined) =>
    v == null ? 'text-slate-500' : v >= 0 ? 'text-success' : 'text-danger';
  const fmtReturn = (v: number | undefined) =>
    v == null ? '—' : `${sign(v)}${v.toFixed(2)}%`;

  // Seçili dönem highlight: arka plana hafif tint
  const highlightCell = (key: StockPeriod) => period === key ? 'bg-accent/5' : '';

  return (
    <tr
      ref={focusRef as React.RefObject<HTMLTableRowElement>}
      className={cn(
        'group border-b border-border/60 transition hover:bg-bg-card',
        isFocused && 'ring-2 ring-inset ring-accent/40',
      )}
    >
      <td className="sticky left-0 z-10 bg-bg-soft px-2 py-2 text-left text-[11px] text-slate-500 tabular-nums">{rank}</td>
      <td className="sticky left-8 z-10 bg-bg-soft px-2 py-2 text-left">
        <Link
          to={`/stock/${stock.symbol}`}
          className="font-mono text-[13px] font-semibold text-accent hover:underline"
        >
          {stock.symbol}
        </Link>
      </td>
      <td className="px-2 py-2 text-left hidden md:table-cell">
        <div className="truncate max-w-[200px] text-slate-200">{stock.name}</div>
        {stock.sector && (
          <div className="mt-0.5 text-[9px] text-slate-500">{stock.sector}</div>
        )}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-100">{formatMoney(stock.price)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums font-medium', dayTone, highlightCell('1g'))}>
        {sign(dayChange)}{dayChange.toFixed(2)}%
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', returnsTone(returns?.['1h']), highlightCell('1h'))}>
        {fmtReturn(returns?.['1h'])}
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums', returnsTone(returns?.['1a']), highlightCell('1a'))}>
        {fmtReturn(returns?.['1a'])}
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums', returnsTone(returns?.['3a']), highlightCell('3a'))}>
        {fmtReturn(returns?.['3a'])}
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', returnsTone(returns?.['6a']), highlightCell('6a'))}>
        {fmtReturn(returns?.['6a'])}
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums', returnsTone(returns?.['1y']), highlightCell('1y'))}>
        {fmtReturn(returns?.['1y'])}
      </td>
      <td className="px-2 py-2 text-center">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          title="Takipten çıkar"
          className="grid h-6 w-6 place-items-center rounded-md text-slate-500 transition hover:bg-danger/15 hover:text-danger"
        >
          <X size={12} />
        </button>
      </td>
    </tr>
  );
}

interface FundsTabProps {
  watchedFundsWithData: Array<{
    entry: { id?: number; code: string; name?: string; category?: string };
    tefas: TefasFundData | undefined;
  }>;
}

// UI dönem anahtarı → TEFAS API'sindeki returns alanı
type FundPeriodKey = '1d' | '1w' | '1m' | '3m' | '6m' | '1y';
const FUND_PERIOD_MAP: Record<StockPeriod, FundPeriodKey> = {
  '1g': '1d',
  '1h': '1w',
  '1a': '1m',
  '3a': '3m',
  '6a': '6m',
  '1y': '1y',
};

type FundSortKey = 'day' | 'week' | 'month' | 'threeMonth' | 'sixMonth' | 'year';

function FundsTab({ watchedFundsWithData }: FundsTabProps) {
  const [fundPeriod, setFundPeriod] = useState<StockPeriod>('1h');
  const [fSortKey, setFSortKey] = useState<FundSortKey>('week');
  const [fSortDir, setFSortDir] = useState<'asc' | 'desc'>('desc');
  useEffect(() => {
    const map: Record<StockPeriod, FundSortKey> = {
      '1g': 'day', '1h': 'week', '1a': 'month', '3a': 'threeMonth', '6a': 'sixMonth', '1y': 'year',
    };
    setFSortKey(map[fundPeriod]);
    setFSortDir('desc');
  }, [fundPeriod]);
  const setFSort = (k: FundSortKey) => {
    if (k === fSortKey) setFSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setFSortKey(k); setFSortDir('desc'); }
  };
  const fundKeyToReturnsField: Record<FundSortKey, FundPeriodKey> = {
    day: '1d', week: '1w', month: '1m', threeMonth: '3m', sixMonth: '6m', year: '1y',
  };

  const fmtPct = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
  };

  const remove = async (id?: number) => {
    if (id == null) return;
    await fundsRepo.remove(id);
  };

  // Seçili dönem için period-aware özet — hisselerle paralel davranış
  const summary = useMemo(() => {
    if (!watchedFundsWithData.length) return null;
    const apiKey = FUND_PERIOD_MAP[fundPeriod];
    let positives = 0;
    let negatives = 0;
    let sum = 0;
    let count = 0;
    for (const { tefas } of watchedFundsWithData) {
      const v = tefas?.returns?.[apiKey];
      if (v == null || !Number.isFinite(v)) continue;
      if (v > 0) positives += 1;
      else if (v < 0) negatives += 1;
      sum += v;
      count += 1;
    }
    const avg = count > 0 ? sum / count : 0;
    return { positives, negatives, avg, count, total: watchedFundsWithData.length };
  }, [watchedFundsWithData, fundPeriod]);

  if (watchedFundsWithData.length === 0) {
    return (
      <EmptyState
        icon={<PiggyBank size={28} />}
        title="Takipte fon yok"
        description="Fonlar sayfasından yıldıza basarak takip ekleyebilirsin."
      />
    );
  }

  const apiKey = FUND_PERIOD_MAP[fundPeriod];

  // Seçili kolon başlığına göre sıralı liste
  const sortField = fundKeyToReturnsField[fSortKey];
  const sortedFunds = [...watchedFundsWithData].sort((a, b) => {
    const av = a.tefas?.returns?.[sortField];
    const bv = b.tefas?.returns?.[sortField];
    const an = av == null || !Number.isFinite(av) ? -Infinity : av;
    const bn = bv == null || !Number.isFinite(bv) ? -Infinity : bv;
    return fSortDir === 'asc' ? an - bn : bn - an;
  });

  return (
    <>
      {summary && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-bg-soft p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Takipte</div>
            <div className="mt-1 text-xl font-semibold">{summary.total}</div>
          </div>
          <div className="rounded-xl border border-border bg-bg-soft p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              {PERIOD_LABELS[fundPeriod]} Yeşil / Kırmızı
            </div>
            <div className="mt-1 text-xl font-semibold">
              <span className="text-success">{summary.positives}</span>
              <span className="mx-1 text-slate-600">/</span>
              <span className="text-danger">{summary.negatives}</span>
              {summary.count < summary.total && (
                <span className="ml-2 text-[10px] font-normal text-slate-500">
                  ({summary.count}/{summary.total})
                </span>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg-soft p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Ortalama Değişim · {PERIOD_LABELS[fundPeriod]}
            </div>
            <div className={cn('mt-1 text-xl font-semibold', summary.avg >= 0 ? 'text-success' : 'text-danger')}>
              {summary.count === 0 ? (
                <span className="text-slate-500">—</span>
              ) : (
                <>
                  {summary.avg >= 0 ? '+' : ''}
                  {summary.avg.toFixed(2)}%
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dönem seçici — hisselerle aynı UX, kartlar seçili döneme göre sıralanır */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Performans</span>
        <div className="inline-flex flex-wrap rounded-lg border border-border bg-bg-soft p-1">
          {(['1g', '1h', '1a', '3a', '6a', '1y'] as const).map((pk) => (
            <button
              key={pk}
              onClick={() => setFundPeriod(pk)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                fundPeriod === pk ? 'bg-accent/20 text-accent' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {PERIOD_LABELS[pk]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
        <table className="w-full min-w-[860px] text-xs">
          <thead className="border-b border-border bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="sticky left-0 z-20 bg-bg-soft px-2 py-2.5 text-left">#</th>
              <th className="sticky left-8 z-20 bg-bg-soft px-2 py-2.5 text-left">Kod</th>
              <th className="px-2 py-2.5 text-left hidden md:table-cell">Ad / Kategori</th>
              <th className="px-2 py-2.5 text-right">NAV (TL)</th>
              <SortableHeader label="Gün %" sortKey="day" activeKey={fSortKey} dir={fSortDir} onClick={setFSort} />
              <SortableHeader label="1 Hafta %" sortKey="week" activeKey={fSortKey} dir={fSortDir} onClick={setFSort} className="hidden lg:table-cell" />
              <SortableHeader label="1 Ay %" sortKey="month" activeKey={fSortKey} dir={fSortDir} onClick={setFSort} />
              <SortableHeader label="3 Ay %" sortKey="threeMonth" activeKey={fSortKey} dir={fSortDir} onClick={setFSort} />
              <SortableHeader label="6 Ay %" sortKey="sixMonth" activeKey={fSortKey} dir={fSortDir} onClick={setFSort} className="hidden lg:table-cell" />
              <SortableHeader label="1 Yıl %" sortKey="year" activeKey={fSortKey} dir={fSortDir} onClick={setFSort} />
              <th className="px-2 py-2.5 text-center w-24">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {sortedFunds.map(({ entry, tefas }, i) => (
              <WatchlistFundRow
                key={entry.code}
                entry={entry}
                tefas={tefas}
                rank={i + 1}
                period={fundPeriod}
                fmtPct={fmtPct}
                onRemove={() => remove(entry.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

interface WatchlistFundRowProps {
  entry: { id?: number; code: string; name?: string; category?: string };
  tefas: TefasFundData | undefined;
  rank: number;
  period: StockPeriod;
  fmtPct: (v: number | null | undefined) => string;
  onRemove: () => void;
}

/**
 * Watchlist fon tablo satırı — Fonlar sayfasındaki düzenle uyumlu:
 * Sticky # ve Kod kolonları, min-w korunur, çok kolon mobile'da gizlenir.
 * TEFAS dış bağlantısı + çıkar butonu sağ aksiyon alanında.
 */
function WatchlistFundRow({ entry, tefas, rank, period, fmtPct, onRemove }: WatchlistFundRowProps) {
  const sign = (v: number) => (v >= 0 ? '+' : '');
  const returnsTone = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) ? 'text-slate-500' : v >= 0 ? 'text-success' : 'text-danger';
  const displayName = tefas?.name ?? entry.name;
  const displayCategory = tefas?.category ?? entry.category;
  const navStr = tefas?.nav != null
    ? `₺${tefas.nav.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}`
    : '—';

  // Seçili dönem highlight
  const highlightCell = (key: StockPeriod) => period === key ? 'bg-accent/5' : '';

  return (
    <tr className="group border-b border-border/60 transition hover:bg-bg-card">
      <td className="sticky left-0 z-10 bg-bg-soft px-2 py-2 text-left text-[11px] text-slate-500 tabular-nums">{rank}</td>
      <td className="sticky left-8 z-10 bg-bg-soft px-2 py-2 text-left">
        <Link
          to={`/fund/${entry.code}`}
          className="font-mono text-[13px] font-semibold text-accent hover:underline"
        >
          {entry.code}
        </Link>
      </td>
      <td className="px-2 py-2 text-left hidden md:table-cell">
        {displayName && <div className="truncate max-w-[260px] text-slate-200">{displayName}</div>}
        {displayCategory && (
          <span className="mt-0.5 inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">
            {displayCategory}
          </span>
        )}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-100">{navStr}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums', returnsTone(tefas?.returns?.['1d']), highlightCell('1g'))}>
        {fmtPct(tefas?.returns?.['1d'])}
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', returnsTone(tefas?.returns?.['1w']), highlightCell('1h'))}>
        {fmtPct(tefas?.returns?.['1w'])}
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums', returnsTone(tefas?.returns?.['1m']), highlightCell('1a'))}>
        {fmtPct(tefas?.returns?.['1m'])}
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums', returnsTone(tefas?.returns?.['3m']), highlightCell('3a'))}>
        {fmtPct(tefas?.returns?.['3m'])}
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', returnsTone(tefas?.returns?.['6m']), highlightCell('6a'))}>
        {fmtPct(tefas?.returns?.['6m'])}
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums', returnsTone(tefas?.returns?.['1y']), highlightCell('1y'))}>
        {fmtPct(tefas?.returns?.['1y'])}
      </td>
      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex items-center gap-1">
          <a
            href={`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(entry.code)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success hover:bg-success/20"
            title="TEFAS'ta aç"
          >
            TEFAS <ExternalLink size={8} />
          </a>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
            title="Takipten çıkar"
            className="grid h-6 w-6 place-items-center rounded-md text-slate-500 transition hover:bg-danger/15 hover:text-danger"
          >
            <X size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}
