/**
 * Panel — Portfoyum Ozet karti.
 *
 * Iki sutun: solda Hisseler ozeti, sagda Fonlar ozeti.
 * Her sutun: kompakt 3 metrik (Toplam Deger / K-Z / Bugun) + top 2 pozisyon.
 *
 * Veri kaynaklari:
 *   - db.portfolio (Dexie, login durumunda Layout sync ile cloud ile esit)
 *   - /api/yahoo/snapshot (hisse anlik fiyat)
 *   - data/tefas.json feed (fon anlik NAV)
 *
 * Render kosulu: kullanici login + en az 1 pozisyon olmali.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Briefcase, TrendingUp, TrendingDown, PiggyBank, ChevronRight } from 'lucide-react';
import { db } from '@/data/db';
import { loadStocks } from '@/data/services';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import type { Stock, FundPerformance } from '@/data/types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  /** Auth'lu kullanici mi? false ise component null doner */
  isLoggedIn: boolean;
}

interface PositionSummary {
  totalValue: number;
  totalCost: number;
  pnl: number;
  pnlPct: number;
  dailyChange: number;
  dailyChangePct: number;
  count: number;
  /** En guclu kazandiran pozisyon */
  topGain?: { symbol: string; name?: string; pnlPct: number; pnl: number };
  /** En zayif (kaybeden) pozisyon */
  topLoss?: { symbol: string; name?: string; pnlPct: number; pnl: number };
}

export function PortfolioPanelSummary({ isLoggedIn }: Props) {
  const positions = useLiveQuery(() => db.portfolio.toArray(), []) ?? [];
  const stocks = useMemo(() => positions.filter((p) => p.kind !== 'fund'), [positions]);
  const funds = useMemo(() => positions.filter((p) => p.kind === 'fund'), [positions]);

  const [stockMap, setStockMap] = useState<Map<string, Stock>>(new Map());
  const [fundMap, setFundMap] = useState<Map<string, FundPerformance>>(new Map());

  // Anlik fiyatlar
  useEffect(() => {
    let alive = true;
    if (stocks.length === 0) { setStockMap(new Map()); return; }
    const symbols = Array.from(new Set(stocks.map((p) => p.symbol)));
    loadStocks(symbols).then(({ data }) => {
      if (!alive) return;
      const m = new Map<string, Stock>();
      data.forEach((s) => m.set(s.symbol, s));
      setStockMap(m);
    });
    return () => { alive = false; };
  }, [stocks.length, stocks.map((p) => p.symbol).join(',')]);

  useEffect(() => {
    let alive = true;
    if (funds.length === 0) { setFundMap(new Map()); return; }
    loadFundsAsPerformance().then((r) => {
      if (!alive || !r?.funds) return;
      const m = new Map<string, FundPerformance>();
      r.funds.forEach((f) => m.set(f.code, f));
      setFundMap(m);
    });
    return () => { alive = false; };
  }, [funds.length]);

  // Hisse ozet
  const stockSummary = useMemo<PositionSummary>(() => {
    const items = stocks.map((p) => {
      const s = stockMap.get(p.symbol);
      const price = s?.price && s.price > 0 ? s.price : undefined;
      const cost = p.lot * p.avgPrice;
      const value = price ? p.lot * price : cost;
      const pnl = value - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      const changePct = s?.changePct ?? 0;
      const yesterdayPrice = price && changePct ? price / (1 + changePct / 100) : price;
      const daily = price && yesterdayPrice ? (price - yesterdayPrice) * p.lot : 0;
      return { p, s, cost, value, pnl, pnlPct, daily };
    });
    const totalValue = items.reduce((a, b) => a + b.value, 0);
    const totalCost = items.reduce((a, b) => a + b.cost, 0);
    const pnl = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    const dailyChange = items.reduce((a, b) => a + b.daily, 0);
    const yesterdayValue = totalValue - dailyChange;
    const dailyChangePct = yesterdayValue > 0 ? (dailyChange / yesterdayValue) * 100 : 0;
    const withPnl = items.filter((i) => i.cost > 0);
    const top = [...withPnl].sort((a, b) => b.pnlPct - a.pnlPct);
    return {
      totalValue, totalCost, pnl, pnlPct, dailyChange, dailyChangePct,
      count: stocks.length,
      topGain: top[0] ? { symbol: top[0].p.symbol, name: top[0].s?.name, pnlPct: top[0].pnlPct, pnl: top[0].pnl } : undefined,
      topLoss: top.length > 1 ? { symbol: top[top.length - 1].p.symbol, name: top[top.length - 1].s?.name, pnlPct: top[top.length - 1].pnlPct, pnl: top[top.length - 1].pnl } : undefined,
    };
  }, [stocks, stockMap]);

  // Fon ozet
  const fundSummary = useMemo<PositionSummary>(() => {
    const items = funds.map((p) => {
      const f = fundMap.get(p.symbol);
      const nav = f?.nav && f.nav > 0 ? f.nav : undefined;
      const cost = p.lot * p.avgPrice;
      const value = nav ? p.lot * nav : cost;
      const pnl = value - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      const dailyPct = f?.day ?? 0;
      const daily = (dailyPct / 100) * value;
      return { p, f, cost, value, pnl, pnlPct, daily };
    });
    const totalValue = items.reduce((a, b) => a + b.value, 0);
    const totalCost = items.reduce((a, b) => a + b.cost, 0);
    const pnl = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    const dailyChange = items.reduce((a, b) => a + b.daily, 0);
    const yesterdayValue = totalValue - dailyChange;
    const dailyChangePct = yesterdayValue > 0 ? (dailyChange / yesterdayValue) * 100 : 0;
    const withPnl = items.filter((i) => i.cost > 0);
    const top = [...withPnl].sort((a, b) => b.pnlPct - a.pnlPct);
    return {
      totalValue, totalCost, pnl, pnlPct, dailyChange, dailyChangePct,
      count: funds.length,
      topGain: top[0] ? { symbol: top[0].p.symbol, name: top[0].f?.name, pnlPct: top[0].pnlPct, pnl: top[0].pnl } : undefined,
      topLoss: top.length > 1 ? { symbol: top[top.length - 1].p.symbol, name: top[top.length - 1].f?.name, pnlPct: top[top.length - 1].pnlPct, pnl: top[top.length - 1].pnl } : undefined,
    };
  }, [funds, fundMap]);

  if (!isLoggedIn) return null;
  if (stocks.length === 0 && funds.length === 0) {
    return (
      <Link
        to="/portfoy"
        className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-bg-soft/40 p-4 transition hover:border-accent/40 hover:bg-bg-soft/60"
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
          <Briefcase size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-100">Portföyünüz boş</div>
          <div className="text-[11px] text-slate-400 leading-tight">İlk pozisyonu ekleyin — canlı kâr/zarar takibi başlasın.</div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-accent" />
      </Link>
    );
  }

  return (
    <section className="mb-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
          <Briefcase size={14} className="text-accent" /> Portföyüm
        </h2>
        <Link to="/portfoy" className="text-[11px] font-medium text-accent hover:underline inline-flex items-center gap-1">
          Detaylı görünüm <ChevronRight size={12} />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* HİSSELER */}
        <SummaryCard
          title="Hisseler"
          icon={<TrendingUp size={14} />}
          summary={stockSummary}
          empty="Hisse pozisyonu yok"
          href="/portfoy"
        />
        {/* FONLAR */}
        <SummaryCard
          title="Fonlar"
          icon={<PiggyBank size={14} />}
          summary={fundSummary}
          empty="Fon pozisyonu yok"
          href="/portfoy"
        />
      </div>
    </section>
  );
}

