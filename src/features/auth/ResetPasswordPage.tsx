import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, AlertTriangle, CheckCircle2, KeyRound } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useAuth } from '@/store/auth';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/store/auth';

/**
 * /auth/reset-password?token=...
 * Şifre sıfırlama akışı — adım 2: kullanıcı maildeki linke tıklar, yeni şifre belirler.
 * Backend confirm-reset endpoint'i token'ı doğrular + şifreyi günceller + JWT cookie set eder.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const token = search.get('token') ?? '';

  const refresh = useAuth((s) => s.refresh);

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) setError('Sıfırlama bağlantısı eksik veya bozuk. Yeni bir bağlantı iste.');
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError('Şifre en az 8 karakter olmalı');
      return;
    }
    if (pw !== pw2) {
      setError('Şifreler eşleşmiyor');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/auth/confirm-reset', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: pw }),
      });
      const j = (await r.json()) as { ok: boolean; user?: SessionUser; error?: string };
      if (!j.ok) {
        setError(j.error ?? 'Şifre güncellenemedi');
        return;
      }
      // Backend cookie set etti → auth store'u tazele
      await refresh();
      setSuccess(true);
      // 2 saniye sonra panele yönlendir
      setTimeout(() => navigate('/panel', { replace: true }), 1800);
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
          <h1 className="bg-gradient-to-r from-slate-100 via-slate-300 to-slate-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            HANE FİNANS
          </h1>
          <p lang="en" className="text-xs tracking-[0.3em] text-accent/80">SET NEW PASSWORD</p>
        </div>

        <div className="glass-card p-6">
          {success ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
                <CheckCircle2 size={28} />
              </div>
              <h2 className="text-lg font-semibold text-slate-100">Şifren güncellendi</h2>
              <p className="text-sm text-slate-400">Panele yönlendiriliyorsun…</p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
                  <KeyRound size={16} />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">Yeni şifre belirle</h2>
                  <p className="text-[11px] text-slate-500">En az 8 karakter — güçlü bir şifre seç</p>
                </div>
              </div>

              <form className="mt-4 space-y-3" onSubmit={onSubmit}>
                <div>
                  <label className="label">Yeni şifre</label>
                  <PasswordInput
                    required
                    minLength={8}
                    placeholder="En az 8 karakter"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">Yeni şifre (tekrar)</label>
                  <PasswordInput
                    required
                    minLength={8}
                    placeholder="Tekrar gir"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                    <AlertTriangle size={12} /> {error}
                  </div>
                )}

                <button
                  type="submit"
                  className={cn('btn-primary w-full', loading && 'opacity-70')}
                  disabled={loading || !token}
                >
                  {loading ? 'Güncelleniyor…' : 'Şifremi güncelle'}
                  <ArrowRight size={14} />
                </button>
              </form>

              <div className="mt-4 text-center text-xs text-slate-500">
                <Link to="/auth/login" className="text-accent hover:underline">← Giriş sayfasına dön</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
