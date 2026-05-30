import { Link } from 'react-router-dom';
import type { Stock } from '@/data/types';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

interface TickerProps {
  stocks: Stock[];
  /** Kaydırma hızı saniye cinsinden (tek tur). */
  speed?: number;
}

export function Ticker({ stocks, speed = 80 }: TickerProps) {
  if (!stocks.length) return null;
  // Ardarda iki kere koyarız ki sonsuz dön gibi gözüksün
  const repeated = [...stocks, ...stocks];

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-gradient-to-r from-bg-soft via-bg-card to-bg-soft">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-bg-soft to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-bg-soft to-transparent" />
      <div
        className="ticker-track flex items-center gap-6 py-2.5"
        style={{ animationDuration: `${speed}s` }}
      >
        {repeated.map((s, i) => {
          const tone = s.changePct >= 0 ? 'text-success' : 'text-danger';
          const sign = s.changePct >= 0 ? '+' : '';
          const arrow = s.changePct >= 0 ? '▲' : '▼';
          return (
            <Link
              to={`/stock/${s.symbol}`}
              key={`${s.symbol}-${i}`}
              className="group inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-0.5 text-xs hover:bg-bg-card rounded transition-colors"
            >
              <span className="font-mono font-semibold text-accent group-hover:underline">{s.symbol}</span>
              <span className="tabular-nums text-slate-200">{formatMoney(s.price)}</span>
              <span className={cn('tabular-nums', tone)}>
                {arrow} {sign}{s.changePct.toFixed(2)}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