function SummaryCard({
  title,
  icon,
  summary,
  empty,
  href,
}: {
  title: string;
  icon: React.ReactNode;
  summary: PositionSummary;
  empty: string;
  href: string;
}) {
  if (summary.count === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-soft/30 p-4 text-center text-xs text-slate-500">
        {empty}
      </div>
    );
  }
  const pnlPos = summary.pnl >= 0;
  const dailyPos = summary.dailyChange >= 0;
  return (
    <Link
      to={href}
      className="group relative overflow-hidden rounded-xl border border-border bg-bg-soft/40 p-3.5 transition hover:border-accent/30 hover:bg-bg-soft/60"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent/15 text-accent">{icon}</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">{title}</span>
          <span className="text-[10px] text-slate-500">· {summary.count} pozisyon</span>
        </div>
      </div>
      {/* Metrikler 3'lu */}
      <div className="grid grid-cols-3 gap-2 mb-2.5">
        <Metric label="Değer" value={formatMoney(summary.totalValue)} tone="accent" />
        <Metric
          label="K/Z"
          value={`${pnlPos ? '+' : ''}${formatMoney(summary.pnl)}`}
          sub={`${pnlPos ? '+' : ''}${summary.pnlPct.toFixed(2)}%`}
          tone={pnlPos ? 'success' : 'danger'}
        />
        <Metric
          label="Bugün"
          value={`${dailyPos ? '+' : ''}${formatMoney(summary.dailyChange)}`}
          sub={`${dailyPos ? '+' : ''}${summary.dailyChangePct.toFixed(2)}%`}
          tone={dailyPos ? 'success' : 'danger'}
        />
      </div>
      {/* En guclu / zayif */}
      {(summary.topGain || summary.topLoss) && (
        <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-2">
          {summary.topGain && (
            <MiniRow
              label="En güçlü"
              symbol={summary.topGain.symbol}
              pnlPct={summary.topGain.pnlPct}
              tone="success"
            />
          )}
          {summary.topLoss && summary.topLoss.symbol !== summary.topGain?.symbol && (
            <MiniRow
              label="En zayıf"
              symbol={summary.topLoss.symbol}
              pnlPct={summary.topLoss.pnlPct}
              tone="danger"
            />
          )}
        </div>
      )}
    </Link>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'accent' | 'success' | 'danger' }) {
  const colorClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : 'text-slate-200';
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 truncate">{label}</div>
      <div className={cn('mt-0.5 font-mono text-xs font-bold tabular-nums truncate', colorClass)}>{value}</div>
      {sub && <div className={cn('text-[10px] font-semibold tabular-nums', colorClass)}>{sub}</div>}
    </div>
  );
}

function MiniRow({ label, symbol, pnlPct, tone }: { label: string; symbol: string; pnlPct: number; tone: 'success' | 'danger' }) {
  const Icon = tone === 'success' ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon size={11} className={tone === 'success' ? 'text-success shrink-0' : 'text-danger shrink-0'} />
      <span className="text-[10px] text-slate-500 shrink-0">{label}</span>
      <span className="font-mono text-[11px] font-bold text-slate-200 truncate">{symbol}</span>
      <span className={cn('ml-auto font-mono text-[11px] font-bold tabular-nums', tone === 'success' ? 'text-success' : 'text-danger')}>
        {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
      </span>
    </div>
  );
}
