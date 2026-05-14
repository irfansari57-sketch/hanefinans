import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, User as UserIcon, ArrowRight, AlertTriangle, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Logo } from '@/components/brand/Logo';
import { useAuth } from '@/store/auth';
import { cn } from '@/lib/utils';

interface Props {
  mode: 'login' | 'signup';
}

export function AuthPage({ mode }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const signup = useAuth((s) => s.signup);
  const login = useAuth((s) => s.login);
  const loading = useAuth((s) => s.loading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = mode === 'signup'
      ? await signup({ email, password, name })
      : await login({ email, password });
    if (!r.ok) {
      setError(r.error ?? 'Bilinmeyen hata');
      return;
    }
    const next = (location.state as { from?: string } | null)?.from ?? '/panel';
    navigate(next, { replace: true });
  };

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo size={72} />
          <h1 className="bg-gradient-to-r from-slate-100 via-slate-300 to-slate-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            HANE FİNANS
          </h1>
          <p className="text-xs uppercase tracking-[0.3em] text-accent/80">financial intelligence</p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">
              {mode === 'signup' ? 'Ücretsiz Hesap Oluştur' : 'Hesabına Giriş Yap'}
            </h2>
            <Link
              to={mode === 'signup' ? '/auth/login' : '/auth/signup'}
              className="text-xs text-accent hover:underline"
            >
              {mode === 'signup' ? 'Zaten üyeyim →' : 'Hesabım yok →'}
            </Link>
          </div>

          {mode === 'signup' && (
            <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-slate-300">
              <Sparkles size={12} className="mr-1.5 inline text-accent" />
              Ücretsiz hesapla: watchlist, alarmlar, panel ve sabah raporu. <strong className="text-accent">PRO</strong> üyelik
              gelişmiş analiz, Telegram raporları, sınırsız alarm sunar.
            </div>
          )}

          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            {mode === 'signup' && (
              <div>
                <label className="label">Ad (opsiyonel)</label>
                <div className="relative">
                  <UserIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    className="input pl-9"
                    placeholder="Adın"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="label">E-posta</label>
              <div className="relative">
                <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  className="input pl-9"
                  placeholder="ornek@mail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="label">Şifre</label>
              <div className="relative">
                <Lock size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  required
                  minLength={6}
                  className="input pl-9"
                  placeholder="En az 6 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>
              {mode === 'signup' && (
                <p className="mt-1 text-[11px] text-slate-500">
                  ⚠️ Mock auth: şifre tarayıcıda hashlenmiş halde saklanır. Gerçek güvenlik için Supabase Auth bağlanacak.
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                <AlertTriangle size={12} /> {error}
              </div>
            )}

            <button
              type="submit"
              className={cn('btn-primary w-full', loading && 'opacity-70')}
              disabled={loading}
            >
              {loading ? 'Devam ediliyor…' : mode === 'signup' ? 'Hesap oluştur' : 'Giriş yap'}
              <ArrowRight size={14} />
            </button>
          </form>

          <p className="mt-4 text-center text-[10px] text-slate-500">
            Kayıt olarak yerel veri saklama koşullarını kabul etmiş olursun.
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Üye olmadan da uygulamayı kullanabilirsin. <Link to="/panel" className="text-accent hover:underline">Devam et →</Link>
        </p>
      </div>
    </div>
  );
}

export function LoginPage() { return <AuthPage mode="login" />; }
export function SignupPage() { return <AuthPage mode="signup" />; }
