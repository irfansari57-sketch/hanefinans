import { useEffect, useState } from 'react';
import { ShieldAlert, X, RefreshCw, ArrowRight } from 'lucide-react';
import { useAuth, isAdmin, isEmailVerified } from '@/store/auth';
import { FEATURES } from '@/lib/featureFlags';
import { cn } from '@/lib/utils';

const VERIFY_TOKEN_KEY = 'fa.auth.verifyToken';
const SNOOZE_KEY = 'fa.auth.emailVerifyBannerSnooze';
const SNOOZE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

/**
 * Email doğrulaması bekleyen kullanıcılara üstte uyarı banner'ı.
 * "Doğrula" tıklanınca inline kod girişi açılır; backend send-code/verify-code.
 * Admin ve doğrulanmış kullanıcılar görmez.
 */
export function EmailVerifyBanner() {
  const user = useAuth((s) => s.user);
  const markEmailVerified = useAuth((s) => s.markEmailVerified);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!FEATURES.emailVerification) {
      setVisible(false);
      return;
    }
    if (!user) {
      setVisible(false);
      return;
    }
    if (isAdmin(user) || isEmailVerified(user)) {
      setVisible(false);
      return;
    }
    try {
      const snoozedAt = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
      if (Date.now() - snoozedAt < SNOOZE_TTL_MS) {
        setVisible(false);
        return;
      }
      // Önceki signup'tan kalan token varsa kullan
      const saved = localStorage.getItem(VERIFY_TOKEN_KEY);
      if (saved) setToken(saved);
    } catch { /* ignore */ }
    setVisible(true);
  }, [user]);

  if (!visible || !user) return null;

  const snooze = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* ignore */ }
    setVisible(false);
  };

  const requestCode = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const r = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const j = (await r.json()) as { ok: boolean; token?: string; error?: string };
      if (!j.ok || !j.token) {
        setError(j.error ?? 'Kod gönderilemedi');
        return;
      }
      setToken(j.token);
      try { localStorage.setItem(VERIFY_TOKEN_KEY, j.token); } catch { /* ignore */ }
      setInfo('Kod e-postana gönderildi (spam klasörüne de bak).');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!token || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, code: code.trim() }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? 'Kod yanlış');
        return;
      }
      await markEmailVerified();
      try { localStorage.removeItem(VERIFY_TOKEN_KEY); } catch { /* ignore */ }
      setInfo('Hesabın doğrulandı! ✓');
      setOpen(false);
      setTimeout(() => setVisible(false), 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky top-0 z-30 border-b border-warning/40 bg-warning/10 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-2 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ShieldAlert size={14} className="text-warning" />
          <span className="text-slate-200">
            <strong className="text-warning">E-posta doğrulanmadı</strong>
            <span className="ml-1 text-slate-400">— {user.email}</span>
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {!open ? (
              <>
                <button
                  onClick={() => {
                    setOpen(true);
                    if (!token) requestCode();
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/15 px-2 py-1 text-[11px] font-semibold text-warning hover:bg-warning/25"
                >
                  Doğrula <ArrowRight size={11} />
                </button>
                <button
                  onClick={snooze}
                  className="rounded-md p-1 text-slate-500 hover:bg-bg-card hover:text-slate-200"
                  aria-label="24 saat ertele"
                  title="24 saat ertele"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <button onClick={() => setOpen(false)} className="text-[11px] text-slate-500 hover:text-slate-300">
                Kapat
              </button>
            )}
          </div>
        </div>

        {open && (
          <div className="flex flex-wrap items-end gap-2 border-t border-warning/20 pt-2">
            <div className="flex-1 min-w-[180px]">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input w-full text-center font-mono text-base tracking-[0.4em]"
                autoFocus
              />
            </div>
            <button
              onClick={verify}
              disabled={busy || code.length !== 6 || !token}
              className={cn('btn-primary text-xs', busy && 'opacity-70')}
            >
              {busy ? 'Doğrulanıyor…' : 'Onayla'}
            </button>
            <button
              onClick={requestCode}
              disabled={busy}
              className="btn-secondary text-xs"
              title="Yeni kod gönder"
            >
              <RefreshCw size={11} /> Yeniden gönder
            </button>
          </div>
        )}

        {error && (
          <div className="text-[11px] text-danger">⚠ {error}</div>
        )}
        {info && !error && (
          <div className="text-[11px] text-success">✓ {info}</div>
        )}
      </div>
    </div>
  );
}
