import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * PremiumCard — Site genelinde tutarlı 3D depth + gradient surface kart bileşeni.
 *
 * MarketSummaryPremium'daki başarılı tasarım dilini (gradient + uzun gölge + inset highlight)
 * tüm sayfalara yaygınlaştırmak için. Stil değişimleri tek noktadan yönetilir.
 *
 * @example
 * <PremiumCard accent="cyan" hover="lift">
 *   <h3>Başlık</h3>
 *   <p>İçerik</p>
 * </PremiumCard>
 */

export type PremiumCardAccent =
  | 'cyan'      // varsayılan turkuaz (accent rengi)
  | 'warning'   // sarı/altın — kıymetli madenler için
  | 'success'   // yeşil — pozitif metrikler
  | 'danger'    // kırmızı — uyarılar
  | 'fuchsia'   // mor — kripto için
  | 'slate'     // nötr/tarafsız
  | 'none';     // border yok, sadece zemin

export type PremiumCardHover = 'lift' | 'glow' | 'none';
export type PremiumCardDensity = 'compact' | 'comfortable' | 'spacious';

interface PremiumCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Border ve hafif tint rengi */
  accent?: PremiumCardAccent;
  /** Hover davranışı */
  hover?: PremiumCardHover;
  /** İç padding yoğunluğu */
  density?: PremiumCardDensity;
  /** Üst sağ köşede vurgulu rozet (örn. "Pin'li", "Yeni", "PRO") */
  badge?: ReactNode;
  /** Tıklanabilir mi (cursor + a11y için) */
  interactive?: boolean;
}

const ACCENT_BORDER: Record<PremiumCardAccent, string> = {
  cyan:    'border-accent/25 hover:border-accent/50',
  warning: 'border-warning/25 hover:border-warning/50',
  success: 'border-success/25 hover:border-success/50',
  danger:  'border-danger/25 hover:border-danger/50',
  fuchsia: 'border-fuchsia-500/25 hover:border-fuchsia-500/50',
  slate:   'border-slate-700/30 hover:border-slate-700/50',
  none:    'border-transparent',
};

const DENSITY_PAD: Record<PremiumCardDensity, string> = {
  compact:     'p-2.5 sm:p-3',
  comfortable: 'p-3 sm:p-4',
  spacious:    'p-4 sm:p-5',
};

const HOVER_FX: Record<PremiumCardHover, string> = {
  lift: cn(
    'shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.06)]',
    'hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.1)]',
    'hover:-translate-y-0.5',
  ),
  glow: cn(
    'shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.05)]',
    'hover:shadow-[0_0_24px_-4px_rgba(34,211,238,0.35),inset_0_1px_0_0_rgba(255,255,255,0.08)]',
  ),
  none: 'shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.05)]',
};

export const PremiumCard = forwardRef<HTMLDivElement, PremiumCardProps>(function PremiumCard(
  {
    accent = 'cyan',
    hover = 'lift',
    density = 'comfortable',
    badge,
    interactive,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        // base: gradient surface + relative pozisyon (badge için)
        'relative rounded-xl border transition-all duration-200',
        'bg-gradient-to-br from-bg-card/85 via-bg-card/60 to-bg-soft/40',
        DENSITY_PAD[density],
        HOVER_FX[hover],
        ACCENT_BORDER[accent],
        interactive && 'cursor-pointer',
        className,
      )}
      {...rest}
    >
      {badge && (
        <div className="absolute right-2 top-2 z-10">
          {badge}
        </div>
      )}
      {children}
    </div>
  );
});

/**
 * Kategori başlık bandı — PremiumCard içinde grup başlıklarında kullanılır.
 *
 * @example
 * <PremiumCard>
 *   <PremiumCardHeader icon={<BarChart3 />} label="ENDEKS & DÖVİZ" />
 *   {children}
 * </PremiumCard>
 */
interface PremiumCardHeaderProps {
  icon?: ReactNode;
  label: string;
  className?: string;
}

export function PremiumCardHeader({ icon, label, className }: PremiumCardHeaderProps) {
  return (
    <div className={cn('mb-1 flex items-center gap-1.5 border-b border-slate-700/40 pb-2', className)}>
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 sm:text-[11px]">
        {label}
      </span>
    </div>
  );
}
