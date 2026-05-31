import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { Stock } from '@/data/types';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

interface TickerProps {
  stocks: Stock[];
  speed?: number;
}

const ITEM_STEP_PX = 220;

export function Ticker({ stocks, speed = 28 }: TickerProps) {
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef<number>(0);

  useEffect(() => {
    if (paused || hovered || stocks.length === 0) return;
    const track = trackRef.current;
    if (!track) return;
    let rafId = 0;
    let lastTime = performance.now();
    let halfWidth = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      offsetRef.current += speed * dt;
      if (halfWidth === 0) halfWidth = track.scrollWidth / 2;
      if (offsetRef.current >= halfWidth && halfWidth > 0) {
        offsetRef.current -= halfWidth;
      }
      track.style.transform = `translate3d(-${offsetRef.current}px, 0, 0)`;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [paused, hovered, stocks.length, speed]);

  const jumpBy = (delta: number) => {
    const track = trackRef.current;
    if (!track) return;
    offsetRef.current = Math.max(0, offsetRef.current + delta);
    track.style.transition = 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)';
    track.style.transform = `translate3d(-${offsetRef.current}px, 0, 0)`;
    window.setTimeout(() => {
      if (trackRef.current) trackRef.current.style.transition = '';
    }, 270);
  };
  const handlePrev = () => jumpBy(-ITEM_STEP_PX);
  const handleNext = () => jumpBy(ITEM_STEP_PX);
  const togglePause = () => setPaused((p) => !p);

  if (!stocks.length) return null;
  const repeated = [...stocks, ...stocks];

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border bg-gradient-to-r from-bg-soft via-bg-card to-bg-soft"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-bg-soft to-transparent" />
      <div className="absolute inset-y-0 right-0 z-20 flex items-center gap-0.5 bg-gradient-to-l from-bg-soft via-bg-soft/80 to-transparent pl-6 pr-1.5">
        <button
          type="button"
          onClick={handlePrev}
          className="grid h-6 w-6 place-items-center rounded text-slate-300 transition hover:bg-accent/15 hover:text-accent"
          aria-label="Onceki hisse"
          title="Onceki"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={togglePause}
          className="grid h-6 w-6 place-items-center rounded text-slate-300 transition hover:bg-accent/15 hover:text-accent"
          aria-label={paused ? 'Devam' : 'Durdur'}
          title={paused ? 'Devam' : 'Durdur'}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="grid h-6 w-6 place-items-center rounded text-slate-300 transition hover:bg-accent/15 hover:text-accent"
          aria-label="Sonraki hisse"
          title="Sonraki"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div
        ref={trackRef}
        className="flex items-center gap-6 py-2.5 will-change-transform"
      >
        {repeated.map((s, i) => {
          const tone = s.changePct >= 0 ? 'text-success' : 'text-danger';
          const sign = s.changePct >= 0 ? '+' : '';
          const arrow = s.changePct >= 0 ? '▲' : '▼';
          return (
            <Link
              to={`/stock/${s.symbol}`}
              key={`${s.symbol}-${i}`}
              className="group inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-0.5 text-xs hover:bg-bg-card rounded transition-colors"
            >
              <span className="font-mono font-semibold text-accent group-hover:underline">{s.symbol}</span>
              <span className="tabular-nums text-slate-200">{formatMoney(s.price)}</span>
              <span className={cn('tabular-nums', tone)}>
                {arrow} {sign}{s.changePct.toFixed(2)}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
