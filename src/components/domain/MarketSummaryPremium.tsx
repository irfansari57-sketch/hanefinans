import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, BarChart3, Coins, Bitcoin, ArrowUpRight } from 'lucide-react';
import type { MacroIndicator } from '@/data/types';
import { macroKeyToRoute } from '@/lib/macroRoutes';
import { cn } from '@/lib/utils';

/**
 * Premium 3-sütunlu Piyasa Özeti — Panel sayfasının üst bloğu.
 * Üç kategori yan yana: Endeks & Döviz / Kıymetli Metal / Kripto.
 * Her satır clickable → detay sayfasına gider.
 * Renkli rozet içinde +/- yüzde + trend ok ikonu.
 */

interface Props {
  macro: MacroIndicator[];
}

const COL_INDICES = ['BIST 100', 'BIST 30', 'USD/TRY', 'EUR/TRY'];
const COL_METALS = ['Gram Altın', 'Gram Gümüş', 'Ons Altın', 'Ons Gümüş'];
const COL_CRYPTO = ['BTC/USD', 'ETH/USD', 'XRP/USD', 'DOGE/USD'];

function formatValue(m: MacroIndicator): string {
  if (m.key === 'BIST 100' || m.key === 'BIST 30') {
    return m.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  }
  if (m.key === 'USD/TRY' || m.key === 'EUR/TRY') {
    return m.value.toFixed(2);
  }
  if (m.key === 'Gram Altın' || m.key === 'Gram Gümüş') {
    return m.value.toLocaleString('tr-TR', { maximumFractionDigits: m.value < 100 ? 2 : 0 }) + ' ₺';
  }
  if (m.key === 'Ons Altın' || m.key === 'Ons Gümüş') {
    return '$' + m.value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (m.value < 1) return '$' + m.value.toFixed(4);
  if (m.value < 10) return '$' + m.value.toFixed(4);
  if (m.value < 1000) return '$' + m.value.toFixed(2);
  return '$' + m.value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function Row({ m }: { m: MacroIndicator }) {
  const route = macroKeyToRoute(m.key);
  const cp = m.changePct;
  const isFinitePct = cp != null && Number.isFinite(cp);
  const isUp = isFinitePct && (cp as number) > 0;
  const isDown = isFinitePct && (cp as number) < 0;

  const content = (
    <div className="flex items-center justify-between gap-2 py-1.5 sm:py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:text-[11px]">
          <span className="truncate">{m.label}</span>
          {route && (
            <ArrowUpRight size={10} className="shrink-0 opacity-0 transition group-hover/row:opacity-60" />
          )}
        </div>
        <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-100 sm:text-base">
          {formatValue(m)}
        </div>
      </div>
      <div className="shrink-0">
        {!isFinitePct ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-700/30 px-1.5 py-1 text-[10px] font-semibold text-slate-500">
            <Minus size={11} />
            <span className="tabular-nums">—</span>
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold tabular-nums sm:text-[11px]',
              isUp && 'bg-success/15 text-success',
              isDown && 'bg-danger/15 text-danger',
            )}
          >
            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {(cp as number) >= 0 ? '+' : ''}
            {(cp as number).toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );

  return route ? (
    <Link
      to={route}
      className="group/row -mx-2 block rounded-md px-2 transition hover:bg-slate-700/15 [&+a]:border-t [&+a]:border-slate-700/25 [&+div]:border-t [&+div]:border-slate-700/25"
    >
      {content}
    </Link>
  ) : (
    <div className="-mx-2 px-2 [&+a]:border-t [&+a]:border-slate-700/25 [&+div]:border-t [&+div]:border-slate-700/25">
      {content}
    </div>
  );
}

interface ColumnProps {
  title: string;
  icon: React.ReactNode;
  borderClass: string;
  items: MacroIndicator[];
}

function Column({ title, icon, borderClass, items }: ColumnProps) {
  return (
    <div className={cn('rounded-xl border bg-bg-card/50 p-2.5 transition sm:p-3', borderClass)}>
      <div className="mb-1 flex items-center gap-1.5 border-b border-slate-700/30 pb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:text-[11px]">
          {title}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="py-3 text-center text-[11px] text-slate-500">Yükleniyor…</div>
      ) : (
        items.map((m) => <Row key={m.key} m={m} />)
      )}
    </div>
  );
}

export function MarketSummaryPremium({ macro }: Props) {
  const findItems = (keys: string[]) =>
    keys
      .map((k) => macro.find((m) => m.key === k))
      .filter((m): m is MacroIndicator => !!m);

  const indices = findItems(COL_INDICES);
  const metals = findItems(COL_METALS);
  const crypto = findItems(COL_CRYPTO);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      <Column
        title="Endeks & Döviz"
        icon={<BarChart3 size={14} className="text-accent" />}
        borderClass="border-accent/20 hover:border-accent/40"
        items={indices}
      />
      <Column
        title="Kıymetli Metal"
        icon={<Coins size={14} className="text-warning" />}
        borderClass="border-warning/20 hover:border-warning/40"
        items={metals}
      />
      <Column
        title="Kripto"
        icon={<Bitcoin size={14} className="text-fuchsia-400" />}
        borderClass="border-fuchsia-500/20 hover:border-fuchsia-500/40"
        items={crypto}
      />
    </div>
  );
}
