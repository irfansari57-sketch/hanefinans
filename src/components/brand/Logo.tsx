import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
  /** icon: sadece bar grafiği; full: bar + alttaki marka yazısı */
  variant?: 'icon' | 'full';
}

/**
 * Hane Finans — Cyan Skyline logo.
 * 5 dikey bar (şehir/veri silueti) + pixel pattern + altta dalga.
 */
export function Logo({ size = 40, className, variant = 'icon' }: LogoProps) {
  if (variant === 'full') {
    return (
      <div className={cn('inline-flex flex-col items-center gap-1', className)}>
        <LogoIcon size={size} />
        <div className="flex flex-col items-center leading-tight">
          <span className="logo-text-3d text-base font-extrabold tracking-tight">
            HANE FİNANS
          </span>
          <span lang="en" className="mt-0.5 text-[10px] tracking-[0.18em] text-accent/85 font-semibold">
            FINANCIAL INTELLIGENCE
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
      height={size * 0.7}
      viewBox="0 0 80 56"
      className={cn('drop-shadow-[0_2px_6px_rgba(34,211,238,0.25)]', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Dikey cyan gradient — bar ana rengi */}
        <linearGradient id="hf-bar-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="1" />
          <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#0891b2" stopOpacity="0.85" />
        </linearGradient>

        {/* Pixel pattern — barların içindeki dijital doku */}
        <pattern id="hf-pixels" patternUnits="userSpaceOnUse" width="2" height="2.5">
          <rect width="2" height="2.5" fill="url(#hf-bar-grad)" />
          <rect x="0" y="0.8" width="2" height="0.5" fill="#0e7490" opacity="0.35" />
        </pattern>

        {/* Üst highlight — barların tepe ışığı */}
        <linearGradient id="hf-top-light" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>

        {/* Glow */}
        <filter id="hf-skyline-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="hf-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      {/* 5 dikey bar — şehir silueti / data bars */}
      <g filter="url(#hf-skyline-glow)">
        {/* Bar 1 — kısa, sol */}
        <rect x="13" y="30" width="8" height="18" rx="0.5" fill="url(#hf-pixels)" />
        {/* Bar 2 — orta */}
        <rect x="24" y="20" width="8" height="28" rx="0.5" fill="url(#hf-pixels)" />
        {/* Bar 3 — en uzun (orta-sol) */}
        <rect x="35" y="6"  width="8" height="42" rx="0.5" fill="url(#hf-pixels)" />
        {/* Bar 4 — uzun (orta-sağ) */}
        <rect x="46" y="14" width="8" height="34" rx="0.5" fill="url(#hf-pixels)" />
        {/* Bar 5 — kısa, sağ */}
        <rect x="57" y="26" width="8" height="22" rx="0.5" fill="url(#hf-pixels)" />
      </g>

      {/* Bar üst highlight'ları — beyaz tepe ışığı */}
      <g opacity="0.85">
        <rect x="13" y="30" width="8" height="1.2" rx="0.5" fill="url(#hf-top-light)" />
        <rect x="24" y="20" width="8" height="1.2" rx="0.5" fill="url(#hf-top-light)" />
        <rect x="35" y="6"  width="8" height="1.2" rx="0.5" fill="url(#hf-top-light)" />
        <rect x="46" y="14" width="8" height="1.2" rx="0.5" fill="url(#hf-top-light)" />
        <rect x="57" y="26" width="8" height="1.2" rx="0.5" fill="url(#hf-top-light)" />
      </g>

      {/* Birinci dalga — noktalı, ana akış */}
      <path
        d="M 0,50 C 14,44 28,54 40,50 S 66,42 80,48"
        stroke="#22d3ee"
        strokeWidth="0.8"
        fill="none"
        strokeDasharray="1.2,1.6"
        strokeLinecap="round"
        opacity="0.95"
        filter="url(#hf-skyline-glow)"
      />

      {/* İkinci dalga — daha alt, soluk */}
      <path
        d="M 0,53 C 18,48 32,56 42,53 S 68,46 80,52"
        stroke="#22d3ee"
        strokeWidth="0.6"
        fill="none"
        strokeDasharray="0.8,1.8"
        opacity="0.55"
      />

      {/* Yumuşak cyan halo arka plan */}
      <ellipse
        cx="40"
        cy="50"
        rx="38"
        ry="6"
        fill="#22d3ee"
        opacity="0.15"
        filter="url(#hf-soft-glow)"
      />
    </svg>
  );
}
