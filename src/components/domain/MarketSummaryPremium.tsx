import { Link } from 'react-router-dom';
import type { MacroIndicator } from '@/data/types';
import { macroKeyToRoute } from '@/lib/macroRoutes';
import { cn } from '@/lib/utils';

/**
 * FT SALMON COMPACT TICKER — Panel Piyasa Ozeti.
 * Onceki: 3 dikey sutun (Endeks/Metal/Kripto), her sutunda 4 satir.
 * Simdi: tek yatay serit, tum 12 gosterge yan yana, horizontal scroll (mobil dostu).
 * Bloomberg terminal tarzi — daha az yer, daha fazla veri, dinamik.
 */

interface Props {
  macro: MacroIndicator[];
}

const TICKER_ORDER = [
  'BIST 100', 'BIST 30', 'USD/TRY', 'EUR/TRY',
  'Gram Altın', 'Ons Altın', 'Gram Gümüş',
  'BTC/USD', 'ETH/USD', 'XRP/USD',
];

function formatValue(m: MacroIndicator): string {
  if (m.key === 'BIST 100' || m.key === 'BIST 30') {
    return m.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  }
  if (m.key === 'USD/TRY' || m.key === 'EUR/TRY') {
    return m.value.toFixed(2);
  }
  if (m.key === 'Gram Altın' || m.key === 'Gram Gümüş') {
    return m.value.toLocaleString('tr-TR', { maximumFractionDigits: m.value < 100 ? 2 : 0 });
  }
  if (m.key === 'Ons Altın' || m.key === 'Ons Gümüş') {
    return m.value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  if (m.value < 1) return m.value.toFixed(4);
  if (m.value < 10) return m.value.toFixed(3);
  if (m.value < 1000) return m.value.toFixed(2);
  return m.value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function TickerCell({ m }: { m: MacroIndicator }) {
  const route = macroKeyToRoute(m.key);
  const cp = m.changePct;
  const isFinitePct = cp != null && Number.isFinite(cp);
  const isUp = isFinitePct && (cp as number) > 0;
  const isDown = isFinitePct && (cp as number) < 0;

  const content = (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
      <div className="min-w-0 flex flex-col leading-tight">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
          {m.label}
        </span>
        <span className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100 truncate">
          {formatValue(m)}
        </span>
      </div>
      {isFinitePct && (
        <span
          className={cn(
            'shrink-0 text-xs font-semibold tabular-nums font-sans',
            isUp && 'text-success',
            isDown && 'text-danger',
          )}
        >
          {(cp as number) >= 0 ? '+' : ''}{(cp as number).toFixed(2)}%
        </span>
      )}
    </div>
  );

  return route ? (
    <Link
      to={route}
      className="group/ticker block rounded-md transition hover:bg-accent/5"
    >
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  );
}

export function MarketSummaryPremium({ macro }: Props) {
  const items = TICKER_ORDER
    .map((k) => macro.find((m) => m.key === k))
    .filter((m): m is MacroIndicator => !!m);

  return (
    <div className="row-stagger overflow-hidden rounded-xl border border-accent/25 bg-bg-card/50">
      {items.length === 0 ? (
        <div className="py-4 text-center text-[11px] text-slate-500">Yükleniyor…</div>
      ) : (
        /* Grid + her hucrenin sag+alt hairline'i. Overflow-hidden konteyner
           en sag ve en alt kenarlari kirpar — gorsel olarak temiz izgara. */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 [&>*]:min-w-0 [&>*]:border-r [&>*]:border-b [&>*]:border-accent/10">
          {items.map((m) => <TickerCell key={m.key} m={m} />)}
        </div>
      )}
    </div>
  );
}
