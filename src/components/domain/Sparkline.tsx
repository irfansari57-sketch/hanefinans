import { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
  showArea?: boolean;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  positive,
  showArea = true,
}: SparklineProps) {
  const { path, area } = useMemo(() => {
    if (data.length < 2) return { path: '', area: '' };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = width / (data.length - 1);
    const pts = data.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return [x, y] as const;
    });
    const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
    const area = `${path} L${pts[pts.length - 1][0]},${height} L0,${height} Z`;
    return { path, area };
  }, [data, width, height]);

  if (!path) return null;
  const isUp = positive ?? data[data.length - 1] >= data[0];
  const color = isUp ? '#22c55e' : '#ef4444';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {showArea && (
        <path d={area} fill={color} fillOpacity={0.12} />
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
