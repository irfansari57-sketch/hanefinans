import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Newspaper,
  Globe,
  Star,
  Settings,
  Menu,
  X,
  Search,
  Bell,
  User,
  TrendingUp,
  History,
  PiggyBank,
  Sun,
  Flame,
  GraduationCap,
  BadgeCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgents } from '@/store/agents';
import { MOCK_STOCKS } from '@/data/mock';
import { activityRepo } from '@/data/repositories';
import { RightNewsTicker } from '@/components/domain/RightNewsTicker';
import { AuthButton } from '@/components/auth/AuthButton';
import { YoutubeWidget } from '@/components/domain/YoutubeWidget';
import { Logo } from '@/components/brand/Logo';

const navGroups: Array<{ title: string; items: Array<{ to: string; label: string; icon: typeof LayoutDashboard; pro?: boolean }> }> = [
  {
    title: 'Genel',
    items: [
      { to: '/panel', label: 'Panel', icon: LayoutDashboard },
      { to: '/morning', label: 'Günlük Analiz', icon: Sun },
      { to: '/recommendations', label: 'Öneriler', icon: Flame, pro: false },
    ],
  },
  {
    title: 'Piyasalar',
    items: [
      { to: '/news', label: 'Gelişmeler', icon: Newspaper },
      { to: '/macro', label: 'Makro', icon: Globe },
      { to: '/watchlist', label: 'Takip Listem', icon: Star },
      { to: '/funds', label: 'Fonlar', icon: PiggyBank },
    ],
  },
  {
    title: 'Eğitim',
    items: [
      { to: '/egitim', label: 'Finansal Okuryazarlık', icon: GraduationCap },
    ],
  },
  {
    title: 'Hesap',
    items: [
      { to: '/uyelik', label: 'Üyelik', icon: BadgeCheck },
      { to: '/history', label: 'Geçmiş', icon: History },
      { to: '/settings', label: 'Ayarlar', icon: Settings },
    ],
  },
];

const allNavItems = navGroups.flatMap((g) => g.items);

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMockMode = useAgents((s) => s.isMockMode());

  const closeMobile = () => setMobileOpen(false);

  const suggestions = query.trim()
    ? MOCK_STOCKS.filter(
        (s) =>
          s.symbol.toLowerCase().includes(query.toLowerCase()) ||
          s.name.toLowerCase().includes(query.toLowerCase()),
      ).slice(0, 6)
    : [];

  useEffect(() => {
    setSearchOpen(query.trim().length > 0);
  }, [query]);

  useEffect(() => {
    activityRepo.log({ type: 'page-view', detail: location.pathname }).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const t = setTimeout(() => {
      activityRepo.log({ type: 'search', detail: query.trim() }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative flex min-h-screen bg-bg">
      {/* Finansal sahne — şehir + neon grafik + bokeh */}
      <div className="bg-finance-scene" aria-hidden="true" />
      <div className="bg-darken" aria-hidden="true" />
      <div className="bg-finance-mesh" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-15" aria-hidden="true" />

      {/* Desktop sidebar */}
      <aside className="relative z-10 hidden border-r border-border bg-bg-soft/85 backdrop-blur-md md:flex md:w-60 md:flex-col">
        <Link to="/panel" className="block border-b border-border px-4 py-3.5 transition hover:bg-bg-card/50">
          <Logo variant="full" size={36} />
        </Link>
        <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
          {navGroups.map((group) => (
            <div key={group.title}>
              <div className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all',
                        isActive
                          ? 'bg-gradient-to-r from-accent/15 to-accent/5 text-accent shadow-sm shadow-accent/10 ring-1 ring-accent/20'
                          : 'text-slate-400 hover:translate-x-0.5 hover:bg-bg-card hover:text-slate-100',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon size={15} className={cn('transition-transform group-hover:scale-110', isActive && 'drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]')} />
                        <span>{item.label}</span>
                        {item.pro && (
                          <span className="ml-auto rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">
                            PRO
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-center text-[10px] text-slate-500">
          <span className="text-accent/80">v0.2</span> • Hafta 0 önizleme
        </div>
      </aside>

      <div className="relative z-10 flex flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-bg-soft/90 px-4 py-3 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="md:hidden rounded-md p-1 text-slate-300 hover:bg-bg-card"
            aria-label="Menü"
          >
            <Menu size={20} />
          </button>

          <Link to="/panel" className="md:hidden">
            <Logo size={32} />
          </Link>

          <div className="relative flex-1 max-w-xl">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9 hidden md:block"
              placeholder="Hisse ara (örn: THYAO)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query && setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            />
            <input
              className="input pl-9 md:hidden"
              placeholder="Hisse ara…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query && setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            />
            {searchOpen && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-border bg-bg-card shadow-xl">
                {suggestions.map((s) => (
                  <button
                    key={s.symbol}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setQuery('');
                      setSearchOpen(false);
                      navigate(`/watchlist?focus=${encodeURIComponent(s.symbol)}`);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-bg-soft"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-accent">{s.symbol}</span>
                      <span className="text-slate-300">{s.name}</span>
                    </div>
                    <span className={s.changePct >= 0 ? 'text-success text-xs' : 'text-danger text-xs'}>
                      {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                'hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border',
                isMockMode
                  ? 'border-warning/30 bg-warning/10 text-warning'
                  : 'border-success/30 bg-success/10 text-success',
              )}
              title={isMockMode ? 'Bazı agent\'lar henüz mock' : 'Tüm akışlar canlı'}
            >
              <span className="relative inline-flex">
                <span className={cn('animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full opacity-75', isMockMode ? 'bg-warning' : 'bg-success')} />
                <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', isMockMode ? 'bg-warning' : 'bg-success')} />
              </span>
              {isMockMode ? 'Mock akış' : 'Canlı akış'}
            </span>
            <button
              type="button"
              className="hidden sm:inline-flex rounded-md p-1.5 text-slate-300 hover:bg-bg-card"
              aria-label="Bildirimler"
            >
              <Bell size={16} />
            </button>
            <AuthButton />
          </div>
        </header>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={closeMobile}>
            <div className="absolute inset-0 bg-black/60" />
            <aside
              className="absolute left-0 top-0 h-full w-72 bg-bg-soft p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <Logo variant="full" size={32} />
                <button
                  type="button"
                  onClick={closeMobile}
                  className="rounded p-1 text-slate-400 hover:bg-bg-card"
                  aria-label="Kapat"
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="space-y-0.5">
                {allNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={closeMobile}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                        isActive
                          ? 'bg-bg-card text-slate-100'
                          : 'text-slate-400 hover:bg-bg-card hover:text-slate-200',
                      )
                    }
                  >
                    <item.icon size={16} />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </aside>
          </div>
        )}

        <main key={location.pathname} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      {/* Sağ haber bandı — aşağıdan yukarı akan gündem */}
      <RightNewsTicker />

      {/* Sol alt köşede YouTube eğitim oynatıcı */}
      <YoutubeWidget />
    </div>
  );
}
