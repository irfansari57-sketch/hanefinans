import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { Plus, Star, X, Search, RefreshCw, Radio, PiggyBank, TrendingUp, ExternalLink, ChevronRight, Trash2 } from 'lucide-react';
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
  const focusRef = useRef<HTMLDivElement | null>(null);
  const [kind, setKind] = useState<'stocks' | 'funds'>('stocks');
  const [tefasFunds, setTefasFunds] = useState<TefasFundData[] | null>(null);
  const [stockPeriod, setStockPeriod] = useState<StockPeriod>('1g');

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
    const positives = watched.filter((s) => s.changePct > 0).length;
    const negatives = watched.filter((s) => s.changePct < 0).length;
    const avg = watched.reduce((s, x) => s + x.changePct, 0) / watched.length;
    return { positives, negatives, avg };
  }, [watched]);

  // Takipteki fonların TEFAS verisi ile birleşimi
  const watchedFundsWithData = useMemo(() => {
    if (!tefasFunds) return watchedFunds.map((f) => ({ entry: f, tefas: undefined as TefasFundData | undefined }));
    const tefasMap = new Map(tefasFunds.map((t) => [t.code, t]));
    return watchedFunds.map((f) => ({ entry: f, tefas: tefasMap.get(f.code) }));
  }, [watchedFunds, tefasFunds]);

  return (
    <>
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

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[...watched]
              .sort((a, b) => {
                const av = stockReturns[a.symbol]?.[stockPeriod];
                const bv = stockReturns[b.symbol]?.[stockPeriod];
                if (av == null && bv == null) return 0;
                if (av == null) return 1;
                if (bv == null) return -1;
                return bv - av;
              })
              .map((s) => (
                <div
                  key={s.symbol}
                  ref={focusSymbol === s.symbol ? focusRef : undefined}
                  className={cn(focusSymbol === s.symbol && 'rounded-xl ring-2 ring-accent/50')}
                >
                  <WatchlistStockCard
                    stock={s}
                    period={stockPeriod}
                    periodLabel={PERIOD_LABELS[stockPeriod]}
                    returns={stockReturns[s.symbol]}
                    onRemove={() => remove(s.symbol)}
                  />
                </div>
              ))}
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

interface WatchlistStockCardProps {
  stock: Stock;
  period: StockPeriod;
  periodLabel: string;
  returns: PeriodReturns | undefined;
  onRemove: () => void;
}

/**
 * Watchlist hisse performans kartı — seçili döneme göre büyük getiri yüzdesi
 * + fiyat + günlük değişim + hızlı aksiyonlar.
 *
 * Öneriler sayfasının kart stiline benzer ama daha kompakt; her hisse 1 kart,
 * mobile'da tek sütun, sm 2 sütun, lg 3 sütun.
 */
