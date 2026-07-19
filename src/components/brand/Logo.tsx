import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
  /** icon: sadece Q logosu; full: Q + altında "InvestLiq" marka yazısı */
  variant?: 'icon' | 'full';
}

/**
 * InvestLiq — Q ring + merkezde "i noktası" logo (v5).
 * - Chrome-emerald 3D dış halka + specular + contour
 * - Q kuyruğu sağ-alt (klasik Q formu)
 * - Merkezde küçük 3D emerald sphere = "i" harfinin noktası
 * - Ambient glow + sparkle
 */
export function Logo({ size = 40, className, variant = 'icon' }: LogoProps) {
  if (variant === 'full') {
    return (
      <div className={cn('inline-flex flex-col items-center gap-1', className)}>
        <LogoIcon size={size} />
        <div className="flex flex-col items-center leading-tight">
          <span className="text-base font-extrabold tracking-tight">
            <span className="text-slate-900 dark:text-slate-100">Invest</span>
            <span className="text-emerald-600 dark:text-emerald-400">Liq</span>
          </span>
          <span className="mt-0.5 text-[10px] tracking-[0.14em] font-semibold uppercase text-slate-600 dark:text-accent/85">
            Yatırımcılar İçin Akıllı Veri Platformu
          </span>
        </div>
      </div>
    );
  }
  return <LogoIcon size={size} className={className} />;
}

function LogoIcon({ size = 40, className }: { size?: number; className?: string }) {
  // ViewBox 120x120 — Q halkası + kuyruk + merkez i noktası.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={cn('overflow-visible', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Ambient hale */}
        <radialGradient id="iq-ambient" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.55" />
          <stop offset="40%" stopColor="#22c55e" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>

        {/* Q halkası — chrome-emerald 3D */}
        <linearGradient id="iq-ring-3d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="18%" stopColor="#4ade80" />
          <stop offset="45%" stopColor="#16a34a" />
          <stop offset="78%" stopColor="#14532d" />
          <stop offset="100%" stopColor="#052e16" />
        </linearGradient>

        {/* Halka üst specular */}
        <linearGradient id="iq-ring-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="18%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="40%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Halka alt contour — chrome derinlik */}
        <linearGradient id="iq-ring-inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#052e16" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#052e16" stopOpacity="0" />
        </linearGradient>

        {/* i noktası — 3D sphere gradient */}
        <radialGradient id="iq-dot-3d" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ecfdf5" />
          <stop offset="25%" stopColor="#86efac" />
          <stop offset="60%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#14532d" />
        </radialGradient>

        {/* i noktası glow */}
        <radialGradient id="iq-dot-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.7" />
          <stop offset="70%" stopColor="#22c55e" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>

        {/* Outer glow filter */}
        <filter id="iq-outer-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Sparkle blur */}
        <filter id="iq-sparkle" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1" />
        </filter>

        {/* i noktası drop shadow */}
        <filter id="iq-dot-shadow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" />
          <feOffset dx="0.4" dy="1.6" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.75" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ambient emerald hale */}
      <circle cx="55" cy="55" r="60" fill="url(#iq-ambient)" />

      {/* Sparkle yıldızları */}
      <g filter="url(#iq-sparkle)">
        <circle cx="16" cy="24" r="2.2" fill="#4ade80" opacity="0.85" />
        <circle cx="102" cy="18" r="1.8" fill="#86efac" opacity="0.75" />
        <circle cx="12" cy="82" r="1.9" fill="#4ade80" opacity="0.7" />
        <circle cx="106" cy="98" r="2.4" fill="#86efac" opacity="0.8" />
        <circle cx="94" cy="12" r="1.3" fill="#ffffff" opacity="0.75" />
        <circle cx="24" cy="104" r="1.4" fill="#ffffff" opacity="0.7" />
        <circle cx="6" cy="52" r="1.3" fill="#22c55e" opacity="0.65" />
        <circle cx="114" cy="60" r="1.5" fill="#22c55e" opacity="0.7" />
      </g>
      <g fill="#ffffff" opacity="0.7">
        <path d="M22 22 L23 18 L24 22 L28 23 L24 24 L23 28 L22 24 L18 23 Z" />
        <path d="M100 100 L101 96 L102 100 L106 101 L102 102 L101 106 L100 102 L96 101 Z" />
      </g>

      {/* Q halkası — chrome 3D */}
      <g filter="url(#iq-outer-glow)">
        <circle
          cx="55"
          cy="55"
          r="34"
          fill="none"
          stroke="url(#iq-ring-3d)"
          strokeWidth="12"
        />
        <circle
          cx="55"
          cy="55"
          r="34"
          fill="none"
          stroke="url(#iq-ring-shine)"
          strokeWidth="12"
        />
        <circle
          cx="55"
          cy="55"
          r="34"
          fill="none"
          stroke="url(#iq-ring-inner)"
          strokeWidth="12"
          transform="rotate(180 55 55)"
        />
      </g>

      {/* Q kuyruğu — sağ alta */}
      <g filter="url(#iq-outer-glow)">
        <line
          x1="77"
          y1="77"
          x2="102"
          y2="102"
          stroke="url(#iq-ring-3d)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <line
          x1="77"
          y1="77"
          x2="102"
          y2="102"
          stroke="url(#iq-ring-shine)"
          strokeWidth="12"
          strokeLinecap="round"
        />
      </g>

      {/* i noktası glow — arka aura */}
      <circle cx="55" cy="55" r="14" fill="url(#iq-dot-glow)" />

      {/* i noktası — merkez 3D sphere */}
      <g filter="url(#iq-dot-shadow)">
        <circle cx="55" cy="55" r="8.5" fill="url(#iq-dot-3d)" stroke="#86efac" strokeWidth="0.6" />
        {/* Highlight — sol üstte beyaz shine */}
        <ellipse cx="52.5" cy="52" rx="3.5" ry="2.2" fill="#ffffff" opacity="0.75" transform="rotate(-35 52.5 52)" />
        {/* Tiny bright dot */}
        <circle cx="54" cy="53" r="0.8" fill="#ffffff" opacity="0.95" />
      </g>
    </svg>
  );
}
