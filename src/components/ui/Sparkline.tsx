import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  /** Kapanis fiyat dizisi — son nokta en gunceli. */
  data: number[];
  width?: number;
  height?: number;
  /** Ozel renk — verilmezse trend'e gore yesil/kirmizi. */
  color?: string;
  /** Glow efekti — vurgu icin. */
  glow?: boolean;
  className?: string;
}

/**
 * Mini sparkline cizgi grafigi — saf SVG (kutuphane yok).
 * Default: trend yukariysa yesil, asagiysa kirmizi.
 * Alt taraf gradyan dolgu ile vurgulanir.
 */
export function Sparkline({
  data,
  width = 80,
  height = 28,
  color,
  glow,
  className,
}: SparklineProps) {
  const { path, areaPath, lineColor } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', areaPath: '', lineColor: '#94a3b8' };
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);

    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return [x, y] as const;
    });

    const path = points
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ');

    const areaPath = `${path} L${points[points.length - 1][0].toFixed(2)},${height} L${points[0][0].toFixed(2)},${height} Z`;

    const isUp = data[data.length - 1] >= data[0];
    const lineColor = color || (isUp ? '#22c55e' : '#ef4444');

    return { path, areaPath, lineColor };
  }, [data, width, height, color]);

  if (!path) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn('shrink-0 opacity-30', className)}
        aria-hidden
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#94a3b8"
          strokeWidth="1"
          strokeDasharray="2 2"
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
