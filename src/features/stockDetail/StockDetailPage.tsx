import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, Star, Bell, StickyNote, Newspaper, Activity, TrendingUp, TrendingDown,
  AlertCircle, ExternalLink, RefreshCw, Trash2, Calendar,
} from 'lucide-react';
import { LiveChart } from '@/components/domain/LiveChart';
import { PeriodReturns } from '@/components/domain/PeriodReturns';
import { Sparkline } from '@/components/domain/Sparkline';
import { NewsCard } from '@/components/domain/NewsCard';
import { AlertButton } from '@/components/domain/AlertButton';
import { NoteButton } from '@/components/domain/NoteButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { fetchHistoricalYahoo, computePeriodReturns, type HistoricalSeries, type PeriodReturns as PeriodReturnsT } from '@/data/api/yahoo';
import { loadStocks, loadNews } from '@/data/services';
import { notesRepo, alertsRepo, activityRepo } from '@/data/repositories';
import { useWatchlist } from '@/store/watchlist';
import type { Stock, NewsItem } from '@/data/types';
import { MOCK_STOCKS } from '@/data/mock';
import { formatMoney, formatNumber, formatCompact } from '@/lib/format';
import { formatRelative, formatDateTR } from '@/lib/date';
import { cn } from '@/lib/utils';

