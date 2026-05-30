import { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

const DISMISSED_KEY = 'fa.pwaInstall.dismissedAt';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün
const VISIT_KEY = 'fa.pwaInstall.visitCount';
const MIN_VISITS = 2; // Kullanıcı en az 2 sayfa gezene kadar gösterme

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA "Ana ekrana ekle" banner — beforeinstallprompt event yakalanır.
 * Kullanıcı 7 gün dismiss ettikten sonra tekrar gösterilir.
 * iOS Safari için ayrı talimat kartı (Safari beforeinstallprompt yayınlamaz).
 */
export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
    if (Date.now() - dismissedAt < DISMISS_TTL_MS) return;

    // Standalone modda zaten kurulu — banner gösterme
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // Safari: navigator.standalone === true
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return;

    // Ziyaret sayısı eşiği — her sayfa açılışında +1, MIN_VISITS'a ulaşmadan
    // kullanıcıyı rahatsız etme. "Sevimsiz baskıcı prompt" hissi olmasın.
    let visits = 0;
    try {
      const raw = localStorage.getItem(VISIT_KEY);
      visits = (raw ? parseInt(raw, 10) : 0) + 1;
      localStorage.setItem(VISIT_KEY, String(visits));
    } catch { /* localStorage yoksa olduğu gibi devam */ }
    if (visits < MIN_VISITS) return;

    const ua = navigator.userAgent.toLowerCase();
    const iosLike = /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua);
    setIsIos(iosLike);
    if (iosLike) {
      // iOS Safari — manuel talimatlı banner
      const t = setTimeout(() => setVisible(true), 4000);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 max-w-sm rounded-xl border border-accent/40 bg-bg-soft/95 p-3 shadow-2xl backdrop-blur-md md:bottom-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
          <Smartphone size={16} />
        </span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-100">Hane Finans uygulamasını yükle</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {isIos
              ? 'Safari\'de paylaş ikonuna ▸ Ana Ekrana Ekle\'ye dokun. Tam ekran ve hızlı erişim.'
              : 'Ana ekranına ekle — tarayıcıdan bağımsız tam ekran, daha hızlı açılış.'}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            {!isIos && (
              <button
                onClick={install}
                className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
              >
                <Download size={11} /> Yükle
              </button>
            )}
            <button
              onClick={dismiss}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              {isIos ? 'Tamam' : '7 gün gizle'}
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="rounded p-1 text-slate-500 hover:bg-bg-card hover:text-slate-200"
          aria-label="Kapat"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
