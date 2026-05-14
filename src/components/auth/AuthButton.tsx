import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Crown, Sparkles, User as UserIcon, Settings, ChevronDown, Zap, BadgeCheck } from 'lucide-react';
import { useAuth, isPro } from '@/store/auth';
import { cn } from '@/lib/utils';

export function AuthButton() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/auth/login" className="hidden sm:inline-flex btn-ghost text-xs">
          Giriş
        </Link>
        <Link
          to="/auth/signup"
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-accent to-cyan-500 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-accent-fg shadow-md shadow-accent/20 transition hover:brightness-110"
        >
          <Sparkles size={12} />
          <span className="hidden sm:inline">Ücretsiz Üye Ol</span>
          <span className="sm:hidden">Üye Ol</span>
        </Link>
      </div>
    );
  }

  const pro = isPro(user);
  const initial = (user.name?.[0] ?? user.email[0]).toUpperCase();

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-card px-1 py-1 pr-2.5 transition hover:border-accent/40"
        >
          <span
            className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-slate-100"
            style={{ background: user.avatarColor }}
          >
            {initial}
          </span>
          <span className="hidden sm:flex flex-col items-start leading-tight">
            <span className="text-[11px] font-medium text-slate-100 max-w-[120px] truncate">
              {user.name ?? user.email.split('@')[0]}
            </span>
            <span className={cn('text-[9px] font-bold uppercase tracking-wider', pro ? 'text-warning' : 'text-slate-500')}>
              {user.tier === 'elite' ? '👑 ELITE' : pro ? '⭐ PRO' : 'FREE'}
            </span>
          </span>
          <ChevronDown size={12} className="text-slate-400" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-lg border border-border bg-bg-card shadow-xl">
            <div className="border-b border-border px-3 py-2.5">
              <div className="text-xs text-slate-400">Hoş geldin,</div>
              <div className="truncate text-sm font-semibold text-slate-100">{user.name ?? user.email}</div>
              <div className="mt-1 text-[10px] text-slate-500">{user.email}</div>
            </div>

            {!pro && (
              <Link
                to="/uyelik"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 border-b border-border bg-warning/5 px-3 py-2 text-xs text-warning hover:bg-warning/10"
              >
                <Crown size={13} /> PRO'ya yükselt — ₺99/ay
                <Zap size={11} className="ml-auto" />
              </Link>
            )}

            <Link
              to="/uyelik"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-bg-soft"
            >
              <BadgeCheck size={13} /> Üyelik Yönetimi
            </Link>
            <Link
              to="/settings"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-bg-soft"
            >
              <Settings size={13} /> Ayarlar
            </Link>
            <button
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-danger hover:bg-danger/5"
            >
              <LogOut size={13} /> Çıkış yap
            </button>
          </div>
        )}
      </div>
    </>
  );
}
