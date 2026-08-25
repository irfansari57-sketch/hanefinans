import { Link } from 'react-router-dom';
import { ChevronRight, ExternalLink, Star, Zap } from 'lucide-react';
import { ChartButton } from '@/components/domain/ChartButton';
import { AlertButton } from '@/components/domain/AlertButton';
import { NoteButton } from '@/components/domain/NoteButton';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TimeframeAnalysis } from '@/lib/multiTimeframe';
import type { ScalpRec } from './types';

// Kullanıcı talebi ile PRO kilitleri kaldırıldı — TF, Büyük Oyuncu, Yorum, EMA herkese açık.
export function ScalpCard({ rec, rank, watched, onToggle }: {
  rec: ScalpRec;
  rank: number;
  watched: boolean;
  onToggle: () => void;
}) {
  const { stock } = rec;
  const tone = stock.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = stock.changePct >= 0 ? '+' : '';
  const leanColor = rec.bigPlayerLean === 'alıcı' ? 'border-success/40 bg-success/10 text-success'
    : rec.bigPlayerLean === 'satıcı' ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-slate-500/40 bg-slate-500/10 text-slate-300';

  return (
    <div className="glass-card p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-lg border font-bold text-sm',
            rec.scalp5mLong ? 'border-success/40 bg-success/10 text-success' : 'border-accent/30 bg-accent/10 text-accent',
          )}>
            #{rank}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={`/stock/${stock.symbol}`} className="font-mono text-lg font-bold text-accent hover:underline">
                {stock.symbol}
              </Link>
              {stock.sector && (
                <span className="rounded border border-border bg-bg-soft px-1.5 py-0.5 text-[10px] text-slate-400">
                  {stock.sector}
                </span>
              )}
              {rec.scalp5mLong && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                  <Zap size={9} /> 5dk LONG
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-300">{stock.name}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">{formatMoney(stock.price)}</div>
          <div className={cn('text-base font-semibold tabular-nums', tone)}>
            {sign}{stock.changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Multi-timeframe trend — artık tamamı herkese açık */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <TfBox label="1 SAATLİK" ta={rec.trend1h} />
        <TfBox label="4 SAATLİK" ta={rec.trend4h} />
        <TfBox label="GÜNLÜK" ta={rec.trend1d} />
      </div>

      {/* Büyük Oyuncu Eğilimi — artık herkese açık */}
      <div className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', leanColor)}>
        <div className="flex items-center justify-between">
          <span className="font-semibold uppercase tracking-wider text-[10px]">Büyük Oyuncu Eğilimi</span>
          <span className="font-bold uppercase">
            {rec.bigPlayerLean === 'alıcı' ? '↑ ALICI BASKIN' : rec.bigPlayerLean === 'satıcı' ? '↓ SATICI BASKIN' : '↔ KARARSIZ'}
          </span>
        </div>
      </div>

      {/* Algoritmik Yorum — artık herkese açık */}
      {rec.verdict && (
        <div className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-300">
          <strong className="text-accent">Algoritmik Yorum: </strong>
          {rec.verdict}
        </div>
      )}

      {/* EMA Fiyatları — artık herkese açık (sadece detay) */}
      {rec.emas.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">EMA Fiyatları (günlük) — kısa vade momentum nüansı</div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {rec.emas.map((e) => {
              const above = stock.price >= e.value;
              return (
                <div key={e.period} className={cn(
                  'rounded border px-2 py-1 text-center',
                  above ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5',
                )}>
                  <div className="text-[9px] text-slate-500">EMA {e.period}</div>
                  <div className={cn('text-xs font-bold tabular-nums', above ? 'text-success' : 'text-danger')}>
                    {formatMoney(e.value)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link to={`/stock/${stock.symbol}`} className="btn-primary">
          Detay <ChevronRight size={14} />
        </Link>
        <button
          onClick={onToggle}
          className={cn('btn-secondary', watched && 'border-warning/40 bg-warning/10 text-warning')}
        >
          <Star size={14} fill={watched ? 'currentColor' : 'none'} /> {watched ? 'Takipte' : 'Takip et'}
        </button>
        <ChartButton symbol={stock.symbol} name={stock.name} />
        <AlertButton stock={stock} />
        <NoteButton symbol={stock.symbol} hint={`${stock.symbol} — vur-kaç sinyali`} />
        <a
          href={`https://www.tradingview.com/chart/?symbol=BIST:${stock.symbol}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2.5 py-1.5 text-xs text-slate-300 hover:text-accent"
        >
          TradingView <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

// LockedTfBox kaldırıldı — TF kutuları artık herkese açık.

function TfBox({ label, ta }: { label: string; ta: TimeframeAnalysis | null }) {
  if (!ta) {
    return (
      <div className="rounded border border-border bg-bg-soft p-2 text-center">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="mt-1 text-xs font-bold text-slate-500">—</div>
      </div>
    );
  }
  const bg = ta.trend === 'long' ? 'border-success/40 bg-success/10'
    : ta.trend === 'short' ? 'border-danger/40 bg-danger/10'
    : 'border-slate-500/40 bg-slate-500/10';
  const color = ta.trend === 'long' ? 'text-success'
    : ta.trend === 'short' ? 'text-danger'
    : 'text-slate-400';
  const txt = ta.trend === 'long' ? 'LONG ↑'
    : ta.trend === 'short' ? 'SHORT ↓'
    : 'NEUTRAL';
  return (
    <div className={cn('rounded border p-2 text-center', bg)}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-sm font-bold', color)}>{txt}</div>
    </div>
  );
}