function WatchlistStockCard({ stock, period, periodLabel, returns, onRemove }: WatchlistStockCardProps) {
  const dayChange = stock.changePct;
  const periodReturn = returns?.[period];
  const periodTone = periodReturn == null
    ? 'text-slate-500'
    : periodReturn >= 0 ? 'text-success' : 'text-danger';
  const dayTone = dayChange >= 0 ? 'text-success' : 'text-danger';
  const sign = (v: number) => (v >= 0 ? '+' : '');

  return (
    <div className="group glass-card relative overflow-hidden p-3 transition hover:border-accent/40">
      {/* Sağ üstte çıkar butonu */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
        title="Takipten çıkar"
        className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-bg-soft/80 text-slate-500 opacity-0 transition hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
      >
        <X size={12} />
      </button>

      <Link to={`/stock/${stock.symbol}`} className="block">
        <div className="flex items-start gap-2 pr-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-base font-bold text-accent">{stock.symbol}</span>
              {stock.sector && (
                <span className="rounded border border-border bg-bg-soft px-1.5 py-0.5 text-[9px] text-slate-400">
                  {stock.sector}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-slate-400">{stock.name}</div>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-xl font-bold tabular-nums text-slate-100">{formatMoney(stock.price)}</div>
            <div className={cn('text-xs font-semibold tabular-nums', dayTone)}>
              {sign(dayChange)}{dayChange.toFixed(2)}% <span className="text-[10px] text-slate-500">bugün</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{periodLabel}</div>
            {periodReturn == null ? (
              <div className="text-base font-bold tabular-nums text-slate-600">—</div>
            ) : (
              <div className={cn('text-lg font-bold tabular-nums', periodTone)}>
                {sign(periodReturn)}{periodReturn.toFixed(2)}%
              </div>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

interface FundsTabProps {
  watchedFundsWithData: Array<{
    entry: { id?: number; code: string; name?: string; category?: string };
    tefas: TefasFundData | undefined;
  }>;
}

function FundsTab({ watchedFundsWithData }: FundsTabProps) {
  const fmtPct = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
  };
  const toneFor = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) ? 'text-slate-500' : v >= 0 ? 'text-success' : 'text-danger';

  const remove = async (id?: number) => {
    if (id == null) return;
    await fundsRepo.remove(id);
  };

  if (watchedFundsWithData.length === 0) {
    return (
      <EmptyState
        icon={<PiggyBank size={28} />}
        title="Takipte fon yok"
        description="Fonlar sayfasından yıldıza basarak takip ekleyebilirsin."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
      <table className="min-w-full text-xs">
        <thead className="bg-bg-card text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-3 py-2.5 text-left">Kod</th>
            <th className="px-3 py-2.5 text-right">NAV (TL)</th>
            <th className="px-3 py-2.5 text-right">1 Gün</th>
            <th className="px-3 py-2.5 text-right hidden md:table-cell">1 Hafta</th>
            <th className="px-3 py-2.5 text-right">1 Ay</th>
            <th className="px-3 py-2.5 text-right hidden md:table-cell">3 Ay</th>
            <th className="px-3 py-2.5 text-right">1 Yıl</th>
            <th className="px-3 py-2.5 text-center w-32">İşlem</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {watchedFundsWithData.map(({ entry, tefas }) => (
            <tr key={entry.code} className="group hover:bg-bg-card transition-colors">
              <td className="px-3 py-2.5 text-left whitespace-nowrap">
                <Link
                  to={`/fund/${entry.code}`}
                  className="inline-flex items-center gap-1.5 font-mono font-semibold text-accent hover:underline"
                >
                  {entry.code}
                  <ChevronRight size={10} className="opacity-0 transition group-hover:opacity-100" />
                </Link>
                {(tefas?.name ?? entry.name) && (
                  <div className="mt-0.5 truncate text-[10px] text-slate-500 max-w-[260px]">
                    {tefas?.name ?? entry.name}
                  </div>
                )}
                {(tefas?.category ?? entry.category) && (
                  <span className="mt-1 inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">
                    {tefas?.category ?? entry.category}
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">
                {tefas?.nav != null ? `₺${tefas.nav.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}` : '—'}
              </td>
              <td className={cn('px-3 py-2.5 text-right tabular-nums', toneFor(tefas?.returns['1d']))}>
                {fmtPct(tefas?.returns['1d'])}
              </td>
              <td className={cn('px-3 py-2.5 text-right tabular-nums hidden md:table-cell', toneFor(tefas?.returns['1w']))}>
                {fmtPct(tefas?.returns['1w'])}
              </td>
              <td className={cn('px-3 py-2.5 text-right tabular-nums', toneFor(tefas?.returns['1m']))}>
                {fmtPct(tefas?.returns['1m'])}
              </td>
              <td className={cn('px-3 py-2.5 text-right tabular-nums hidden md:table-cell', toneFor(tefas?.returns['3m']))}>
                {fmtPct(tefas?.returns['3m'])}
              </td>
              <td className={cn('px-3 py-2.5 text-right tabular-nums', toneFor(tefas?.returns['1y']))}>
                {fmtPct(tefas?.returns['1y'])}
              </td>
              <td className="px-3 py-2.5 text-center">
                <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(entry.code)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success hover:bg-success/20"
                  >
                    TEFAS <ExternalLink size={9} />
                  </a>
                  <button
                    onClick={() => remove(entry.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger hover:bg-danger/20"
                    title="Takipten çıkar"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
