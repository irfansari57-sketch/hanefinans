import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, PiggyBank } from 'lucide-react';
import type { FundPerformance } from '@/data/types';
import { cn } from '@/lib/utils';

interface Props {
  funds: FundPerformance[];
  limit?: number;
  /** Hangi periyot baz alınacak — varsayılan: gün */
  period?: 'day' | 'week' | 'month' | 'ytd' | 'year';
}

const PERIOD_LABEL: Record<NonNullable<Props['period']>, string> = {
  day: 'Bugün',
  week: '1 Hafta',
  month: '1 Ay',
  ytd: 'YTD',
  year: '1 Yıl',
};

export function TopFundMovers({ funds, limit = 5, period = 'day' }: Props) {
  const valid = funds.filter((f) => Number.isFinite(f[period]));
  const sorted = [...valid].sort((a, b) => (b[period] as number) - (a[period] as number));
  const top = sorted.slice(0, limit);
  const bottom = sorted.slice(-limit).reverse();

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <FundMoverList title={`En Çok Yükselen Fonlar`} subtitle={PERIOD_LABEL[period]} icon={TrendingUp} funds={top} period={period} tone="success" />
      <FundMoverList title={`En Çok Düşen Fonlar`} subtitle={PERIOD_LABEL[period]} icon={TrendingDown} funds={bottom} period={period} tone="danger" />
    </div>
  );
}

function FundMoverList({
  title, subtitle, icon: Icon, funds, period, tone,
}: {
  title: string;
  subtitle: string;
  icon: typeof TrendingUp;
  funds: FundPerformance[];
  period: NonNullable<Props['period']>;
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
      <div className="divide-y divide-border">
        {funds.map((f, i) => {
          const v = f[period] as number;
          const sign = v >= 0 ? '+' : '';
          const stoneTone = v >= 0 ? 'text-success' : 'text-danger';
          return (
            <Link
              to={`/fund/${f.code}`}
              key={f.code}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-bg-soft"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-4 text-[11px] text-slate-500">{i + 1}</span>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-warning/15 text-warning">
                  <PiggyBank size={11} />
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-xs text-accent">{f.code}</div>
                  {/* Fon adı varsa (kod ile farklıysa) göster; yoksa kategori; ikisi de yoksa boş */}
                  {f.name && f.name !== f.code && (
                    <div className="truncate text-[10px] text-slate-500 max-w-[200px]">{f.name}</div>
                  )}
                  {(!f.name || f.name === f.code) && f.category && f.category !== 'Serbest' && (
                    <div className="truncate text-[10px] text-slate-500 max-w-[200px]">{f.category}</div>
                  )}
                </div>
              </div>
              <div className={cn('text-sm font-semibold tabular-nums', stoneTone)}>
                {sign}
                {v.toFixed(2)}%
              </div>
            </Link>
          );
        })}
        {funds.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-slate-500">Veri yok.</div>
        )}
      </div>
    </div>
  );
}
