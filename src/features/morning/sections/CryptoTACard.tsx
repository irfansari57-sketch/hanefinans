import { cn } from '@/lib/utils';
import type { CryptoTA } from './types';

/**
 * Kripto teknik analiz kartı (BTC/ETH/BNB).
 * Şu anda JSX'te bağlı değil — gelecekte sayfaya geri eklenebilir.
 */
export function CryptoTACard({ ta }: { ta: CryptoTA }) {
  const tone = ta.change24h >= 0 ? 'text-success' : 'text-danger';
  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between">
        <h5 className="text-base font-semibold">
          <span className="font-mono text-warning">{ta.symbol}</span>
          <span className="ml-2 text-slate-400 text-sm">({ta.name})</span>
        </h5>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">
            ${ta.priceUsd.toLocaleString('en-US', { maximumFractionDigits: ta.priceUsd < 10 ? 4 : 0 })}
          </div>
          <div className={cn('text-sm tabular-nums', tone)}>
            {ta.change24h >= 0 ? '+' : ''}{ta.change24h.toFixed(2)}%
          </div>
        </div>
      </div>
      <ul className="mt-3 grid gap-1.5 text-xs text-slate-300 sm:grid-cols-2">
        <li>
          <strong>Gün içi aralık:</strong> ${ta.rangeLow.toFixed(ta.priceUsd < 10 ? 4 : 0)} – ${ta.rangeHigh.toFixed(ta.priceUsd < 10 ? 4 : 0)}
        </li>
        <li>
          <strong>RSI:</strong> {Number.isFinite(ta.rsi) ? ta.rsi.toFixed(1) : '—'} <span className="text-slate-500">({ta.rsiNote})</span>
        </li>
        <li>
          <strong>MACD:</strong>{' '}
          {ta.macdBullish ? <span className="text-success">Bullish crossover ✅</span>
            : ta.macdBearish ? <span className="text-danger">Bearish crossover ⚠️</span>
            : <span className="text-slate-400">nötr</span>}
        </li>
        <li>
          <strong>Bollinger:</strong> <span className="text-slate-400">{ta.bollingerLabel}</span>
        </li>
        <li>
          <strong>ADX:</strong> {ta.adxLabel}{' '}
          {ta.adxBullish == null ? '' : ta.adxBullish ? <span className="text-success">(+DI &gt; -DI)</span> : <span className="text-danger">(-DI &gt; +DI)</span>}
        </li>
        <li>
          <strong>Kritik direnç:</strong> ${ta.resistance.toFixed(ta.priceUsd < 10 ? 4 : 0)} <span className="text-slate-500">(%{ta.resistancePct.toFixed(1)} uzakta)</span>
        </li>
        <li className="sm:col-span-2">
          <strong>Kritik destek:</strong> ${ta.support.toFixed(ta.priceUsd < 10 ? 4 : 0)} <span className="text-slate-500">(%{ta.supportPct.toFixed(1)} uzakta)</span>
        </li>
      </ul>
    </div>
  );
}
