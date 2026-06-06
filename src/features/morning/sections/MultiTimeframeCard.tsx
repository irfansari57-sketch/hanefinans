import { Link } from 'react-router-dom';
import type { MultiTimeframeResult, TimeframeAnalysis } from '@/lib/multiTimeframe';
import { macroKeyToRoute } from '@/lib/macroRoutes';
import { cn } from '@/lib/utils';

export function MultiTimeframeCard({ r }: { r: MultiTimeframeResult }) {
  const changeTone = r.changePct >= 0 ? 'text-success' : 'text-danger';

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

      {/* Sadece Günlük MA analizi — sade ve odakli */}
      <div className="mt-4">
        <DailyMaBox ta={r.tf1d} price={r.price} />
      </div>

      {/* Yorum */}
      <div className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-300">
        <strong className="text-accent">Yorum: </strong>
        {r.verdict}
      </div>
    </div>
  );
}

/**
 * Sade Günlük MA analizi — fiyatın MA 5/8/13 ile pozisyonunu net göster.
 * 3'ü de üstündeyse "Güçlü Yukarı Trend", 3'ü de altındaysa "Güçlü Aşağı Trend".
 */
function DailyMaBox({ ta, price }: { ta: TimeframeAnalysis | null; price?: number }) {
  if (!ta || !Number.isFinite(price)) {
    return (
      <div className="rounded border border-border bg-bg-soft p-3 text-center text-xs text-slate-500">
        Günlük MA verisi yok
      </div>
    );
  }
  const ma5 = ta.emaValues?.[5];
  const ma8 = ta.emaValues?.[8];
  const ma13 = ta.emaValues?.[13];
  const fmt = (v: number | undefined) => Number.isFinite(v)
    ? (v as number).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const above = (v: number | undefined) =>
    Number.isFinite(v) && (price as number) > (v as number);
  const a5 = above(ma5);
  const a8 = above(ma8);
  const a13 = above(ma13);
  const aboveCount = [a5, a8, a13].filter(Boolean).length;

  const verdict =
    aboveCount === 3 ? { label: 'GÜÇLÜ YUKARI TREND', cls: 'bg-success/20 text-success border-success/40' }
    : aboveCount === 0 ? { label: 'GÜÇLÜ AŞAĞI TREND', cls: 'bg-danger/20 text-danger border-danger/40' }
    : aboveCount === 2 ? { label: 'YUKARI EĞİLİM (karışık)', cls: 'bg-success/10 text-success border-success/30' }
    : { label: 'AŞAĞI EĞİLİM (karışık)', cls: 'bg-danger/10 text-danger border-danger/30' };

  const Row = ({ name, val, isAbove }: { name: string; val: number | undefined; isAbove: boolean }) => (
    <div className={cn(
      'flex items-center justify-between rounded px-3 py-2 text-sm',
      isAbove ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
    )}>
      <span className="font-semibold">{name}: {fmt(val)}</span>
      <span className="font-bold tabular-nums">
        Fiyat {isAbove ? 'ÜSTÜNDE ↑' : 'ALTINDA ↓'}
      </span>
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-bg-soft p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Günlük EMA Analizi</div>
        <div className={cn('rounded border px-2 py-0.5 text-[10px] font-bold', verdict.cls)}>
          {verdict.label}
        </div>
      </div>
      <div className="space-y-1.5">
        <Row name="EMA 5" val={ma5} isAbove={a5} />
        <Row name="EMA 8" val={ma8} isAbove={a8} />
        <Row name="EMA 13" val={ma13} isAbove={a13} />
      </div>
    </div>
  );
}
