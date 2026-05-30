import { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Stock } from '@/data/types';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { useWatchlist } from '@/store/watchlist';
import { AlertButton } from './AlertButton';
import { NoteButton } from './NoteButton';
import { ChartButton } from './ChartButton';

interface StockRowProps {
  stock: Stock;
  showWatch?: boolean;
  showActions?: boolean;
  linkToDetail?: boolean;
}

/** Fiyat değişikliğinde 0.9 saniyelik flash sınıfı üretir. */
function usePriceFlash(price: number): string {
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState<'' | 'flash-up' | 'flash-down'>('');
  useEffect(() => {
    if (prev.current != null && prev.current !== price) {
      setFlash(price > prev.current ? 'flash-up' : 'flash-down');
      const t = setTimeout(() => setFlash(''), 1000);
      return () => clearTimeout(t);
    }
    prev.current = price;
  }, [price]);
  return flash;
}

export function StockRow({ stock, showWatch = false, showActions = false, linkToDetail = true }: StockRowProps) {
  const has = useWatchlist((s) => s.has(stock.symbol));
  const toggle = useWatchlist((s) => s.toggle);
  const tone = stock.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = stock.changePct >= 0 ? '+' : '';
  const flash = usePriceFlash(stock.price);

  const inner = (
    <div className={cn('flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-bg-card', flash)}>
      <div className="min-w-0 flex items-center gap-3">
        {showWatch && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle(stock.symbol);
            }}
            className={cn('shrink-0 rounded p-1', has ? 'text-warning' : 'text-slate-500 hover:text-slate-300')}
            aria-label="Takip et"
          >
            <Star size={14} fill={has ? 'currentColor' : 'none'} />
          </button>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-accent">{stock.symbol}</span>
            <span className="hidden truncate text-xs text-slate-500 sm:inline">{stock.sector}</span>
          </div>
          <div className="truncate text-xs text-slate-400">{stock.name}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {showActions && (
          <div
            className="flex items-center gap-0.5"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <ChartButton symbol={stock.symbol} name={stock.name} />
            <AlertButton stock={stock} />
            <NoteButton symbol={stock.symbol} hint={`${stock.name} hakkında not`} />
          </div>
        )}
        <div className="text-right tabular-nums">
          <div className="text-sm font-medium text-slate-100">{formatMoney(stock.price)}</div>
          <div className={cn('text-xs', tone)}>
            {sign}
            {stock.changePct.toFixed(2)}%
          </div>
        </div>
      </div>
    </div>
  );

  if (linkToDetail) {
    return (
      <Link to={`/stock/${stock.symbol}`} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
