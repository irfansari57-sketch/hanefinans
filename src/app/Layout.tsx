import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Newspaper,
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
  Gem,
  Bitcoin,
  Wallet,
  Flag,
  Grid3x3,
  Globe,
  Coins,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgents } from '@/store/agents';
import { useAuth, isAdmin, isPro } from '@/store/auth';
import { BIST_UNIQUE } from '@/data/bistAll';
import { activityRepo } from '@/data/repositories';
import { RightNewsTicker } from '@/components/domain/RightNewsTicker';
import { AuthButton } from '@/components/auth/AuthButton';
import { Logo } from '@/components/brand/Logo';
import { ToastContainer } from '@/components/ui/Toast';
import { AdBanner } from '@/components/domain/AdBanner';
import { HaneModAdBanner } from '@/components/domain/HaneModAdBanner';
import { FeedbackWidget } from '@/components/domain/FeedbackWidget';
import { DisclaimerModal } from '@/components/domain/DisclaimerModal';
import { DisclaimerBody, DISCLAIMER_TITLE } from '@/components/domain/Disclaimer';
import { BrandingBlock } from '@/components/domain/BrandingBlock';
import { LegalLinksBlock } from '@/components/domain/LegalLinksBlock';
import { CookieConsent } from '@/components/domain/CookieConsent';
import { OnboardingTour } from '@/components/domain/OnboardingTour';
import { PwaInstallBanner } from '@/components/domain/PwaInstallBanner';
import { AlertWatcher } from '@/components/domain/AlertWatcher';
import { NewsWatcher } from '@/components/domain/NewsWatcher';
// EmailVerifyBanner: feature flag kapalı (FEATURES.emailVerification = false)
// — banner mount edilmez, eski kullanıcı cache'i de aşağıdaki effect ile temizlenir
import { MobileBottomNav } from '@/components/ui/MobileBottomNav';
import { ShieldAlert, ChevronDown } from 'lucide-react';

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; pro?: boolean; adminOnly?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const navGroups: NavGroup[] = [
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
      { to: '/watchlist', label: 'Takip Listem', icon: Star },
      { to: '/portfoy', label: 'Portföyüm', icon: Wallet },
      { to: '/stocks', label: 'Hisseler', icon: TrendingUp },
      { to: '/funds', label: 'Fonlar', icon: PiggyBank },
      { to: '/emtia', label: 'Emtialar', icon: Gem },
      { to: '/doviz', label: 'Döviz Kurları', icon: Coins },
      { to: '/kripto', label: 'Kripto', icon: Bitcoin },
      { to: '/abd', label: 'ABD Borsaları', icon: Flag, pro: true },
      { to: '/global', label: 'Global Piyasalar', icon: Globe, pro: true },
      { to: '/heatmap', label: 'Heat Map', icon: Grid3x3, pro: true },
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
      { to: '/history', label: 'Geçmiş', icon: History, adminOnly: true },
      { to: '/settings', label: 'Ayarlar', icon: Settings, adminOnly: true },
    ],
  },
];

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMockMode = useAgents((s) => s.isMockMode());
  const user = useAuth((s) => s.user);
  const admin = isAdmin(user);

  const visibleNavGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.adminOnly || admin) }))
    .filter((g) => g.items.length > 0);
  const allNavItems = visibleNavGroups.flatMap((g) => g.items);

  const closeMobile = () => setMobileOpen(false);

  const suggestions = query.trim()
    ? BIST_UNIQUE.filter(
        (s) =>
          s.symbol.toLowerCase().includes(query.toLowerCase()) ||
          s.name.toLowerCase().includes(query.toLowerCase()),
      ).slice(0, 8)
    : [];

  useEffect(() => {
    setSearchOpen(query.trim().length > 0);
  }, [query]);

  // Bir kerelik temizlik — email doğrulama feature'ı pasif edildi; eski
  // kullanıcıların localStorage'ında kalan banner/token anahtarlarını sil.
  // Plus: eski v1 mock-auth localStorage temizlenir (cloud auth'a geçildi)
  useEffect(() => {
    try {
      localStorage.removeItem('fa.auth.verifyToken');
      localStorage.removeItem('fa.auth.emailVerifyBannerSnooze');
      localStorage.removeItem('fa.auth.session.v1');
    } catch { /* ignore */ }
  }, []);

  // Cloud auth: cookie geçerli mi? Sayfa açılışta server'a sor + state'i sync et
  const authRefresh = useAuth((s) => s.refresh);
  useEffect(() => {
    authRefresh();
  }, [authRefresh]);

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
      <aside className="relative z-10 hidden border-r border-border bg-bg-soft/85 backdrop-blur-md md:flex md:w-64 md:flex-col">
        <Link to="/panel" className="block border-b border-border px-4 py-4 transition hover:bg-bg-card/50">
          <Logo variant="full" size={52} />
        </Link>
        <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
          {visibleNavGroups.map((group) => (
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

          {/* Yasal bilgilendirme linkleri — sidebar'ın en başında */}
          <div className="pt-3">
            <LegalLinksBlock />
          </div>

          {/* Hane Mod Studio görseli + 3D parlama başlık + © — sidebar branding (YouTube'un ÜSTÜNDE) */}
          <div className="pt-3">
            <BrandingBlock />
          </div>

          {/* YouTube banner (PRO'da gizli) — branding bloğunun altında */}
          {!isPro(user) && (
            <div className="pt-4">
              <div className="mb-1.5 px-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                Resmi YouTube
              </div>
              <HaneModAdBanner variant="compact" />
            </div>
          )}

          {/* YTD + KVKK Disclaimer — default açık, herkese görünür */}
          <details className="group mt-3 rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-2" open>
            <summary className="flex cursor-pointer items-center gap-2 list-none">
              <ShieldAlert size={12} className="shrink-0 text-warning" />
              <span className="flex-1 text-[11px] font-bold text-warning">{DISCLAIMER_TITLE}</span>
              <ChevronDown size={12} className="text-warning/70 transition group-open:rotate-180" />
            </summary>
            <div className="mt-2 max-h-72 overflow-y-auto pr-1">
              <DisclaimerBody compact />
            </div>
          </details>

          {/* Sponsor banner (PRO'da gizli) */}
          {!isPro(user) && (
            <div className="pt-3">
              <div className="mb-1.5 px-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                Sponsor
              </div>
              <AdBanner variant="compact" />
            </div>
          )}
        </nav>

        {/* Sidebar footer — yasal linkler + version */}
        <div className="border-t border-border bg-bg-soft/95 p-2.5 text-center text-[9px] text-slate-600">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
            <Link to="/legal/kvkk" className="hover:text-accent">KVKK</Link>
            <span>·</span>
            <Link to="/legal/mesafeli-satis-sozlesmesi" className="hover:text-accent">Mesafeli Satış</Link>
            <span>·</span>
            <Link to="/legal/uyelik-sozlesmesi" className="hover:text-accent">Üyelik</Link>
            <span>·</span>
            <Link to="/legal/iade-politikasi" className="hover:text-accent">İade</Link>
            <span>·</span>
            <Link to="/legal/cerez-politikasi" className="hover:text-accent">Çerezler</Link>
          </div>
          <div className="mt-1.5"><span className="text-accent/80">v0.2</span> • Hafta 0 önizleme</div>
        </div>
      </aside>

      <div className="relative z-10 flex flex-1 flex-col min-w-0">
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
                      // Direkt detay sayfasına git — canlı fiyat orada çekilir
                      navigate(`/stock/${encodeURIComponent(s.symbol)}`);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-bg-soft"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-accent">{s.symbol}</span>
                      <span className="text-slate-300">{s.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {s.sector}
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

        <main key={location.pathname} className="mx-auto w-full max-w-7xl flex-1 overflow-x-hidden px-3 py-4 pb-20 sm:px-6 sm:py-6 sm:pb-20 md:pb-6 lg:px-8">
          <Outlet />
        </main>

        {/* Mobil branding + reklam + disclaimer — desktop sidebar ile aynı sıra:
            CANLI VERİ → BRANDING → YouTube → YTD/KVKK → Sponsor */}
        <div className="md:hidden mx-auto w-full max-w-7xl border-t border-border px-3 pt-4 pb-2 space-y-3">
          {/* 0. Yasal bilgilendirme linkleri */}
          <LegalLinksBlock />

          {/* 1. Branding (görsel + 3D parlama başlık) — herkese */}
          <BrandingBlock />

          {/* 2. YouTube banner — PRO'da gizli */}
          {!isPro(user) && (
            <div>
              <div className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                Resmi YouTube
              </div>
              <HaneModAdBanner variant="compact" />
            </div>
          )}

          {/* 3. YTD + KVKK — default açık, herkese */}
          <details className="group rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5" open>
            <summary className="flex cursor-pointer items-center gap-2 list-none">
              <ShieldAlert size={13} className="shrink-0 text-warning" />
              <span className="flex-1 text-xs font-bold text-warning">{DISCLAIMER_TITLE}</span>
              <ChevronDown size={13} className="text-warning/70 transition group-open:rotate-180" />
            </summary>
            <div className="mt-2.5 max-h-80 overflow-y-auto pr-1">
              <DisclaimerBody compact />
            </div>
          </details>

          {/* 4. Sponsor banner — PRO'da gizli */}
          {!isPro(user) && (
            <div>
              <div className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                Sponsor
              </div>
              <AdBanner variant="compact" />
            </div>
          )}
        </div>

        {/* Mobil footer — yasal linkler + version (telif branding bloğunda) */}
        <footer className="md:hidden mx-auto w-full max-w-7xl border-t border-border px-3 py-3 text-center text-[10px] text-slate-500">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <Link to="/legal/kvkk" className="hover:text-accent">KVKK</Link>
            <span>·</span>
            <Link to="/legal/mesafeli-satis-sozlesmesi" className="hover:text-accent">Mesafeli Satış</Link>
            <span>·</span>
            <Link to="/legal/uyelik-sozlesmesi" className="hover:text-accent">Üyelik Sözleşmesi</Link>
            <span>·</span>
            <Link to="/legal/iade-politikasi" className="hover:text-accent">İade Politikası</Link>
            <span>·</span>
            <Link to="/legal/cerez-politikasi" className="hover:text-accent">Çerezler</Link>
          </div>
          <div className="mt-2 text-[9px] text-slate-600">
            <span className="text-accent/80">v0.2</span> • Hafta 0 önizleme
          </div>
        </footer>
      </div>

      {/* Sağ haber bandı — aşağıdan yukarı akan gündem */}
      <RightNewsTicker />

      {/* Geri bildirim widget */}
      <FeedbackWidget />

      {/* Toast notifications */}
      <ToastContainer />

      {/* İlk girişte YTD + KVKK onay pop-up'ı (localStorage'da accepted flag) */}
      <DisclaimerModal />

      {/* Çerez onay banner — KVKK+GDPR uyumlu, ilk ziyarette gösterilir */}
      <CookieConsent />

      {/* Mobil fiks alt bar — Panel/Gelişmeler/Takip/Portföy + Daha */}
      <MobileBottomNav onMoreClick={() => setMobileOpen(true)} />

      {/* İlk ziyarette 5 adımlık onboarding overlay (DisclaimerModal sonrasında) */}
      <OnboardingTour />

      {/* PWA "Ana ekrana ekle" banner — beforeinstallprompt + iOS Safari manuel */}
      <PwaInstallBanner />

      {/* Arka planda fiyat alarmı izleyici — Telegram + browser bildirimi tetikler */}
      <AlertWatcher />
      {/* Arka planda son dakika haber izleyici — push bildirimi tetikler (kullanıcı izniyle) */}
      <NewsWatcher />
    </div>
  );
}
