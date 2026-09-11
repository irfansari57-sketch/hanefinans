import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Stock } from '@/data/types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

type Period = 'day' | 'week' | 'month';

interface TopMoversProps {
  stocks: Stock[];
  limit?: number;
  period?: Period;
}

const PERIOD_LABEL: Record<Period, string> = {
  day: 'Bugün',
  week: '1 Hafta',
  month: '1 Ay',
};

export function TopMovers({ stocks, limit = 10, period = 'day' }: TopMoversProps) {
  // BIST günlük fiyat tavanı ±%10.00. Bunun üstü imkansız — bölünme/sermaye
  // artırım/kupon kesintisi sonrası Yahoo previousClose bug'i (Paket F ile
  // Is Yatirim override devrede, ama outlier hala gelirse burada kes).
  // ±%10.05 hafif yuvarlama toleransı. Haftalık/aylık bileşik → ±%40.
  const OUTLIER_CAP = period === 'day' ? 10.05 : 40;
  // Yahoo veri dönmeyen hisseler (price=0 veya changePct=0 yani mock fallback) elensin —
  // sadece gerçekten hareket eden hisseleri göster + outlier filter
  const sorted = stocks
    .filter(
      (s) =>
        Number.isFinite(s.changePct) &&
        s.price > 0 &&
        s.changePct !== 0 &&
        Math.abs(s.changePct) <= OUTLIER_CAP,
    )
    .sort((a, b) => b.changePct - a.changePct);
  const top = sorted.slice(0, limit);
  const bottom = sorted.slice(-limit).reverse();

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <MoverList title="En Çok Yükselenler" subtitle={PERIOD_LABEL[period]} icon={TrendingUp} stocks={top} tone="success" />
      <MoverList title="En Çok Düşenler" subtitle={PERIOD_LABEL[period]} icon={TrendingDown} stocks={bottom} tone="danger" />
    </div>
  );
}

function MoverList({
  title,
  subtitle,
  icon: Icon,
  stocks,
  tone,
}: {
  title: string;
  subtitle: string;
  icon: typeof TrendingUp;
  stocks: Stock[];
  tone: 'success' | 'danger';
}) {
  const tones = {
    success: 'text-success bg-success/10',
    danger: 'text-danger bg-danger/10',
  };
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
          <span className={cn('grid h-6 w-6 place-items-center rounded-md', tones[tone])}>
            <Icon size={12} />
          </span>
          {title}
        </h3>
        <span className="text-[10px] text-slate-500">{subtitle}</span>
      </div>
      {/* FVT tarzi kompakt satir — no logo, no name, sadece rank badge + symbol + price + % */}
      <div className="divide-y divide-border/50">
        {stocks.map((s, i) => {
          const sign = s.changePct >= 0 ? '+' : '';
          const stoneTone = s.changePct >= 0 ? 'text-success' : 'text-danger';
          const rankColor = i === 0 ? 'bg-warning/20 text-warning' : i === 1 ? 'bg-slate-500/20 text-slate-300' : i === 2 ? 'bg-orange-500/15 text-orange-400' : 'bg-bg-card text-slate-500';
          return (
            <Link
              to={`/stock/${s.symbol}`}
              key={s.symbol}
              className="flex items-center gap-3 px-3 py-2 hover:bg-bg-soft/70"
            >
              {/* Rank badge — top 3 renkli */}
              <span className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold tabular-nums',
                rankColor,
              )}>
                {i + 1}
              </span>
              {/* Symbol — buyuk, bold */}
              <span className="min-w-0 flex-1 font-mono text-[13px] font-semibold text-slate-100 truncate">
                {s.symbol}
              </span>
              {/* Price */}
              <span className="text-[13px] font-medium tabular-nums text-slate-200">
                {formatMoney(s.price)}
              </span>
              {/* Change % */}
              <span className={cn('w-[68px] text-right text-[13px] font-semibold tabular-nums', stoneTone)}>
                {sign}{s.changePct.toFixed(2)}%
              </span>
            </Link>
          );
        })}
        {stocks.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-slate-500">Veri yok.</div>
        )}
      </div>
    </div>
  );
}
