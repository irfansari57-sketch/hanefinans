import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, AlertTriangle, CheckCircle2, KeyRound } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { cn } from '@/lib/utils';

/**
 * /auth/forgot-password
 * Şifre sıfırlama isteği — kullanıcı email girer, backend Resend ile sıfırlama
 * linki gönderir. Backend (#Ö3) kullanıcı yoksa da 200 dön (enumeration savunması).
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch('/api/auth/request-reset', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), turnstileToken }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? 'Bir hata oluştu, tekrar dene');
        return;
      }
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
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
            Şifre Sıfırlama
          </p>
        </div>

        <div className="glass-card p-6">
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
                <CheckCircle2 size={28} />
              </div>
              <h2 className="text-lg font-semibold text-slate-100">E-postanı kontrol et</h2>
              <p className="text-sm text-slate-400">
                <strong className="text-accent">{email}</strong> adresine şifre sıfırlama bağlantısı gönderdik
                <span className="text-slate-500"> (e-posta kayıtlıysa)</span>. Bağlantı 30 dakika geçerli.
              </p>
              <p className="rounded-lg border border-border bg-bg-soft p-3 text-[11px] leading-relaxed text-slate-500">
                Maili bulamıyorsan <strong>spam/junk</strong> klasörünü de kontrol et. Birkaç dakika içinde gelmezse
                e-posta adresini doğru girdiğinden emin ol ve tekrar dene.
              </p>
              <Link to="/auth/login" className="btn-primary w-full">
                Giriş sayfasına dön <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
                  <KeyRound size={16} />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">Şifremi unuttum</h2>
                  <p className="text-[11px] text-slate-500">E-postana sıfırlama bağlantısı gönderelim</p>
                </div>
              </div>

              <form className="mt-4 space-y-3" onSubmit={onSubmit}>
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
                      autoFocus
                    />
                  </div>
                </div>

                <TurnstileWidget onToken={setTurnstileToken} action="forgot-password" />

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
                  {loading ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
                  <ArrowRight size={14} />
                </button>
              </form>

              <div className="mt-4 text-center text-xs text-slate-500">
                Hesabını hatırlıyor musun?{' '}
                <Link to="/auth/login" className="text-accent hover:underline">Giriş yap →</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
