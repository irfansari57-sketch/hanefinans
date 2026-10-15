import { NavLink } from 'react-router-dom';
import { Activity, Star, Wallet, Radar, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  onMoreClick: () => void;
}

// Design 03 (15 Eki 2026): Piyasa · Takip · Portföy · Sinyal · Daha
const TABS = [
  { to: '/panel', label: 'Piyasa', icon: Activity },
  { to: '/watchlist', label: 'Takip', icon: Star },
  { to: '/portfoy', label: 'Portföy', icon: Wallet },
  { to: '/signals', label: 'Sinyal', icon: Radar },
] as const;

/**
 * Mobil fiks alt bar — hamburger drawer yerine 4 ana hedef + "Daha" butonu.
 * Sadece md altında görünür; üstte 5. ikon "Daha" tıklanınca mevcut drawer açılır.
 * Gelişmeler ve diğer sayfalar "Daha" drawer'ında.
 */
export function MobileBottomNav({ onMoreClick }: MobileBottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-bg-soft md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Mobil ana gezinme"
    >
      <div className="grid grid-cols-5">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition',
                isActive ? 'text-accent' : 'text-fg-2 hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon size={20} className={cn(isActive && 'stroke-[2.2]')} />
                <span className="font-medium">{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onMoreClick}
          className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-fg-2 transition hover:text-fg"
        >
          <Menu size={20} />
          <span className="font-medium">Daha</span>
        </button>
      </div>
    </nav>
  );
}
