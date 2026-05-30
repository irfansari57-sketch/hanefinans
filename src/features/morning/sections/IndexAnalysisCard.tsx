import { cn } from '@/lib/utils';
import type { IndexTA } from './types';

/**
 * BIST 100 / BIST 30 indeks teknik analiz kartı.
 * Destek/direnç + RSI + MACD + Bollinger + ADX + yorum.
 * Şu anda JSX'te bağlı değil — gelecekte sayfaya geri eklenebilir.
 */
export function IndexAnalysisCard({ ta }: { ta: IndexTA }) {
  const trendTone = ta.trend === 'yukarı' ? 'text-success' : ta.trend === 'aşağı' ? 'text-danger' : 'text-slate-400';
  const trendBg = ta.trend === 'yukarı' ? 'bg-success/15 border-success/30' : ta.trend === 'aşağı' ? 'bg-danger/15 border-danger/30' : 'bg-slate-500/15 border-slate-500/30';
  const trendArrow = ta.trend === 'yukarı' ? '↑' : ta.trend === 'aşağı' ? '↓' : '→';
  const changeTone = ta.changePct >= 0 ? 'text-success' : 'text-danger';

  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      {/* Başlık */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-bold text-slate-100">{ta.label}</h4>
          <div className={cn('mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', trendBg, trendTone)}>
            {trendArrow} Kısa vade {ta.trend}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">
            {ta.price.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
          </div>
          <div className={cn('text-sm tabular-nums', changeTone)}>
            {ta.changePct >= 0 ? '+' : ''}{ta.changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Destek / Direnç */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded border border-danger/30 bg-danger/5 p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-danger">Direnç</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-100">
            {ta.resistance != null ? ta.resistance.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : '—'}
          </div>
          {ta.resistancePct != null && (
            <div className="mt-0.5 text-[10px] text-slate-400">
              %{Math.abs(ta.resistancePct).toFixed(2)} {ta.resistancePct > 0 ? 'uzakta ↑' : 'aşıldı'}
            </div>
          )}
        </div>
        <div className="rounded border border-success/30 bg-success/5 p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-success">Destek</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-100">
            {ta.support != null ? ta.support.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : '—'}
          </div>
          {ta.supportPct != null && (
            <div className="mt-0.5 text-[10px] text-slate-400">
              %{Math.abs(ta.supportPct).toFixed(2)} {ta.supportPct > 0 ? 'uzakta ↓' : 'kırıldı'}
            </div>
          )}
        </div>
      </div>

      {/* İndikatörler */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded bg-bg-soft px-2 py-1.5">
          <span className="text-slate-500">RSI:</span>{' '}
          <strong className={cn(
            'tabular-nums',
            (ta.rsi ?? 0) >= 70 ? 'text-warning' :
            (ta.rsi ?? 0) <= 30 ? 'text-success' : 'text-slate-200',
          )}>
            {ta.rsi != null ? ta.rsi.toFixed(1) : '—'}
          </strong>
          {ta.rsiNote && <span className="ml-1 text-slate-500">({ta.rsiNote})</span>}
        </div>
        <div className="rounded bg-bg-soft px-2 py-1.5">
          <span className="text-slate-500">MACD:</span>{' '}
          {ta.macdBullish ? (
            <strong className="text-success">Bullish ✓</strong>
          ) : ta.macdBearish ? (
            <strong className="text-danger">Bearish ✗</strong>
          ) : (
            <strong className="text-slate-400">Nötr</strong>
          )}
        </div>
        <div className="rounded bg-bg-soft px-2 py-1.5">
          <span className="text-slate-500">Bollinger:</span>{' '}
          <strong className="text-slate-300">{ta.bollingerLabel}</strong>
        </div>
        <div className="rounded bg-bg-soft px-2 py-1.5">
          <span className="text-slate-500">ADX:</span>{' '}
          <strong className="text-slate-300">{ta.adxLabel}</strong>
        </div>
      </div>

      {/* Yorum */}
      <div className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-300">
        <strong className="text-accent">Yorum: </strong>
        {ta.verdict}
      </div>
    </div>
  );
}
