import { Link } from 'react-router-dom';
import type { MacroIndicator } from '@/data/types';
import { macroKeyToRoute } from '@/lib/macroRoutes';
import { cn } from '@/lib/utils';

/**
 * FT SALMON KATEGORI KARTLI — Panel Piyasa Ozeti (VARYANT A).
 * Onceki: kompakt 5x2 grid ticker — kategori kaybolmustu + yon belirsizdi.
 * Simdi: 3 dikey sutun (Endeks & Doviz / Metal / Kripto), her satirda
 * sol renk seridi (yesil/kirmizi/notr) yon vurgusu. Kategoriler ayrilmis,
 * kullanicinin talebi.
 */

interface Props {
  macro: MacroIndicator[];
}

// Kategori tanimi — 3 sutun icin uygun gruplama.
type CategoryKey = 'endeksDoviz' | 'metal' | 'kripto';
interface Category {
  key: CategoryKey;
  title: string;
  symbols: string[];
}

const CATEGORIES: Category[] = [
  { key: 'endeksDoviz', title: 'Endeks & Döviz', symbols: ['BIST 100', 'BIST 30', 'USD/TRY', 'EUR/TRY'] },
  { key: 'metal',        title: 'Metal',           symbols: ['Gram Altın', 'Ons Altın', 'Gram Gümüş', 'Ons Gümüş'] },
  { key: 'kripto',       title: 'Kripto',          symbols: ['BTC/USD', 'ETH/USD', 'XRP/USD', 'SOL/USD'] },
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

/**
 * Kategori karti icinde tek sembol satiri.
 * Sol renk seridi + arka plan tint yon (yesil/kirmizi/notr) belirtir.
 * Yatay ok isareti (▲/▼/—) ve boyutu buyutulmus % ile yon vurgusu.
 */
function TickerRow({ m }: { m: MacroIndicator }) {
  const route = macroKeyToRoute(m.key);
  const cp = m.changePct;
  const isFinitePct = cp != null && Number.isFinite(cp);
  const isUp = isFinitePct && (cp as number) > 0;
  const isDown = isFinitePct && (cp as number) < 0;
  const isNeutral = isFinitePct && (cp as number) === 0;
  const arrow = isUp ? '▲' : isDown ? '▼' : '—';
  const pct = isFinitePct ? (cp as number).toFixed(2) : '—';
  const sign = isUp ? '+' : isDown ? '' : '';

  const content = (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border-l-[3px] px-2.5 py-2 transition',
        isUp && 'border-l-success bg-success/10 hover:bg-success/15',
        isDown && 'border-l-danger bg-danger/10 hover:bg-danger/15',
        isNeutral && 'border-l-slate-500 bg-slate-500/10 hover:bg-slate-500/15',
        !isFinitePct && 'border-l-slate-600 bg-bg-card/40',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
          {m.label}
        </div>
        <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100 truncate">
          {formatValue(m)}
        </div>
      </div>
      {isFinitePct && (
        <div
          className={cn(
            'shrink-0 flex flex-col items-end leading-tight font-semibold tabular-nums font-sans',
            isUp && 'text-success',
            isDown && 'text-danger',
            isNeutral && 'text-slate-500',
          )}
        >
          <span className="text-[11px]">{arrow}</span>
          <span className="text-xs">{sign}{pct}%</span>
        </div>
      )}
    </div>
  );

  return route ? (
    <Link to={route} className="block">
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  );
}

export function MarketSummaryPremium({ macro }: Props) {
  const anyData = macro.length > 0;
  return (
    <div className="row-stagger overflow-hidden rounded-xl border border-accent/25 bg-bg-card/50 p-3">
      {!anyData ? (
        <div className="py-4 text-center text-[11px] text-slate-500">Yükleniyor…</div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => {
            const items = cat.symbols
              .map((sym) => macro.find((m) => m.key === sym))
              .filter((m): m is MacroIndicator => !!m);
            if (items.length === 0) return null;
            return (
              <div key={cat.key} className="min-w-0">
                <div className="mb-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-accent/25">
                  {cat.title}
                </div>
                <div className="flex flex-col gap-1.5">
                  {items.map((m) => <TickerRow key={m.key} m={m} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
