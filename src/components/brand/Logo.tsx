import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
  /** İçindeki hex grid + glow ışıması */
  variant?: 'icon' | 'full';
}

/**
 * Hane Finans logosu — hexagonal metalik kalkan + stilize "H" + candlestick efekti.
 * Silver chrome gradient, cyan glow.
 */
export function Logo({ size = 40, className, variant = 'icon' }: LogoProps) {
  if (variant === 'full') {
    return (
      <div className={cn('inline-flex items-center gap-2.5', className)}>
        <LogoIcon size={size} />
        <div className="flex flex-col leading-tight">
          <span className="bg-gradient-to-r from-slate-100 via-slate-300 to-slate-500 bg-clip-text text-base font-bold tracking-tight text-transparent">
            HANE FINANS
          </span>
          <span className="text-[9px] uppercase tracking-[0.2em] text-accent/80">
            financial intelligence
          </span>
        </div>
      </div>
    );
  }
  return <LogoIcon size={size} className={className} />;
}

function LogoIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Metalik gümüş gradient */}
        <linearGradient id="hf-chrome" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="35%" stopColor="#94a3b8" />
          <stop offset="65%" stopColor="#475569" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        {/* Dik gümüş gradient (kenar parlaklığı) */}
        <linearGradient id="hf-rim" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="50%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        {/* Cyan iç glow */}
        <radialGradient id="hf-cyan-glow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.6" />
          <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        {/* Yüksek ışık */}
        <linearGradient id="hf-highlight" x1="0%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Çizgi glow */}
        <filter id="hf-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Cyan iç parlaklık (zemin) */}
      <polygon points="40,4 70,22 70,58 40,76 10,58 10,22" fill="url(#hf-cyan-glow)" />

      {/* Hexagon dış kalkan — metalik */}
      <polygon
        points="40,4 70,22 70,58 40,76 10,58 10,22"
        fill="url(#hf-chrome)"
        stroke="url(#hf-rim)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* İç hexagon (gömme efekti) */}
      <polygon
        points="40,12 63,25 63,55 40,68 17,55 17,25"
        fill="#0a1428"
        stroke="#1e293b"
        strokeWidth="1"
      />

      {/* Stilize H harfi — candlestick yüksek/düşük gibi */}
      <g fill="url(#hf-chrome)" stroke="#0f172a" strokeWidth="0.5">
        {/* sol dik */}
        <rect x="26" y="22" width="6" height="36" rx="1" />
        {/* sağ dik */}
        <rect x="48" y="22" width="6" height="36" rx="1" />
        {/* orta yatay */}
        <rect x="32" y="36" width="16" height="8" rx="1" />
      </g>

      {/* Cyan candlestick aksan (sol ve sağ dik üzerinde) */}
      <g filter="url(#hf-glow)">
        <line x1="29" y1="20" x2="29" y2="60" stroke="#22d3ee" strokeWidth="0.8" opacity="0.9" />
        <line x1="51" y1="20" x2="51" y2="60" stroke="#22d3ee" strokeWidth="0.8" opacity="0.9" />
      </g>

      {/* Trend grafik çizgisi (sağdan sola yükselen) — neon cyan */}
      <polyline
        points="18,52 26,46 34,48 42,38 50,42 58,30 64,32"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#hf-glow)"
        opacity="0.9"
      />

      {/* Üst yarı parlaklık (highlight) */}
      <polygon
        points="40,4 70,22 70,40 10,40 10,22"
        fill="url(#hf-highlight)"
        opacity="0.18"
      />

      {/* Üst köşe vurgu noktası */}
      <circle cx="40" cy="6" r="1.5" fill="#ffffff" opacity="0.9" />
    </svg>
  );
}
