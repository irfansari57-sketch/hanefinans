import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
  /** icon: sadece Q logosu; full: Q + altında "InvestLiq" marka yazısı */
  variant?: 'icon' | 'full';
}

/**
 * InvestLiq — Q + yeşil elmas + magnifier logo.
 * Beyaz çember + orta yeşil elmas (yatırım/karar sembolü) + sağ altta magnifier sap.
 * Dark bg (#0e1830) üzerinde beyaz renk.
 */
export function Logo({ size = 40, className, variant = 'icon' }: LogoProps) {
  if (variant === 'full') {
    return (
      <div className={cn('inline-flex flex-col items-center gap-1', className)}>
        <LogoIcon size={size} />
        <div className="flex flex-col items-center leading-tight">
          <span className="text-base font-extrabold tracking-tight">
            <span className="text-slate-100">Invest</span>
            <span className="text-emerald-400">Liq</span>
          </span>
          <span className="mt-0.5 text-[10px] tracking-[0.14em] text-accent/85 font-semibold uppercase">
            Yatırımcılar İçin Akıllı Veri Platformu
          </span>
        </div>
      </div>
    );
  }
  return <LogoIcon size={size} className={className} />;
}

function LogoIcon({ size = 40, className }: { size?: number; className?: string }) {
  // ViewBox 100x100 — kare logo (Q + magnifier + elmas)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn('drop-shadow-[0_2px_8px_rgba(255,255,255,0.15)]', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Beyaz çember için subtle inner shadow */}
        <radialGradient id="iq-ring-grad" cx="50%" cy="50%" r="50%">
          <stop offset="85%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </radialGradient>

        {/* Yeşil elmas 3D efekti */}
        <linearGradient id="iq-diamond-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="50%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>

        {/* Elmas highlight */}
        <linearGradient id="iq-diamond-shine" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Soft glow */}
        <filter id="iq-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ana Q çember — beyaz halka */}
      <circle
        cx="45"
        cy="45"
        r="32"
        fill="none"
        stroke="url(#iq-ring-grad)"
        strokeWidth="9"
      />

      {/* Magnifier sap (Q'nun kuyruğu) — sağ alt köşe */}
      <line
        x1="66"
        y1="66"
        x2="82"
        y2="82"
        stroke="url(#iq-ring-grad)"
        strokeWidth="9"
        strokeLinecap="round"
      />

      {/* Yeşil elmas — merkez (yatırım / veri noktası) */}
      <g filter="url(#iq-glow)">
        <polygon
          points="45,32 55,45 45,58 35,45"
          fill="url(#iq-diamond-grad)"
        />
        {/* Elmas highlight */}
        <polygon
          points="45,32 50,39 45,45 40,39"
          fill="url(#iq-diamond-shine)"
        />
      </g>
    </svg>
  );
}
