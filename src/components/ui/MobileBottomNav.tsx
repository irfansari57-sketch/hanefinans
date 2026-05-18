import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Newspaper, Star, Wallet, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  onMoreClick: () => void;
}

const TABS = [
  { to: '/panel', label: 'Panel', icon: LayoutDashboard },
  { to: '/news', label: 'Gelişmeler', icon: Newspaper },
  { to: '/watchlist', label: 'Takip', icon: Star },
  { to: '/portfoy', label: 'Portföy', icon: Wallet },
] as const;

/**
 * Mobil fiks alt bar — hamburger drawer yerine 4 ana hedef + "Daha" butonu.
 * Sadece md altında görünür; üstte 5. ikon "Daha" tıklanınca mevcut drawer açılır.
 */
export function MobileBottomNav({ onMoreClick }: MobileBottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-bg-soft/95 backdrop-blur-md md:hidden"
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
                isActive ? 'text-accent' : 'text-slate-400 hover:text-slate-200',
              )
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon size={18} className={cn(isActive && 'drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]')} />
                <span className="font-medium">{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onMoreClick}
          className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-slate-400 transition hover:text-slate-200"
        >
          <Menu size={18} />
          <span className="font-medium">Daha</span>
        </button>
      </div>
    </nav>
  );
}
