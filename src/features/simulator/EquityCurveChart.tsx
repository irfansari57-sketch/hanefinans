/**
 * EquityCurveChart — SVG çoklu-seri çizgi grafik.
 * Portföyünüz + seçili benchmarks aynı grafikte overlay.
 *
 * Interaction: mouse hover ile crosshair + tooltip (tüm serilerin o gündeki değeri).
 * Responsive: viewBox ile ölçeklenir; overflow yok.
 */

import { useMemo, useState, useRef } from 'react';
import { formatDateTR } from '@/lib/date';
import { cn } from '@/lib/utils';

export interface Series {
  id: string;
  label: string;
  color: string;
  /** ynormalize edilmis (initial capital baz) equity curve */
  points: Array<{ date: string; value: number }>;
  isPortfolio?: boolean;
}

interface Props {
  series: Series[];
  initialCapital: number;
  /** Grafik yüksekligi px */
  height?: number;
}

const PADDING = { top: 12, right: 12, bottom: 28, left: 60 };

export function EquityCurveChart({ series, initialCapital, height = 320 }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    () => new Set(series.map((s) => s.id)),
  );
  const svgRef = useRef<SVGSVGElement | null>(null);

  const visible = series.filter((s) => visibleIds.has(s.id));

  // Portfoy serisi tum tarihleri belirler — benchmarks o tarihlere hizalanmaz,
  // her seri kendi datesine gore render edilir.
  const allDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of visible) for (const p of s.points) set.add(p.date);
    return Array.from(set).sort();
  }, [visible]);

  const { minV, maxV } = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    for (const s of visible) {
      for (const p of s.points) {
        if (p.value < mn) mn = p.value;
        if (p.value > mx) mx = p.value;
      }
    }
    if (!Number.isFinite(mn)) mn = initialCapital * 0.9;
    if (!Number.isFinite(mx)) mx = initialCapital * 1.1;
    const pad = (mx - mn) * 0.05;
    return { minV: mn - pad, maxV: mx + pad };
  }, [visible, initialCapital]);

  const W = 800;
  const H = height;
  const innerW = W - PADDING.left - PADDING.right;
  const innerH = H - PADDING.top - PADDING.bottom;

  const xOf = (i: number) => {
    if (allDates.length <= 1) return PADDING.left + innerW / 2;
    return PADDING.left + (i / (allDates.length - 1)) * innerW;
  };
  const yOf = (v: number) => {
    const range = maxV - minV || 1;
    return PADDING.top + innerH - ((v - minV) / range) * innerH;
  };

  // dateIdx map for fast lookup
  const dateToIdx = useMemo(() => {
    const m = new Map<string, number>();
    allDates.forEach((d, i) => m.set(d, i));
    return m;
  }, [allDates]);

  function pathFor(s: Series): string {
    if (!s.points.length) return '';
    let d = '';
    let started = false;
    for (const p of s.points) {
      const i = dateToIdx.get(p.date);
      if (i == null) continue;
      const x = xOf(i);
      const y = yOf(p.value);
      if (!started) { d += `M${x.toFixed(2)},${y.toFixed(2)}`; started = true; }
      else d += ` L${x.toFixed(2)},${y.toFixed(2)}`;
    }
    return d;
  }

  // Y-axis grid: 4 seviye
  const yTicks = useMemo(() => {
    const step = (maxV - minV) / 4;
    return [0, 1, 2, 3, 4].map((k) => minV + step * k);
  }, [minV, maxV]);

  // X-axis grid: 5 tarih
  const xTicks = useMemo(() => {
    if (allDates.length <= 5) return allDates.map((_, i) => i);
    const step = (allDates.length - 1) / 4;
    return [0, 1, 2, 3, 4].map((k) => Math.round(k * step));
  }, [allDates]);

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    if (!svgRef.current || allDates.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = W / rect.width;
    const localX = (e.clientX - rect.left) * scaleX;
    const rel = (localX - PADDING.left) / innerW;
    const idx = Math.round(rel * (allDates.length - 1));
    if (idx >= 0 && idx < allDates.length) setHoverIdx(idx);
  }

  function fmtMoney(n: number): string {
    if (Math.abs(n) >= 1_000_000)
      return `${(n / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}M ₺`;
    if (Math.abs(n) >= 1_000)
      return `${(n / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}K ₺`;
    return `${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`;
  }

  const hoverDate = hoverIdx != null ? allDates[hoverIdx] : null;

  return (
    <div className="w-full">
      {/* Legend + toggle */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {series.map((s) => {
          const on = visibleIds.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                const nx = new Set(visibleIds);
                if (on) nx.delete(s.id); else nx.add(s.id);
                setVisibleIds(nx);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition',
                on ? 'border-border bg-bg-card/50 text-slate-200' : 'border-border/40 bg-transparent text-slate-500 line-through',
                s.isPortfolio && on && 'border-accent/50 bg-accent/10 text-accent font-semibold',
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? s.color : '#666' }} />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label="Portföy equity curve grafiği"
        >
          {/* Y grid */}
          {yTicks.map((v, i) => (
            <g key={`yg-${i}`}>
              <line
                x1={PADDING.left} x2={W - PADDING.right}
                y1={yOf(v)} y2={yOf(v)}
                stroke="currentColor" strokeOpacity={0.08} strokeDasharray="2 3"
              />
              <text
                x={PADDING.left - 6} y={yOf(v)}
                textAnchor="end" dominantBaseline="middle"
                fontSize="10" fill="currentColor" fillOpacity={0.55}
              >
                {fmtMoney(v)}
              </text>
            </g>
          ))}
          {/* Baseline (initial capital) */}
          {initialCapital > minV && initialCapital < maxV && (
            <line
              x1={PADDING.left} x2={W - PADDING.right}
              y1={yOf(initialCapital)} y2={yOf(initialCapital)}
              stroke="currentColor" strokeOpacity={0.35} strokeDasharray="4 4"
            />
          )}
          {/* X labels */}
          {xTicks.map((i) => (
            <text
              key={`xg-${i}`}
              x={xOf(i)} y={H - 8}
              textAnchor="middle"
              fontSize="10" fill="currentColor" fillOpacity={0.6}
            >
              {allDates[i] ? formatDateTR(new Date(allDates[i]).toISOString()) : ''}
            </text>
          ))}
          {/* Series paths */}
          {visible.map((s) => (
            <path
              key={s.id}
              d={pathFor(s)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.isPortfolio ? 2.5 : 1.5}
              strokeOpacity={s.isPortfolio ? 1 : 0.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {/* Crosshair */}
          {hoverIdx != null && (
            <line
              x1={xOf(hoverIdx)} x2={xOf(hoverIdx)}
              y1={PADDING.top} y2={H - PADDING.bottom}
              stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 3"
            />
          )}
          {/* Hover dots per series */}
          {hoverIdx != null && visible.map((s) => {
            const p = s.points.find((pt) => pt.date === allDates[hoverIdx]);
            if (!p) return null;
            return (
              <circle
                key={`hd-${s.id}`}
                cx={xOf(hoverIdx)} cy={yOf(p.value)}
                r={s.isPortfolio ? 4 : 3}
                fill={s.color}
                stroke="var(--color-bg-card, #0f172a)" strokeWidth={1.5}
              />
            );
          })}
          {/* Hover capture rect */}
          <rect
            x={PADDING.left} y={PADDING.top}
            width={innerW} height={innerH}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIdx(null)}
          />
        </svg>

        {/* Tooltip */}
        {hoverIdx != null && hoverDate && (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-border bg-bg-card/95 px-3 py-2 text-[11px] shadow-lg backdrop-blur"
            style={{
              left: `min(calc(${(xOf(hoverIdx) / W) * 100}% + 12px), calc(100% - 190px))`,
            }}
          >
            <div className="mb-1 font-semibold text-slate-200">
              {formatDateTR(new Date(hoverDate).toISOString())}
            </div>
            {visible.map((s) => {
              const p = s.points.find((pt) => pt.date === hoverDate);
              if (!p) return null;
              const pct = ((p.value - initialCapital) / initialCapital) * 100;
              const tone = pct >= 0 ? 'text-success' : 'text-danger';
              return (
                <div key={`tt-${s.id}`} className="flex items-center justify-between gap-3 tabular-nums">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    <span className={s.isPortfolio ? 'font-semibold text-slate-100' : 'text-slate-300'}>
                      {s.label}
                    </span>
                  </span>
                  <span className={cn('font-semibold', tone)}>
                    {fmtMoney(p.value)} <span className="opacity-70">({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
