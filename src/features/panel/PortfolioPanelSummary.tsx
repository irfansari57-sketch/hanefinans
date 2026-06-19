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
import { Briefcase, TrendingUp, PiggyBank, ChevronRight } from 'lucide-react';
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
        className="flex items-center gap-3 rounded-xl border border-border bg-bg-soft/40 p-4 transition hover:border-accent/40 hover:bg-bg-soft/60"
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
    <div className="grid gap-3 sm:grid-cols-2">
      <SummaryCard
        title="Hisseler"
        icon={<TrendingUp size={15} />}
        summary={stockSummary}
        empty="Hisse pozisyonu yok"
        href="/portfoy"
      />
      <SummaryCard
        title="Fonlar"
        icon={<PiggyBank size={15} />}
        summary={fundSummary}
        empty="Fon pozisyonu yok"
        href="/portfoy"
      />
    </div>
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
      <div className="rounded-xl border border-border bg-bg-soft/30 p-5 text-center text-xs text-slate-500">
        {empty}
      </div>
    );
  }
  const pnlPos = summary.pnl >= 0;
  const dailyPos = summary.dailyChange >= 0;
  return (
    <Link
      to={href}
      className={cn(
        // 3D premium kart: gradient + ic glow + dis shadow + hover lift
        'group relative overflow-hidden rounded-2xl border border-accent/20 p-4 transition-all duration-300',
        'bg-gradient-to-br from-bg-card via-bg-card/95 to-bg-soft/80',
        'shadow-[0_8px_24px_-6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]',
        'hover:border-accent/40 hover:shadow-[0_14px_32px_-8px_rgba(34,211,238,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]',
        'hover:-translate-y-0.5',
      )}
    >
      {/* Üst köşe ışık parlaması */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-accent/12 blur-3xl" />
      {/* Alt köşe gölge derinligi */}
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-accent/8 blur-2xl" />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            {icon}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-200">{title}</span>
          <span className="text-[10px] text-slate-500">· {summary.count} pozisyon</span>
        </div>
        <ChevronRight size={14} className="text-slate-500 transition group-hover:text-accent group-hover:translate-x-0.5" />
      </div>

      {/* Metrikler 3'lu */}
      <div className="relative grid grid-cols-3 gap-2.5">
        <Metric label="DEĞER" value={formatMoney(summary.totalValue)} tone="accent" big />
        <Metric
          label="K/Z"
          value={`${pnlPos ? '+' : ''}${formatMoney(summary.pnl)}`}
          sub={`${pnlPos ? '+' : ''}${summary.pnlPct.toFixed(2)}%`}
          tone={pnlPos ? 'success' : 'danger'}
        />
        <Metric
          label="BUGÜN"
          value={`${dailyPos ? '+' : ''}${formatMoney(summary.dailyChange)}`}
          sub={`${dailyPos ? '+' : ''}${summary.dailyChangePct.toFixed(2)}%`}
          tone={dailyPos ? 'success' : 'danger'}
        />
      </div>
    </Link>
  );
}

function Metric({ label, value, sub, tone, big }: { label: string; value: string; sub?: string; tone?: 'accent' | 'success' | 'danger'; big?: boolean }) {
  const colorClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : 'text-slate-200';
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500 truncate">{label}</div>
      <div className={cn('mt-1 font-mono font-extrabold tabular-nums truncate drop-shadow-sm', big ? 'text-sm' : 'text-xs', colorClass)}>{value}</div>
      {sub && <div className={cn('text-[10px] font-bold tabular-nums', colorClass)}>{sub}</div>}
    </div>
  );
}