export function StockDetailPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const sym = symbol.toUpperCase();

  const watchlistAdd = useWatchlist((s) => s.add);
  const watchlistRemove = useWatchlist((s) => s.remove);
  const watchlistHas = useWatchlist((s) => s.has(sym));

  const [stock, setStock] = useState<Stock | null>(() => MOCK_STOCKS.find((s) => s.symbol === sym) ?? null);
  const [historical, setHistorical] = useState<HistoricalSeries | null>(null);
  const [returns, setReturns] = useState<PeriodReturnsT>({});
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  // User-specific data from IndexedDB
  const notes = useLiveQuery(() => notesRepo.bySymbol(sym), [sym]) ?? [];
  const alerts = useLiveQuery(() => alertsRepo.bySymbol(sym), [sym]) ?? [];
  const symbolActivity = useLiveQuery(() => activityRepo.list({ symbol: sym, limit: 30 }), [sym]) ?? [];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      loadStocks([sym]),
      fetchHistoricalYahoo(sym, '1y', '1d'),
      loadNews({ max: 30 }),
    ]).then(([liveStocks, hist, allNews]) => {
      if (!alive) return;
      const found = liveStocks.data.find((s) => s.symbol === sym);
      if (found) setStock(found);
      if (hist) {
        setHistorical(hist);
        setReturns(computePeriodReturns(hist.closes));
      }
      setNews(allNews.data.filter((n) => n.symbols.includes(sym)));
      setLoading(false);

      // Log view
      activityRepo.log({ type: 'page-view', symbol: sym, detail: `/stock/${sym}` }).catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [sym]);

  if (!stock) {
    return (
      <>
        <button onClick={() => navigate(-1)} className="btn-ghost mb-3">
          <ArrowLeft size={14} /> Geri
        </button>
        <EmptyState
          icon={<AlertCircle size={28} />}
          title="Sembol bulunamadı"
          description={`"${sym}" için veri yok.`}
        />
      </>
    );
  }

  const sparklineData = historical ? historical.closes.slice(-30).map((c) => c.close) : [];
  const tone = stock.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = stock.changePct >= 0 ? '+' : '';

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="btn-ghost">
          <ArrowLeft size={14} /> Geri
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (watchlistHas ? watchlistRemove(sym) : watchlistAdd(sym))}
            className={cn(
              'btn-secondary',
              watchlistHas && 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/20',
            )}
          >
            <Star size={14} fill={watchlistHas ? 'currentColor' : 'none'} />
            {watchlistHas ? 'Takipte' : 'Takip et'}
          </button>
          <AlertButton stock={stock} />
          <NoteButton symbol={sym} hint={`${stock.name} için not`} />
        </div>
      </div>

      {/* Hero */}
      <div className="card relative mb-4 overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-3xl font-bold tracking-tight text-slate-100">{sym}</h1>
              {stock.sector && (
                <span className="rounded-md border border-border bg-bg-soft px-2 py-0.5 text-xs text-slate-300">
                  {stock.sector}
                </span>
              )}
              <span className="rounded-md bg-bg-soft px-2 py-0.5 text-xs text-slate-400">BIST</span>
            </div>
            <p className="mt-1 text-lg text-slate-300">{stock.name}</p>
          </div>
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-3">
              <span className="text-4xl font-bold tabular-nums text-slate-100">
                {formatMoney(stock.price)}
              </span>
              {sparklineData.length > 1 && (
                <Sparkline
                  data={sparklineData}
                  width={120}
                  height={36}
                  positive={stock.changePct >= 0}
                />
              )}
            </div>
            <div className={cn('mt-1 text-lg font-semibold tabular-nums', tone)}>
              {sign}
              {stock.changePct.toFixed(2)}%
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              <Calendar size={10} className="mr-1 inline" />
              {formatRelative(stock.updatedAt)}
            </div>
          </div>
        </div>

        {/* Period returns */}
        <div className="mt-5">
          <PeriodReturns returns={returns} />
        </div>
      </div>

      {/* Chart */}
      <div className="card mb-4 overflow-hidden p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          Canlı Grafik <span className="text-slate-500">(Yahoo Finance + lightweight-charts)</span>
        </h2>
        <LiveChart symbol={sym} height={520} />
      </div>

      {/* Stats grid */}
      {historical && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="52 Hafta En Yüksek"
            value={historical.meta.fiftyTwoWeekHigh ? formatMoney(historical.meta.fiftyTwoWeekHigh) : '—'}
            tone="success"
          />
          <Stat
            label="52 Hafta En Düşük"
            value={historical.meta.fiftyTwoWeekLow ? formatMoney(historical.meta.fiftyTwoWeekLow) : '—'}
            tone="danger"
          />
          <Stat
            label="Hacim"
            value={historical.meta.regularMarketVolume ? formatCompact(historical.meta.regularMarketVolume) : '—'}
          />
          <Stat
            label="Ort. Hacim (3A)"
            value={historical.meta.averageDailyVolume3Month ? formatCompact(historical.meta.averageDailyVolume3Month) : '—'}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* News mentioning this symbol */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Newspaper size={14} /> Bu Sembolü İçeren Gelişmeler ({news.length})
          </h2>
          {news.length === 0 ? (
            <div className="card p-6 text-center text-xs text-slate-500">
              {loading ? 'Yükleniyor…' : `${sym} hakkında haber bulunamadı.`}
            </div>
          ) : (
            <div className="space-y-3">
              {news.slice(0, 10).map((n) => (
                <NewsCard key={n.id} item={n} />
              ))}
            </div>
          )}
        </section>

        {/* Right panel: notes, alerts, activity */}
        <aside className="space-y-4">
          {/* Notes */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <StickyNote size={12} /> Notlarım
              </h3>
              <span className="text-[10px] text-slate-500">{notes.length}</span>
            </div>
            {notes.length === 0 ? (
              <p className="px-4 py-4 text-center text-xs text-slate-500">
                Henüz not yok. Üst menüden "Not" tuşuna bas.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {notes.slice(0, 5).map((n) => (
                  <div key={n.id} className="p-3">
                    <p className="text-xs text-slate-300">{n.body}</p>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{formatDateTR(new Date(n.updatedAt).toISOString())}</span>
                      <button
                        onClick={() => n.id && notesRepo.remove(n.id)}
                        className="text-danger/70 hover:text-danger"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
                {notes.length > 5 && (
                  <Link to="/history" className="block px-3 py-2 text-center text-[11px] text-accent hover:bg-bg-soft">
                    +{notes.length - 5} not daha — Geçmiş'te gör
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Alerts */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <Bell size={12} /> Alarmlarım
              </h3>
              <span className="text-[10px] text-slate-500">{alerts.length}</span>
            </div>
            {alerts.length === 0 ? (
              <p className="px-4 py-4 text-center text-xs text-slate-500">Alarm yok.</p>
            ) : (
              <div className="divide-y divide-border">
                {alerts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3">
                    <div>
                      <div className="text-xs text-slate-200">
                        {a.direction === 'above' ? '≥' : '≤'} {formatMoney(a.threshold)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {a.enabled ? 'Aktif' : 'Pasif'} • {formatRelative(new Date(a.createdAt).toISOString())}
                      </div>
                    </div>
                    <button
                      onClick={() => a.id && alertsRepo.remove(a.id)}
                      className="text-danger/70 hover:text-danger"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <Activity size={12} /> Bu Sembol İçin Aktivite
              </h3>
              <span className="text-[10px] text-slate-500">{symbolActivity.length}</span>
            </div>
            {symbolActivity.length === 0 ? (
              <p className="px-4 py-4 text-center text-xs text-slate-500">Henüz etkileşim yok.</p>
            ) : (
              <div className="divide-y divide-border max-h-80 overflow-y-auto">
                {symbolActivity.slice(0, 20).map((a) => (
                  <div key={a.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">{a.type}</span>
                      <span className="text-[10px] text-slate-500">
                        {formatRelative(new Date(a.timestamp).toISOString())}
                      </span>
                    </div>
                    {a.detail && <div className="mt-0.5 truncate text-[10px] text-slate-500">{a.detail}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* External links */}
          <div className="card p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Dış Bağlantılar</h3>
            <div className="space-y-1.5">
              <a
                href={`https://www.tradingview.com/symbols/BIST-${sym}/`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:bg-bg-card"
              >
                <span>TradingView</span>
                <ExternalLink size={11} />
              </a>
              <a
                href={`https://www.kap.org.tr/tr/sirket-bilgileri/ozet/${sym}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:bg-bg-card"
              >
                <span>KAP Şirket Bilgileri</span>
                <ExternalLink size={11} />
              </a>
              <a
                href={`https://finans.mynet.com/borsa/hisseler/${sym.toLowerCase()}/`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:bg-bg-card"
              >
                <span>Mynet Finans</span>
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-slate-100';
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tabular-nums', toneClass)}>{value}</div>
    </div>
  );
}
