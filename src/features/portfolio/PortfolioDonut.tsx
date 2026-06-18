/**
 * Portfoyum -> Pasta/Donut dagilim grafigi.
 * SVG ile native cizim (bundle ek dependency gerekmiyor).
 */
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

export interface DonutItem {
  label: string;
  /** TL cinsinden deger (paydan ote miktar) */
  value: number;
  /** Opsiyonel kategori/grup etiketi (legend altinda 2. satir) */
  sublabel?: string;
}

interface Props {
  items: DonutItem[];
  /** Toplam (opsiyonel, items'tan otomatik hesaplanir) */
  total?: number;
  /** Donut yariciyapi (px). Default 90 */
  radius?: number;
  /** Donut kalinligi (px). Default 28 */
  thickness?: number;
  /** Baslik (legend ustunde). Opsiyonel. */
  title?: string;
  /** Min %0.5'in altinda olan dilimleri 'Diger' altinda grupla */
  groupSmall?: boolean;
}

// Renk paleti - 12 farkli renk, kategorilere yetiyor
const COLORS = [
  '#06b6d4', // cyan (accent)
  '#10b981', // success
  '#f59e0b', // warning
  '#ef4444', // danger
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#3b82f6', // blue
  '#84cc16', // lime
  '#f97316', // orange
  '#14b8a6', // teal
  '#a855f7', // violet
  '#64748b', // slate
];

export function PortfolioDonut({
  items,
  total,
  radius = 90,
  thickness = 28,
  title,
  groupSmall = true,
}: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { slices, sumTotal } = useMemo(() => {
    // Once ayni label'a sahip dilimleri aggregate et (KTJ + KTJ -> tek KTJ)
    const aggregated = new Map<string, DonutItem>();
    for (const it of items) {
      if (it.value <= 0) continue;
      const key = it.label;
      const cur = aggregated.get(key);
      if (cur) {
        cur.value += it.value;
        // sublabel kalir (ilk gelen, genelde isim/kategori ayni)
      } else {
        aggregated.set(key, { label: it.label, value: it.value, sublabel: it.sublabel });
      }
    }
    const aggregatedArr = Array.from(aggregated.values());
    const sum = total ?? aggregatedArr.reduce((s, it) => s + it.value, 0);
    if (sum <= 0) return { slices: [] as Array<DonutItem & { pct: number; color: string }>, sumTotal: 0 };
    // Buyukten kucuge sirala
    const sorted = aggregatedArr.sort((a, b) => b.value - a.value);
    if (groupSmall && sorted.length > 8) {
      const big = sorted.slice(0, 7);
      const smallSum = sorted.slice(7).reduce((s, it) => s + it.value, 0);
      const labels = sorted.slice(7).map((s) => s.label).slice(0, 3).join(', ');
      const otherSuffix = sorted.length - 7 > 3 ? ` +${sorted.length - 10} fon` : '';
      big.push({ label: 'Diger', value: smallSum, sublabel: `${labels}${otherSuffix}` });
      return {
        slices: big.map((it, i) => ({ ...it, pct: (it.value / sum) * 100, color: COLORS[i % COLORS.length] })),
        sumTotal: sum,
      };
    }
    return {
      slices: sorted.map((it, i) => ({ ...it, pct: (it.value / sum) * 100, color: COLORS[i % COLORS.length] })),
      sumTotal: sum,
    };
  }, [items, total, groupSmall]);

  if (slices.length === 0) {
    return null;
  }

  // SVG geometri
  const SIZE = radius * 2 + 8; // ufak padding
  const CENTER = SIZE / 2;
  const INNER_R = radius - thickness;
  // Hover'da disari biraz kayma
  const HOVER_OFFSET = 4;

  // Her dilim icin SVG path (donut arc)
  function arcPath(startAngle: number, endAngle: number, r1: number, r2: number) {
    // SVG koordinatlari: y asagi gider, 0 derece sag-orta
    // Bunun yerine 12 saat yonune baslamak icin -90 offset
    const a1 = (startAngle - 90) * (Math.PI / 180);
    const a2 = (endAngle - 90) * (Math.PI / 180);
    const x1 = CENTER + r1 * Math.cos(a1);
    const y1 = CENTER + r1 * Math.sin(a1);
    const x2 = CENTER + r1 * Math.cos(a2);
    const y2 = CENTER + r1 * Math.sin(a2);
    const x3 = CENTER + r2 * Math.cos(a2);
    const y3 = CENTER + r2 * Math.sin(a2);
    const x4 = CENTER + r2 * Math.cos(a1);
    const y4 = CENTER + r2 * Math.sin(a1);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return [
      `M ${x1} ${y1}`,
      `A ${r1} ${r1} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${r2} ${r2} 0 ${largeArc} 0 ${x4} ${y4}`,
      'Z',
    ].join(' ');
  }

  let cumAngle = 0;
  const paths = slices.map((slice, i) => {
    const sweep = (slice.pct / 100) * 360;
    const startAngle = cumAngle;
    const endAngle = cumAngle + sweep;
    cumAngle = endAngle;
    // Hover'da disari kayma icin merkez ofset
    const midAngle = (startAngle + endAngle) / 2;
    const midRad = (midAngle - 90) * (Math.PI / 180);
    const isHover = hoverIdx === i;
    const dx = isHover ? HOVER_OFFSET * Math.cos(midRad) : 0;
    const dy = isHover ? HOVER_OFFSET * Math.sin(midRad) : 0;
    return (
      <g key={i} transform={`translate(${dx} ${dy})`}>
        <path
          d={arcPath(startAngle, endAngle, radius, INNER_R)}
          fill={slice.color}
          stroke="rgba(15, 23, 42, 0.4)"
          strokeWidth={1}
          style={{ transition: 'transform 200ms', cursor: 'pointer' }}
          onMouseEnter={() => setHoverIdx(i)}
          onMouseLeave={() => setHoverIdx(null)}
        />
      </g>
    );
  });

  const hovered = hoverIdx != null ? slices[hoverIdx] : null;

  return (
    <div className="w-full">
      {title && <h3 className="mb-3 text-sm font-semibold text-slate-100">{title}</h3>}
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] items-center">
        {/* SVG Donut */}
        <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            {paths}
          </svg>
          {/* Merkez yazi - toplam veya hover bilgisi */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {hovered ? (
              <>
                <div className="font-mono text-lg font-extrabold text-white">
                  %{hovered.pct.toFixed(1)}
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 truncate max-w-[110px]">
                  {hovered.label}
                </div>
                <div className="mt-0.5 font-mono text-xs font-bold tabular-nums text-accent">
                  {formatMoney(hovered.value)}
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Toplam</div>
                <div className="mt-0.5 font-mono text-base font-extrabold tabular-nums text-white">
                  {formatMoney(sumTotal)}
                </div>
                <div className="text-[10px] text-slate-400">{slices.length} kalem</div>
              </>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-1.5">
          {slices.map((slice, i) => (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition',
                hoverIdx === i ? 'bg-bg-card' : 'hover:bg-bg-card/60',
              )}
            >
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-sm"
                style={{ backgroundColor: slice.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-sm font-bold text-white truncate">{slice.label}</span>
                  <span className="text-[11px] font-semibold text-slate-300 shrink-0 tabular-nums">
                    %{slice.pct.toFixed(1)}
                  </span>
                </div>
                {slice.sublabel && (
                  <div className="truncate text-[11px] text-slate-400 leading-tight">{slice.sublabel}</div>
                )}
              </div>
              <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-slate-50">
                {formatMoney(slice.value)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
