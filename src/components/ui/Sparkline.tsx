import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Renk yon — pozitifse yesil, negatifse kirmizi (otomatik). Override edilebilir. */
  color?: string;
  /** Cizgiye golge (svg filter) ekle. */
  glow?: boolean;
  className?: string;
}

/**
 * Mini sparkline grafik — son N kapanis noktasini gosterir.
 * SVG path olarak render edilir, library bagimliligi yok.
 * Cizgi rengi otomatik: ilk noktadan son noktaya artis varsa yesil, azalis kirmizi.
 */
export function Sparkline({
  data,
  width = 80,
  height = 28,
  color,
  glow = false,
  className,
}: SparklineProps) {
  const { path, areaPath, lineColor } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', areaPath: '', lineColor: '#94a3b8' };
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const xStep = width / (data.length - 1);
    const padTop = 2;
    const padBot = 2;
    const innerH = height - padTop - padBot;

    const points = data.map((v, i) => {
      const x = i * xStep;
      const y = padTop + innerH - ((v - min) / range) * innerH;
      return [x, y] as const;
    });

    const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    // Alan icin alt çizgiyi de tamamla
    const areaPath = `${path} L ${width.toFixed(2)} ${height} L 0 ${height} Z`;

    const isUp = data[data.length - 1] >= data[0];
    const lineColor = color || (isUp ? '#22c55e' : '#ef4444');

    return { path, areaPath, lineColor };
  }, [data, width, height, color]);

  if (!data || data.length < 2) {
    // Veri yok — kesik kesik nokta cizgi placeholder
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn('shrink-0', className)}
        aria-hidden
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3,3"
          opacity="0.3"
        />
      </svg>
    );
  }

  const gradId = `spark-grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={path}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={glow ? { filter: `drop-shadow(0 0 2px ${lineColor})` } : undefined}
      />
    </svg>
  );
}
