import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquare, X, Send } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const user = useAuth((s) => s.user);
  const location = useLocation();

  const send = async () => {
    if (message.trim().length < 5) {
      toast.error('Mesaj çok kısa', 'En az 5 karakter');
      return;
    }
    setSending(true);
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          email: email.trim() || user?.email,
          page: location.pathname,
          userAgent: navigator.userAgent,
        }),
      });
      const j = await r.json() as { ok: boolean; message?: string; error?: string };
      if (j.ok) {
        toast.success('Teşekkürler!', 'Mesajın bize ulaştı, en kısa zamanda değerlendireceğiz.');
        setMessage('');
        setEmail('');
        setOpen(false);
      } else {
        toast.error('Gönderilemedi', j.error);
      }
    } catch (e) {
      toast.error('Ağ hatası', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Fixed sağ alt buton */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          // Mobilde MobileBottomNav (~56px) üstünde dursun; md+'da normal sağ alt
          'fixed right-3 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-fg shadow-lg shadow-accent/40 transition hover:brightness-110 hover:shadow-xl hover:shadow-accent/50',
          'bottom-[calc(env(safe-area-inset-bottom,0px)+72px)]',
          'md:bottom-4 md:right-4 md:px-4 md:py-2.5 md:text-sm',
          'lg:bottom-6 lg:right-6',
          open && 'hidden',
        )}
        title="Geri bildirim gönder"
      >
        <MessageSquare size={16} />
        <span className="hidden sm:inline">Geri Bildirim</span>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md rounded-xl border border-accent/30 bg-bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <MessageSquare size={14} className="text-accent" />
                Geri Bildirim Gönder
              </h3>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-slate-500 hover:bg-bg-soft hover:text-slate-200">
                <X size={14} />
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-400">
              Hata bildir, özellik öner veya görüş paylaş. Hızlıca dönüş yapacağız.
            </p>

            <div className="mt-3 space-y-2">
              <textarea
                className="input min-h-[120px] text-sm"
                placeholder="Hangi sayfa, ne öneriyorsun veya neyi raporluyorsun? Detaylı yaz, daha hızlı çözeriz."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                autoFocus
              />
              {!user && (
                <input
                  type="email"
                  className="input"
                  placeholder="E-posta (opsiyonel — dönüş için)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">{message.length}/2000</span>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setOpen(false)}>İptal</button>
                <button className="btn-primary" onClick={send} disabled={sending || message.trim().length < 5}>
                  <Send size={13} /> {sending ? 'Gönderiliyor…' : 'Gönder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
