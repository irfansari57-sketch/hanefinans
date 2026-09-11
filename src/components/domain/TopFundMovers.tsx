import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Star } from 'lucide-react';
import type { FundPerformance } from '@/data/types';
import { cn } from '@/lib/utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { fundsRepo } from '@/data/repositories';

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

export function TopFundMovers({ funds, limit = 10, period = 'day' }: Props) {
  // Sadece TEFAS'a acik fonlar — Serbest/kapali fonlar (SPK nitelikli yatirimci
  // fonlari) TopMovers'a sizmasin. FVT ile paralel: kullanicinin gercekten
  // alabilecegi fonlar arasindan enler.
  //
  // tefasOpen === undefined (heuristic bilinmiyor) durumunda dahil et:
  // backend cache eksikligi yuzunden yaygin fonlar elenmesin. Sadece kesin
  // false olanlari (Serbest fon) filtrele.
  const valid = funds.filter(
    (f) => Number.isFinite(f[period]) && f.tefasOpen !== false,
  );
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
  // Watchlist (Dexie funds tablosu) — reactive: kullanici star tikladi diyelim
  // hemen dolu/bosluk arasi geciyor
  const watched = useLiveQuery(() => fundsRepo.active(), []) ?? [];
  const watchedSet = new Set(watched.map((f) => f.code));

  const toggleWatch = async (e: React.MouseEvent, f: FundPerformance) => {
    e.preventDefault();
    e.stopPropagation();
    if (watchedSet.has(f.code)) {
      const entry = watched.find((w) => w.code === f.code);
      if (entry?.id != null) await fundsRepo.remove(entry.id);
    } else {
      await fundsRepo.add({ code: f.code, name: f.name, category: f.category });
    }
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
      {/* FVT tarzi kompakt fon satiri — rank badge + kod + isim (kucuk) + % + star */}
      <div className="divide-y divide-border/50">
        {funds.map((f, i) => {
          const v = f[period] as number;
          const sign = v >= 0 ? '+' : '';
          const stoneTone = v >= 0 ? 'text-success' : 'text-danger';
          const isWatched = watchedSet.has(f.code);
          const rankColor = i === 0 ? 'bg-warning/20 text-warning' : i === 1 ? 'bg-slate-500/20 text-slate-300' : i === 2 ? 'bg-orange-500/15 text-orange-400' : 'bg-bg-card text-slate-500';
          return (
            <Link
              to={`/fund/${f.code}`}
              key={f.code}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-bg-soft/70"
            >
              {/* Rank badge */}
              <span className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold tabular-nums',
                rankColor,
              )}>
                {i + 1}
              </span>
              {/* Kod + isim (2 satir, kompakt) */}
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[13px] font-semibold text-slate-100">{f.code}</div>
                {f.name && f.name !== f.code ? (
                  <div className="truncate text-[10px] text-slate-500">{f.name}</div>
                ) : f.category && f.category !== 'Serbest' ? (
                  <div className="truncate text-[10px] text-slate-500">{f.category}</div>
                ) : null}
              </div>
              {/* Yildiz */}
              <button
                type="button"
                onClick={(e) => toggleWatch(e, f)}
                title={isWatched ? 'Takipten cikar' : 'Takip listeme ekle'}
                className={cn(
                  'grid h-6 w-6 place-items-center rounded transition',
                  isWatched
                    ? 'text-warning hover:text-warning/70'
                    : 'text-slate-500 hover:text-warning',
                )}
                aria-label={isWatched ? 'Takipten cikar' : 'Takip listeme ekle'}
              >
                <Star size={12} fill={isWatched ? 'currentColor' : 'none'} />
              </button>
              {/* Change % */}
              <span className={cn('w-[68px] text-right text-[13px] font-semibold tabular-nums', stoneTone)}>
                {sign}{v.toFixed(2)}%
              </span>
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
