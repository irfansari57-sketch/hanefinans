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

export function TopMovers({ stocks, limit = 5, period = 'day' }: TopMoversProps) {
  // BIST günlük fiyat tavanı %10 — outlier eşik ±%11 (küçük tolerans için).
  // Bunun üstündeki değerler bölünme/sermaye artırım/kupon kesintisi sonrası oluşan yanıltıcı
  // değişimlerdir; TopMovers listelerine sızmasınlar. Haftalık/aylık'ta bileşik olabilir → ±%40.
  // NOT: Ticker (PanelPage) da aynı %11 kuralını uyguluyor — tek kaynak eşik burada.
  const OUTLIER_CAP = period === 'day' ? 11 : 40;
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
      <div className="divide-y divide-border">
        {stocks.map((s, i) => {
          const sign = s.changePct >= 0 ? '+' : '';
          const stoneTone = s.changePct >= 0 ? 'text-success' : 'text-danger';
          return (
            <Link
              to={`/stock/${s.symbol}`}
              key={s.symbol}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-bg-soft"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-4 text-[11px] text-slate-500">{i + 1}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-accent">{s.symbol}</span>
                  </div>
                  <div className="truncate text-xs text-slate-400">{s.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium tabular-nums">{formatMoney(s.price)}</div>
                <div className={cn('text-xs tabular-nums', stoneTone)}>
                  {sign}
                  {s.changePct.toFixed(2)}%
                </div>
              </div>
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
