import { useState } from 'react';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { toast } from '@/components/ui/Toast';

/**
 * Şifre değiştirme bölümü — kullanıcı oturum açıkken mevcut şifresini onaylayıp
 * yeni şifre belirler. /api/auth/change-password endpoint'ine POST atar.
 * Yeni şifre min 8 karakter; backend de aynı kuralı zorlar (#Ö11).
 */
export function ChangePasswordSection() {
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!user) return null;

  const reset = () => {
    setCurrentPw('');
    setNewPw('');
    setNewPw2('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPw.length < 8) { setError('Yeni şifre en az 8 karakter olmalı'); return; }
    if (newPw !== newPw2) { setError('Yeni şifreler eşleşmiyor'); return; }
    if (newPw === currentPw) { setError('Yeni şifre eskisinden farklı olmalı'); return; }

    setBusy(true);
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? 'Güncellenemedi');
        return;
      }
      toast.success('Şifren güncellendi');
      setDone(true);
      reset();
      setTimeout(() => { setDone(false); setOpen(false); }, 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-xs leading-relaxed text-slate-400">
        Mevcut şifreni onaylayarak yeni bir şifre belirleyebilirsin. Şifre en az 8 karakter olmalı.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-soft px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-accent/50 hover:text-accent"
        >
          <KeyRound size={12} /> Şifre değiştir
        </button>
      ) : done ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <CheckCircle2 size={14} /> Şifren başarıyla güncellendi.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2.5 rounded-lg border border-border bg-bg-soft p-3">
          <div>
            <label className="label">Mevcut şifre</label>
            <PasswordInput
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              required
              showLockIcon={false}
            />
          </div>
          <div>
            <label className="label">Yeni şifre</label>
            <PasswordInput
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              placeholder="En az 8 karakter"
              showLockIcon={false}
            />
          </div>
          <div>
            <label className="label">Yeni şifre (tekrar)</label>
            <PasswordInput
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              showLockIcon={false}
            />
          </div>
          {error && <div className="text-xs text-danger">⚠ {error}</div>}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={busy || !currentPw || !newPw}
              className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-bg-base transition hover:bg-accent/90 disabled:opacity-50"
            >
              {busy ? 'Güncelleniyor…' : 'Şifreyi güncelle'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); reset(); }}
              disabled={busy}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}
    </>
  );
}
