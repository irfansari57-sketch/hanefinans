import { cn } from '@/lib/utils';
import type { ScalpRec, ScalpTf } from './types';
import { isLongForTf, tfLabel } from './scalpHelpers';

export function ScalpPoolStats({ recs, selectedTf }: { recs: ScalpRec[]; selectedTf: ScalpTf }) {
  const total = recs.length;
  const scalpLong = recs.filter((r) => isLongForTf(r, selectedTf)).length;
  const avgChange = total > 0 ? recs.reduce((s, r) => s + r.stock.changePct, 0) / total : 0;
  const alici = recs.filter((r) => r.bigPlayerLean === 'alıcı').length;
  const satici = recs.filter((r) => r.bigPlayerLean === 'satıcı').length;
  const kararsiz = total - alici - satici;
  const positiveCount = recs.filter((r) => r.stock.changePct > 0).length;
  const hitRate = total > 0 ? (positiveCount / total) * 100 : 0;
  const topSymbol = recs[0]?.stock.symbol;
  const topChange = recs[0]?.stock.changePct ?? 0;

  return (
    <div className="card mb-3 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <PoolStatBox label="Toplam" value={`${total}`} tone="slate" />
        <PoolStatBox label={`${tfLabel(selectedTf)} Long`} value={`${scalpLong}/${total}`} tone="success" />
        <PoolStatBox label="Ort. Degisim" value={`${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`} tone={avgChange >= 0 ? 'success' : 'danger'} />
        <PoolStatBox label="Pozitif Oran" value={`%${hitRate.toFixed(0)}`} tone="accent" />
        <PoolStatBox label="Alici/Satici" value={`${alici} / ${satici}`} sub={`${kararsiz} kararsiz`} tone="warning" />
        <PoolStatBox label="Lider" value={topSymbol ?? '-'} sub={topChange ? `${topChange >= 0 ? '+' : ''}${topChange.toFixed(2)}%` : undefined} tone={topChange >= 0 ? 'success' : 'danger'} />
      </div>
    </div>
  );
}

function PoolStatBox({ label, value, sub, tone }: {
  label: string;
  value: string;
  sub?: string;
  tone: 'slate' | 'success' | 'danger' | 'accent' | 'warning';
}) {
  const colorClass = tone === 'success' ? 'text-success'
    : tone === 'danger' ? 'text-danger'
    : tone === 'accent' ? 'text-accent'
    : tone === 'warning' ? 'text-warning'
    : 'text-slate-100';
  return (
    <div className="rounded-lg border border-border bg-bg-soft px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-0.5 text-base font-bold tabular-nums leading-tight', colorClass)}>{value}</div>
      {sub && <div className="text-[9px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
