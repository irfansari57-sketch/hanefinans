import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
  /** İçindeki hex grid + glow ışıması */
  variant?: 'icon' | 'full';
}

/**
 * Hane Finans — 3D Metal Forge logo.
 * Çoklu gradyan + iç gölge + dış parıltı, kabartmalı "H" harfi, neon trend.
 */
export function Logo({ size = 40, className, variant = 'icon' }: LogoProps) {
  if (variant === 'full') {
    return (
      <div className={cn('inline-flex items-center gap-3', className)}>
        <LogoIcon size={size} />
        <div className="flex flex-col leading-tight">
          <span className="logo-text-3d text-xl font-extrabold tracking-tight">
            HANE FINANS
          </span>
          {/* lang="en" — Türkçe locale'da "I" → "İ" dönüşmesini engeller */}
          <span lang="en" className="mt-0.5 text-[11px] tracking-[0.18em] text-accent/85 font-semibold">
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
      height={size}
      viewBox="0 0 80 80"
      className={cn('drop-shadow-[0_3px_8px_rgba(0,0,0,0.5)]', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Chrome gradient — üstten alta metal */}
        <linearGradient id="hf3d-chrome" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="22%" stopColor="#cbd5e1" />
          <stop offset="50%" stopColor="#64748b" />
          <stop offset="78%" stopColor="#334155" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        {/* İç oyuk derinliği */}
        <radialGradient id="hf3d-depth" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="70%" stopColor="#020617" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>

        {/* Cyan iç ışıma */}
        <radialGradient id="hf3d-cyan" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#0891b2" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#0e7490" stopOpacity="0" />
        </radialGradient>

        {/* H harfi metali (sol-üst ışık kaynağı) */}
        <linearGradient id="hf3d-h" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="35%" stopColor="#cbd5e1" />
          <stop offset="70%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>

        {/* H alt gölge (3D kabartma için) */}
        <linearGradient id="hf3d-h-shadow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>

        {/* Üst cam parlaklık */}
        <linearGradient id="hf3d-glass" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Neon glow filtresi */}
        <filter id="hf3d-neon" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* İç gölge filtresi — hex çerçeveye derinlik */}
        <filter id="hf3d-inset" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="b" />
          <feOffset dx="0" dy="1.5" result="o" />
          <feComposite in="o" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="i" />
          <feFlood floodColor="#000" floodOpacity="0.7" />
          <feComposite in2="i" operator="in" />
          <feComposite in2="SourceGraphic" operator="over" />
        </filter>
      </defs>

      {/* 1. Dış kalkan — metalik chrome hexagon */}
      <polygon
        points="40,3 71,21 71,59 40,77 9,59 9,21"
        fill="url(#hf3d-chrome)"
        stroke="#0f172a"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />

      {/* 2. Üst yarı parlaklık (3D bombesi) */}
      <polygon
        points="40,3 71,21 71,40 9,40 9,21"
        fill="url(#hf3d-glass)"
        opacity="0.5"
      />

      {/* 3. İç oyuk (gömme) */}
      <polygon
        points="40,12 63,26 63,54 40,68 17,54 17,26"
        fill="url(#hf3d-depth)"
        filter="url(#hf3d-inset)"
      />

      {/* 4. Cyan iç ışıma */}
      <polygon
        points="40,12 63,26 63,54 40,68 17,54 17,26"
        fill="url(#hf3d-cyan)"
      />

      {/* 5. Bevel ring — iç çerçeve parlaklığı */}
      <polygon
        points="40,12 63,26 63,54 40,68 17,54 17,26"
        fill="none"
        stroke="#475569"
        strokeWidth="0.7"
        opacity="0.85"
      />
      <polygon
        points="40,13.5 61.5,27 61.5,53 40,66.5 18.5,53 18.5,27"
        fill="none"
        stroke="#0f172a"
        strokeWidth="0.5"
        opacity="0.9"
      />

      {/* 6. Neon trend grafik çizgisi — dipte akıyor */}
      <polyline
        points="20,55 28,50 35,52 42,42 49,44 56,34 62,36"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#hf3d-neon)"
        opacity="0.95"
      />

      {/* 7. H harfi — 3D kabartma — alt gölge katmanı */}
      <g transform="translate(1.2,1.2)" opacity="0.85">
        <rect x="25.5" y="22" width="6.5" height="34" rx="1.2" fill="url(#hf3d-h-shadow)" />
        <rect x="48" y="22" width="6.5" height="34" rx="1.2" fill="url(#hf3d-h-shadow)" />
        <rect x="31.5" y="36" width="17" height="8" rx="1.2" fill="url(#hf3d-h-shadow)" />
      </g>

      {/* 8. H harfi — üst metal katmanı */}
      <g>
        <rect x="25.5" y="22" width="6.5" height="34" rx="1.2" fill="url(#hf3d-h)" stroke="#0f172a" strokeWidth="0.4" />
        <rect x="48" y="22" width="6.5" height="34" rx="1.2" fill="url(#hf3d-h)" stroke="#0f172a" strokeWidth="0.4" />
        <rect x="31.5" y="36" width="17" height="8" rx="1.2" fill="url(#hf3d-h)" stroke="#0f172a" strokeWidth="0.4" />
      </g>

      {/* 9. H üst kenar highlight — beyaz tepe ışığı */}
      <g opacity="0.55">
        <rect x="26" y="22.3" width="5.5" height="0.9" rx="0.4" fill="#ffffff" />
        <rect x="48.5" y="22.3" width="5.5" height="0.9" rx="0.4" fill="#ffffff" />
        <rect x="32" y="36.3" width="16" height="0.9" rx="0.4" fill="#ffffff" />
      </g>

      {/* 10. Üst arc reflection — cam yansıması */}
      <path
        d="M 17,24 Q 40,8 63,24"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1"
        opacity="0.25"
        strokeLinecap="round"
      />

      {/* 11. Tepe ışık noktası */}
      <circle cx="40" cy="6" r="1.6" fill="#ffffff" opacity="0.95" />
      <circle cx="40" cy="6" r="3" fill="#ffffff" opacity="0.3" filter="url(#hf3d-neon)" />
    </svg>
  );
}
