import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, User as UserIcon, ArrowRight, AlertTriangle, Sparkles, ShieldCheck, RefreshCw } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { useAuth } from '@/store/auth';
import { cn } from '@/lib/utils';

interface Props {
  mode: 'login' | 'signup';
}

const VERIFY_TOKEN_KEY = 'fa.auth.verifyToken';
const RESEND_COOLDOWN_SEC = 60;

export function AuthPage({ mode }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const signup = useAuth((s) => s.signup);
  const login = useAuth((s) => s.login);
  const markEmailVerified = useAuth((s) => s.markEmailVerified);
  const loading = useAuth((s) => s.loading);

  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Email verification state
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const requestCode = async (targetEmail: string): Promise<boolean> => {
    setError(null);
    try {
      const r = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      const j = (await r.json()) as { ok: boolean; token?: string; error?: string };
      if (!j.ok || !j.token) {
        setError(j.error ?? 'Doğrulama kodu gönderilemedi');
        return false;
      }
      setVerifyToken(j.token);
      try { localStorage.setItem(VERIFY_TOKEN_KEY, j.token); } catch { /* ignore */ }
      setResendCooldown(RESEND_COOLDOWN_SEC);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'login') {
      const r = await login({ email, password });
      if (!r.ok) {
        setError(r.error ?? 'Bilinmeyen hata');
        return;
      }
      const next = (location.state as { from?: string } | null)?.from ?? '/panel';
      navigate(next, { replace: true });
      return;
    }

    // signup akışı
    const r = await signup({ email, password, name });
    if (!r.ok) {
      setError(r.error ?? 'Bilinmeyen hata');
      return;
    }
    // Admin email'leri doğrulanmış sayılır → direkt panele
    const sent = await requestCode(email.trim().toLowerCase());
    if (sent) {
      setStep('verify');
    } else {
      // Backend yapılandırılmamışsa veya hata varsa, kullanıcıyı yine de panele al
      // (kayıt başarılı, doğrulama sonra yapılabilir)
      const next = (location.state as { from?: string } | null)?.from ?? '/panel';
      navigate(next, { replace: true });
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!verifyToken) {
      setError('Token eksik — kodu yeniden iste');
      return;
    }
    setVerifyBusy(true);
    try {
      const r = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken, code: verifyCode.trim() }),
      });
      const j = (await r.json()) as { ok: boolean; email?: string; error?: string };
      if (!j.ok) {
        setError(j.error ?? 'Kod yanlış veya süresi dolmuş');
        return;
      }
      await markEmailVerified();
      try { localStorage.removeItem(VERIFY_TOKEN_KEY); } catch { /* ignore */ }
      const next = (location.state as { from?: string } | null)?.from ?? '/panel';
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifyBusy(false);
    }
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

        {step === 'verify' ? (
          <div className="glass-card p-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
                <ShieldCheck size={16} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-100">E-posta doğrulama</h2>
                <p className="text-[11px] text-slate-500">Botları önlemek için kayıt mailini onayla</p>
              </div>
            </div>

            <p className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-slate-300">
              <strong className="text-accent">{email}</strong> adresine 6 haneli kod gönderdik. Spam/Junk klasörünü de
              kontrol et. Kod <strong className="text-warning">15 dakika</strong> geçerlidir.
            </p>

            <form className="mt-4 space-y-3" onSubmit={onVerify}>
              <div>
                <label className="label">Doğrulama kodu</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  className="input text-center font-mono text-xl tracking-[0.4em]"
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                  <AlertTriangle size={12} /> {error}
                </div>
              )}

              <button
                type="submit"
                className={cn('btn-primary w-full', verifyBusy && 'opacity-70')}
                disabled={verifyBusy || verifyCode.length !== 6}
              >
                {verifyBusy ? 'Doğrulanıyor…' : 'Hesabımı aktifleştir'} <ArrowRight size={14} />
              </button>

              <div className="flex items-center justify-between pt-2 text-[11px] text-slate-500">
                <button
                  type="button"
                  onClick={async () => {
                    if (resendCooldown > 0) return;
                    await requestCode(email);
                  }}
                  disabled={resendCooldown > 0}
                  className="inline-flex items-center gap-1 text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                >
                  <RefreshCw size={11} />
                  {resendCooldown > 0 ? `Yeniden gönder (${resendCooldown}s)` : 'Yeniden gönder'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="hover:text-slate-300"
                >
                  ← Email değiştir
                </button>
              </div>
            </form>

            <p className="mt-4 rounded border border-border bg-bg-soft p-2.5 text-[10px] leading-relaxed text-slate-500">
              <strong>Doğrulamayı atlayabilirsin</strong> — hesabın oluşturuldu, panele girebilirsin. Ama bazı PRO/admin
              özellikleri ve gerçek ödeme akışı için email doğrulaması gerekecek.{' '}
              <button
                type="button"
                onClick={() => {
                  const next = (location.state as { from?: string } | null)?.from ?? '/panel';
                  navigate(next, { replace: true });
                }}
                className="text-accent hover:underline"
              >
                Sonra yaparım →
              </button>
            </p>
          </div>
        ) : (
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
                  📧 Kayıt sonrası e-posta adresine 6 haneli kod gönderilir (bot kontrolü).
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
        )}

        <p className="mt-4 text-center text-xs text-slate-500">
          Üye olmadan da uygulamayı kullanabilirsin. <Link to="/panel" className="text-accent hover:underline">Devam et →</Link>
        </p>
      </div>
    </div>
  );
}

export function LoginPage() { return <AuthPage mode="login" />; }
export function SignupPage() { return <AuthPage mode="signup" />; }
