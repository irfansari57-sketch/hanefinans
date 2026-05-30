import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { toast } from '@/components/ui/Toast';

/**
 * "Hesabımı Sil" — kullanıcı kendi hesabını şifre onayıyla kalıcı siler.
 * /api/auth/delete-account endpoint'ine POST atar, başarılı olursa logout edip
 * 500ms sonra ana sayfaya yönlendirir.
 */
export function DeleteAccountSection() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!password) {
      setError('Şifreni gir');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/delete-account', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? 'Silinemedi');
        return;
      }
      // Logout state'ini temizle ve panele yönlendir
      toast.success('Hesabın silindi');
      await logout();
      setTimeout(() => { window.location.href = '/'; }, 500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-xs leading-relaxed text-slate-400">
        Hesabını kalıcı olarak silmek istiyorsan aşağıdan onaylayabilirsin. Hesap silindikten sonra geri alınamaz; oturumun
        kapanır ve <strong className="text-slate-200">{user?.email}</strong> ile bağlı tüm veriler (üyelik, ödeme geçmişi)
        silinir. Tarayıcıdaki yerel veriler (watchlist, portföy, alarmlar) etkilenmez.
      </p>

      {!confirmOpen ? (
        <button
          onClick={() => setConfirmOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/20"
        >
          <X size={12} /> Hesabımı silmek istiyorum
        </button>
      ) : (
        <div className="mt-3 space-y-2 rounded-lg border border-danger/30 bg-bg-card p-3">
          <p className="text-xs text-slate-300">Devam etmek için şifreni gir:</p>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Şifren"
            autoFocus
            showLockIcon={false}
          />
          {error && <div className="text-xs text-danger">⚠ {error}</div>}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleDelete}
              disabled={busy || !password}
              className="inline-flex items-center gap-1 rounded-md border border-danger/40 bg-danger/15 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger/25 disabled:opacity-50"
            >
              {busy ? 'Siliniyor…' : 'Kalıcı olarak sil'}
            </button>
            <button
              onClick={() => { setConfirmOpen(false); setPassword(''); setError(null); }}
              disabled={busy}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </>
  );
}
