import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, User as UserIcon, ArrowRight, AlertTriangle, Sparkles, ShieldCheck, RefreshCw } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { useAuth } from '@/store/auth';
import { FEATURES } from '@/lib/featureFlags';
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

  // Turnstile token — widget hazır olunca dolar; site key yoksa boş string (#Ö5)
  const [turnstileToken, setTurnstileToken] = useState<string>('');

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // OAuth callback hata mesaji — /auth/login?oauth_error=... ile gelir
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const err = params.get('oauth_error');
    if (err) {
      const messages: Record<string, string> = {
        not_configured: 'Sosyal giriş henüz aktif değil. Lütfen e-posta ile devam et.',
        access_denied: 'Sosyal giriş iptal edildi.',
        invalid_state: 'Güvenlik doğrulaması başarısız. Lütfen tekrar dene.',
        missing_code: 'Sağlayıcıdan kod alınamadı. Tekrar dene.',
        token_exchange_failed: 'Sağlayıcıdan token alınamadı. Tekrar dene.',
        userinfo_missing: 'Hesap bilgileri alınamadı (e-posta izni eksik olabilir).',
        db_error: 'Veritabanı hatası — destek ekibine bildir.',
      };
      setError(messages[err] ?? `Sosyal giriş hatası: ${err}`);
      // URL'i temizle (back tuşunda tekrar göstermesin)
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  const oauthRedirect = (provider: 'google' | 'apple') => {
    // Full page redirect — Google/Apple authorize sayfasi acilacak
    window.location.href = `/api/auth/oauth/${provider}/start`;
  };

  const requestCode = async (targetEmail: string): Promise<boolean> => {
    setError(null);
    try {
      const r = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, turnstileToken }),
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
      const r = await login({ email, password, turnstileToken });
      if (!r.ok) {
        setError(r.error ?? 'Bilinmeyen hata');
        return;
      }
      const next = (location.state as { from?: string } | null)?.from ?? '/panel';
      navigate(next, { replace: true });
      return;
    }

    // signup akışı
    const r = await signup({ email, password, name, turnstileToken });
    if (!r.ok) {
      setError(r.error ?? 'Bilinmeyen hata');
      return;
    }

    // Email doğrulama feature flag kapalıysa direkt panele
    if (!FEATURES.emailVerification) {
      const next = (location.state as { from?: string } | null)?.from ?? '/panel';
      navigate(next, { replace: true });
      return;
    }

    // Admin email'leri otomatik doğrulanmış sayılır
    const sent = await requestCode(email.trim().toLowerCase());
    if (sent) {
      setStep('verify');
    } else {
      // Backend yapılandırılmamışsa veya hata varsa, kullanıcıyı yine de panele al
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
          <h1 className="text-2xl font-extrabold tracking-tight">
            <span className="text-slate-900 dark:text-slate-100">Invest</span>
            <span className="text-emerald-600 dark:text-emerald-400">Liq</span>
          </h1>
          <p className="text-[11px] tracking-[0.2em] font-semibold uppercase text-emerald-700 dark:text-accent/85">
            Yatırımcılar İçin Akıllı Veri Platformu
          </p>
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
              <div className="flex items-center justify-between">
                <label className="label">Şifre</label>
                {mode === 'login' && (
                  <Link
                    to="/auth/forgot-password"
                    className="text-[11px] text-accent hover:underline"
                  >
                    Şifremi unuttum
                  </Link>
                )}
              </div>
              <PasswordInput
                required
                minLength={mode === 'signup' ? 8 : 6}
                placeholder={mode === 'signup' ? 'En az 8 karakter' : 'Şifren'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              {mode === 'signup' && FEATURES.emailVerification && (
                <p className="mt-1 text-[11px] text-slate-500">
                  📧 Kayıt sonrası e-posta adresine 6 haneli kod gönderilir (bot kontrolü).
                </p>
              )}
            </div>

            <TurnstileWidget onToken={setTurnstileToken} action={mode} />

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

          {/* Sosyal giris bolumu - Google + Apple. Feature flag ile pasif tutulur. */}
          {FEATURES.oauthSocialLogin && (
          <div className="mt-5">
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500">
              <div className="h-px flex-1 bg-border" />
              <span>veya</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => oauthRedirect('google')}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 hover:shadow-sm"
              >
                <svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Google ile devam et
              </button>

              <button
                type="button"
                onClick={() => oauthRedirect('apple')}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <svg width="14" height="16" viewBox="0 0 14 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                  <path d="M11.6 8.5c0-1.91 1.56-2.83 1.63-2.88-.89-1.3-2.27-1.48-2.76-1.5-1.17-.12-2.29.69-2.88.69-.6 0-1.51-.67-2.49-.65-1.28.02-2.46.75-3.12 1.88C.62 8.32 1.58 12 3.06 14c.72.98 1.58 2.07 2.71 2.03 1.09-.04 1.5-.7 2.82-.7 1.31 0 1.68.7 2.83.68 1.17-.02 1.91-.99 2.62-1.97.83-1.13 1.17-2.23 1.19-2.29-.03-.01-2.29-.88-2.31-3.5l.68-.75zM9.51 2.83c.6-.72 1-1.72.89-2.71-.86.03-1.9.57-2.51 1.29-.55.64-1.04 1.66-.91 2.63.95.07 1.93-.49 2.53-1.21z"/>
                </svg>
                Apple ile devam et
              </button>
            </div>
          </div>
          )}

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
