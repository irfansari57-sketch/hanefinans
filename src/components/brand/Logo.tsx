import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
  /** icon: sadece Q logosu; full: Q + altında "InvestLiq" marka yazısı */
  variant?: 'icon' | 'full';
}

/**
 * InvestLiq — Q + iç mini büyüteç + Q kuyruğu içeri gösterge (v4).
 * - Chrome-emerald 3D dış halka + specular + contour
 * - İç mini büyüteç (analiz vurgusu) — lens + handle
 * - Q kuyruğu ringin içine hafif girip mini büyüteci işaret eder
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
  // ViewBox 120x120 — Q dış halka + Q kuyruğu (dışa) + iç mini büyüteç + kuyruk göstergesi (içe).
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

        {/* Dış Q halkası — chrome-emerald 3D */}
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

        {/* Mini büyüteç — daha parlak emerald */}
        <linearGradient id="iq-mag-3d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dcfce7" />
          <stop offset="35%" stopColor="#4ade80" />
          <stop offset="70%" stopColor="#16a34a" />
          <stop offset="100%" stopColor="#14532d" />
        </linearGradient>

        {/* Mini büyüteç shine */}
        <linearGradient id="iq-mag-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Mini büyüteç iç glass */}
        <radialGradient id="iq-mag-glass" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#4ade80" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#052e16" stopOpacity="0.35" />
        </radialGradient>

        {/* Outer glow */}
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

        {/* Mini büyüteç drop shadow */}
        <filter id="iq-mag-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" />
          <feOffset dx="0.5" dy="1.8" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.7" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ambient emerald hale */}
      <circle cx="56" cy="54" r="60" fill="url(#iq-ambient)" />

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

      {/* Dış Q halkası — chrome 3D */}
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

      {/* Q kuyruğu — dış (sağ alta uzayan sap) */}
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

      {/* Q kuyruğu — iç uzantı (ringin içinden mini büyüteci gösterir) */}
      <line
        x1="72"
        y1="72"
        x2="64"
        y2="64"
        stroke="url(#iq-mag-3d)"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.9"
      />

      {/* Mini büyüteç — merkez (piyasa analizi vurgusu) */}
      <g filter="url(#iq-mag-shadow)">
        {/* Lens dolgu (cam) */}
        <circle cx="50" cy="50" r="15" fill="url(#iq-mag-glass)" />

        {/* Lens dış çember — chrome */}
        <circle
          cx="50"
          cy="50"
          r="15"
          fill="none"
          stroke="url(#iq-mag-3d)"
          strokeWidth="4.5"
        />
        {/* Lens shine */}
        <circle
          cx="50"
          cy="50"
          r="15"
          fill="none"
          stroke="url(#iq-mag-shine)"
          strokeWidth="4.5"
        />

        {/* Büyüteç sapı — Q kuyruğuna doğru uzanır */}
        <line
          x1="60.5"
          y1="60.5"
          x2="68"
          y2="68"
          stroke="url(#iq-mag-3d)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <line
          x1="60.5"
          y1="60.5"
          x2="68"
          y2="68"
          stroke="url(#iq-mag-shine)"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Lens parıltı — sol üstte küçük beyaz noktalar (glass reflection) */}
        <ellipse cx="45" cy="45" rx="3.5" ry="2.2" fill="#ffffff" opacity="0.7" transform="rotate(-35 45 45)" />
        <circle cx="53" cy="43" r="1" fill="#ffffff" opacity="0.85" />
      </g>
    </svg>
  );
}
