import { Link } from 'react-router-dom';
import { ChevronRight, ExternalLink, Lock, Star, Zap } from 'lucide-react';
import { useAuth, isPro } from '@/store/auth';
import { ChartButton } from '@/components/domain/ChartButton';
import { AlertButton } from '@/components/domain/AlertButton';
import { NoteButton } from '@/components/domain/NoteButton';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TimeframeAnalysis } from '@/lib/multiTimeframe';
import type { ScalpRec } from './types';

export function ScalpCard({ rec, rank, watched, onToggle }: {
  rec: ScalpRec;
  rank: number;
  watched: boolean;
  onToggle: () => void;
}) {
  const user = useAuth((s) => s.user);
  const proUser = isPro(user);
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

      {/* Multi-timeframe trend — 1H açık, 4H/1D PRO */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <TfBox label="1 SAATLİK" ta={rec.trend1h} />
        {proUser ? <TfBox label="4 SAATLİK" ta={rec.trend4h} /> : <LockedTfBox label="4 SAATLİK" />}
        {proUser ? <TfBox label="GÜNLÜK" ta={rec.trend1d} /> : <LockedTfBox label="GÜNLÜK" />}
      </div>

      {/* Büyük Oyuncu Eğilimi — PRO */}
      {proUser ? (
        <div className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', leanColor)}>
          <div className="flex items-center justify-between">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Büyük Oyuncu Eğilimi</span>
            <span className="font-bold uppercase">
              {rec.bigPlayerLean === 'alıcı' ? '↑ ALICI BASKIN' : rec.bigPlayerLean === 'satıcı' ? '↓ SATICI BASKIN' : '↔ KARARSIZ'}
            </span>
          </div>
        </div>
      ) : (
        <Link
          to="/uyelik"
          className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning transition hover:bg-warning/15"
        >
          <span className="flex items-center gap-2">
            <Lock size={11} />
            <span className="font-semibold uppercase tracking-wider text-[10px]">Büyük Oyuncu Eğilimi</span>
          </span>
          <span className="font-bold uppercase">🔒 PRO</span>
        </Link>
      )}

      {/* Algoritmik Yorum — PRO */}
      {rec.verdict && (
        proUser ? (
          <div className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-300">
            <strong className="text-accent">Algoritmik Yorum: </strong>
            {rec.verdict}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-slate-400">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <Lock size={11} className="text-warning" />
                <strong className="text-warning">Algoritmik Yorum</strong> — 4H + Günlük + büyük oyuncu analizini içerir
              </span>
              <Link to="/uyelik" className="rounded-md bg-warning/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-warning hover:bg-warning/30">
                PRO'ya Geç →
              </Link>
            </div>
          </div>
        )
      )}

      {/* EMA Fiyatları — PRO */}
      {rec.emas.length > 0 && (
        proUser ? (
          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">EMA Fiyatları (günlük)</div>
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
        ) : (
          <Link to="/uyelik" className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning hover:bg-warning/10">
            <span className="flex items-center gap-1.5">
              <Lock size={11} />
              <span className="font-semibold uppercase tracking-wider text-[10px]">EMA Pozisyonları (Günlük)</span>
            </span>
            <span className="text-[10px] font-bold uppercase">🔒 PRO</span>
          </Link>
        )
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
        <NoteButton symbol={stock.symbol} hint={`${stock.symbol} — vur-kaç önerisi`} />
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

function LockedTfBox({ label }: { label: string }) {
  return (
    <Link
      to="/uyelik"
      className="group relative rounded border border-warning/30 bg-warning/5 p-2 text-center transition hover:bg-warning/10"
      title="PRO/ELITE üyelere özel — Yükselt"
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 flex items-center justify-center gap-1 text-sm font-bold text-warning">
        <Lock size={11} /> PRO
      </div>
      <div className="mt-0.5 text-[9px] text-warning/80 group-hover:underline">
        Yükselt →
      </div>
    </Link>
  );
}

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
