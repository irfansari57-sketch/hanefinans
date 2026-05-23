import { Link } from 'react-router-dom';
import type { MultiTimeframeResult, TimeframeAnalysis } from '@/lib/multiTimeframe';
import { macroKeyToRoute } from '@/lib/macroRoutes';
import { cn } from '@/lib/utils';

export function MultiTimeframeCard({ r }: { r: MultiTimeframeResult }) {
  const changeTone = r.changePct >= 0 ? 'text-success' : 'text-danger';
  const leanColor = r.bigPlayerLean === 'alıcı' ? 'border-success/40 bg-success/10 text-success'
    : r.bigPlayerLean === 'satıcı' ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-slate-500/40 bg-slate-500/10 text-slate-300';

  // Sembol etiketi zaten macroKey ile aynı (BIST 30 doğrudan eşleşir)
  const routeKey = r.symbol;
  const route = macroKeyToRoute(routeKey);

  return (
    <div className="group rounded-lg border border-border bg-bg-card p-4 transition hover:border-accent/40">
      {/* Üst — sembol + fiyat (sembol tıklanabilir, varsa detay sayfasına gider) */}
      <div className="flex items-baseline justify-between gap-3">
        {route ? (
          <Link to={route} className="text-base font-bold text-slate-100 hover:text-accent">
            {r.label} <span className="text-[10px] text-slate-500 group-hover:text-accent">↗</span>
          </Link>
        ) : (
          <h4 className="text-base font-bold text-slate-100">{r.label}</h4>
        )}
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">
            {r.price.toLocaleString('tr-TR', { maximumFractionDigits: r.price < 100 ? 2 : 0 })}
          </div>
          <div className={cn('text-sm tabular-nums', changeTone)}>
            {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Çoklu zaman dilimi yönleri */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <TimeframeBox label="1 SAATLİK" ta={r.tf1h} />
        <TimeframeBox label="4 SAATLİK" ta={r.tf4h} />
        <TimeframeBox label="GÜNLÜK" ta={r.tf1d} />
      </div>

      {/* Büyük oyuncu eğilimi */}
      <div className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', leanColor)}>
        <div className="flex items-center justify-between">
          <span className="font-semibold uppercase tracking-wider text-[10px]">Büyük Oyuncu Eğilimi</span>
          <span className="font-bold uppercase">
            {r.bigPlayerLean === 'alıcı' ? '↑ ALICI BASKIN' : r.bigPlayerLean === 'satıcı' ? '↓ SATICI BASKIN' : '↔ KARARSIZ'}
          </span>
        </div>
      </div>

      {/* Yorum */}
      <div className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-300">
        <strong className="text-accent">Yorum: </strong>
        {r.verdict}
      </div>
    </div>
  );
}

function TimeframeBox({ label, ta }: { label: string; ta: TimeframeAnalysis | null }) {
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
  const label2 = ta.trend === 'long' ? 'LONG ↑'
    : ta.trend === 'short' ? 'SHORT ↓'
    : 'NEUTRAL ↔';
  return (
    <div className={cn('rounded border p-2 text-center', bg)}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-sm font-bold', color)}>{label2}</div>
      <div className="mt-0.5 text-[9px] text-slate-500">
        {ta.emaScore}/{ta.emasAbove.length + ta.emasBelow.length} EMA üstte
      </div>
    </div>
  );
}
