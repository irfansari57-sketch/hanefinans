import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
  /** icon: sadece Q logosu; full: Q + altında "InvestLiq" marka yazısı */
  variant?: 'icon' | 'full';
}

/**
 * InvestLiq — Q + yeşil elmas + magnifier logo (v2).
 * - Emerald 3D halka (light + dark mode uyumlu)
 * - Ambient glow arka plan + sparkle yıldızlar
 * - Elmas 3D gradient + drop shadow + iç parlaklık
 * Masaüstü + mobil ölçekleri responsive (viewBox 120x120 + overflow-visible).
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
  // ViewBox 120x120 — Q + magnifier + elmas + ambient glow + sparkle.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={cn('overflow-visible', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Ambient background glow — emerald, soft radial */}
        <radialGradient id="iq-ambient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.32" />
          <stop offset="45%" stopColor="#22c55e" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>

        {/* Q halkası — 3D emerald (üst aydınlık → alt derin) */}
        <linearGradient id="iq-ring-3d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="35%" stopColor="#22c55e" />
          <stop offset="75%" stopColor="#15803d" />
          <stop offset="100%" stopColor="#052e16" />
        </linearGradient>

        {/* Halka üst parıltısı — beyaz shine yayı */}
        <linearGradient id="iq-ring-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="32%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Elmas 3D gradient */}
        <linearGradient id="iq-diamond-3d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bbf7d0" />
          <stop offset="40%" stopColor="#4ade80" />
          <stop offset="72%" stopColor="#16a34a" />
          <stop offset="100%" stopColor="#14532d" />
        </linearGradient>

        {/* Elmas sol-üst köşe parıltısı */}
        <linearGradient id="iq-diamond-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Outer glow filter — halka çevresi emerald aura */}
        <filter id="iq-outer-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Sparkle soft blur */}
        <filter id="iq-sparkle" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.3" />
        </filter>

        {/* Elmas drop shadow — derinlik hissi */}
        <filter id="iq-diamond-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" />
          <feOffset dx="0" dy="1.8" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.55" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ambient emerald hale — Q çevresinde soft glow */}
      <circle cx="55" cy="55" r="58" fill="url(#iq-ambient)" />

      {/* Sparkle yıldızları — arka plan pırıltı */}
      <g filter="url(#iq-sparkle)">
        <circle cx="18" cy="26" r="1.6" fill="#4ade80" opacity="0.72" />
        <circle cx="100" cy="20" r="1.3" fill="#86efac" opacity="0.62" />
        <circle cx="14" cy="80" r="1.4" fill="#4ade80" opacity="0.58" />
        <circle cx="104" cy="96" r="1.7" fill="#86efac" opacity="0.68" />
        <circle cx="92" cy="14" r="0.95" fill="#ffffff" opacity="0.55" />
        <circle cx="26" cy="102" r="1" fill="#ffffff" opacity="0.55" />
        <circle cx="8" cy="55" r="0.9" fill="#22c55e" opacity="0.5" />
        <circle cx="112" cy="55" r="1.1" fill="#22c55e" opacity="0.55" />
      </g>

      {/* Q halkası — 3D emerald + outer glow */}
      <g filter="url(#iq-outer-glow)">
        <circle
          cx="55"
          cy="55"
          r="34"
          fill="none"
          stroke="url(#iq-ring-3d)"
          strokeWidth="10"
        />
        {/* Üst shine yayı — 3D parıltı */}
        <circle
          cx="55"
          cy="55"
          r="34"
          fill="none"
          stroke="url(#iq-ring-shine)"
          strokeWidth="10"
        />
      </g>

      {/* İç accent halka — subtle emerald pop */}
      <circle
        cx="55"
        cy="55"
        r="29"
        fill="none"
        stroke="#4ade80"
        strokeWidth="0.7"
        opacity="0.55"
      />

      {/* Magnifier sap — Q'nun kuyruğu */}
      <g filter="url(#iq-outer-glow)">
        <line
          x1="76"
          y1="76"
          x2="98"
          y2="98"
          stroke="url(#iq-ring-3d)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <line
          x1="76"
          y1="76"
          x2="98"
          y2="98"
          stroke="url(#iq-ring-shine)"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </g>

      {/* Yeşil elmas — merkez mücevher (3D + shadow) */}
      <g filter="url(#iq-diamond-shadow)">
        <polygon
          points="55,36 68,55 55,74 42,55"
          fill="url(#iq-diamond-3d)"
          stroke="#86efac"
          strokeWidth="0.7"
        />
        {/* Sol-üst facet highlight */}
        <polygon
          points="55,36 61,45 55,55 49,45"
          fill="url(#iq-diamond-shine)"
        />
        {/* Bright core parıltı */}
        <circle cx="55" cy="55" r="1.4" fill="#ffffff" opacity="0.85" />
      </g>
    </svg>
  );
}
