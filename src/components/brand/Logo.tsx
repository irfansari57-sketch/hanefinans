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
    // Wordmark: "Investli" + büyük yeşil "Q" (logo ikonuyla eşleşen).
    // Tagline büyük harfle, cyan/turkuaz vurgu.
    return (
      <div className={cn('inline-flex flex-col items-center gap-1.5', className)}>
        <LogoIcon size={size} />
        <div className="flex flex-col items-center leading-tight">
          <span className="text-lg font-black tracking-tight flex items-baseline">
            <span className="text-slate-900 dark:text-slate-100">Investli</span>
            {/* Q — her iki modda canlı turkuaz-yeşil gradient (cyan → emerald) */}
            <span
              className="text-xl bg-gradient-to-br from-cyan-400 via-emerald-400 to-emerald-500 bg-clip-text text-transparent"
              style={{ WebkitTextFillColor: 'transparent' }}
            >
              Q
            </span>
          </span>
          <span className="mt-1 text-[9px] tracking-[0.18em] font-bold uppercase text-cyan-600 dark:text-cyan-400 text-center leading-relaxed">
            Yatırımcılar İçin<br />Akıllı Veri Platformu
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

      {/* Ambient emerald hale — çerçevede ortalanmış */}
      <circle cx="60" cy="60" r="55" fill="url(#iq-ambient)" />

      {/* Sparkle yıldızları — köşelerde denk simetri */}
      <g filter="url(#iq-sparkle)">
        <circle cx="16" cy="20" r="2.0" fill="#4ade80" opacity="0.85" />
        <circle cx="104" cy="20" r="1.8" fill="#86efac" opacity="0.75" />
        <circle cx="16" cy="100" r="1.9" fill="#4ade80" opacity="0.7" />
        <circle cx="104" cy="100" r="2.0" fill="#86efac" opacity="0.8" />
        <circle cx="60" cy="10" r="1.3" fill="#ffffff" opacity="0.7" />
        <circle cx="60" cy="112" r="1.3" fill="#ffffff" opacity="0.7" />
        <circle cx="8" cy="60" r="1.3" fill="#22c55e" opacity="0.65" />
        <circle cx="112" cy="60" r="1.3" fill="#22c55e" opacity="0.7" />
      </g>
      <g fill="#ffffff" opacity="0.7">
        <path d="M25 22 L26 18 L27 22 L31 23 L27 24 L26 28 L25 24 L21 23 Z" />
        <path d="M93 98 L94 94 L95 98 L99 99 L95 100 L94 104 L93 100 L89 99 Z" />
      </g>

      {/* Q halkası — chrome 3D, merkez 60,60 */}
      <g filter="url(#iq-outer-glow)">
        <circle
          cx="60"
          cy="60"
          r="32"
          fill="none"
          stroke="url(#iq-ring-3d)"
          strokeWidth="11"
        />
        <circle
          cx="60"
          cy="60"
          r="32"
          fill="none"
          stroke="url(#iq-ring-shine)"
          strokeWidth="11"
        />
        <circle
          cx="60"
          cy="60"
          r="32"
          fill="none"
          stroke="url(#iq-ring-inner)"
          strokeWidth="11"
          transform="rotate(180 60 60)"
        />
      </g>

      {/* Q kuyruğu — sağ alta simetrik uzunluk */}
      <g filter="url(#iq-outer-glow)">
        <line
          x1="80"
          y1="80"
          x2="102"
          y2="102"
          stroke="url(#iq-ring-3d)"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <line
          x1="80"
          y1="80"
          x2="102"
          y2="102"
          stroke="url(#iq-ring-shine)"
          strokeWidth="11"
          strokeLinecap="round"
        />
      </g>

      {/* Merkez glow aura */}
      <circle cx="60" cy="60" r="14" fill="url(#iq-dot-glow)" />

      {/* Merkez 3D sphere — dot */}
      <g filter="url(#iq-dot-shadow)">
        <circle cx="60" cy="60" r="8.5" fill="url(#iq-dot-3d)" stroke="#86efac" strokeWidth="0.6" />
        <ellipse cx="57.5" cy="57" rx="3.5" ry="2.2" fill="#ffffff" opacity="0.75" transform="rotate(-35 57.5 57)" />
        <circle cx="59" cy="58" r="0.8" fill="#ffffff" opacity="0.95" />
      </g>
    </svg>
  );
}
