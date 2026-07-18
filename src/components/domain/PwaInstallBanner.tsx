import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, X, Smartphone } from 'lucide-react';
import { getPwaInstallState, subscribePwaInstall, tryInstall, type PwaInstallState } from '@/lib/pwaInstall';

const DISMISSED_KEY = 'fa.pwaInstall.dismissedAt';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün
const VISIT_KEY = 'fa.pwaInstall.visitCount';
const MIN_VISITS = 2;

/**
 * PWA "Ana ekrana ekle" banner.
 */
export function PwaInstallBanner() {
  const location = useLocation();
  const [pwaState, setPwaState] = useState<PwaInstallState>(getPwaInstallState());
  const [visible, setVisible] = useState(false);
  const [thresholdMet, setThresholdMet] = useState(false);

  useEffect(() => {
    const unsub = subscribePwaInstall(setPwaState);
    return unsub;
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VISIT_KEY);
      const visits = (raw ? parseInt(raw, 10) : 0) + 1;
      localStorage.setItem(VISIT_KEY, String(visits));
      if (visits >= MIN_VISITS) setThresholdMet(true);
    } catch { /* localStorage yoksa */ }
  }, [location.pathname]);

  useEffect(() => {
    if (!thresholdMet) return;
    if (pwaState.isStandalone) return;
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
    if (Date.now() - dismissedAt < DISMISS_TTL_MS) return;

    if (pwaState.isIos) {
      const t = setTimeout(() => setVisible(true), 4000);
      return () => clearTimeout(t);
    }
    if (pwaState.canInstallNative) {
      setVisible(true);
    }
  }, [thresholdMet, pwaState]);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    const result = await tryInstall();
    if (result === 'accepted' || result === 'dismissed') {
      setVisible(false);
    }
  };

  const isIos = pwaState.isIos;

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 max-w-sm rounded-xl border border-accent/40 bg-bg-soft/95 p-3 shadow-2xl backdrop-blur-md md:bottom-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
          <Smartphone size={16} />
        </span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-100">InvestLiq uygulamasini yukle</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {isIos
              ? 'Safari de paylas ikonuna - Ana Ekrana Ekle ye dokun.'
              : 'Ana ekranina ekle - tarayicidan bagimsiz tam ekran.'}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            {!isIos && (
              <button
                onClick={install}
                className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
              >
                <Download size={11} /> Yukle
              </button>
            )}
            <button
              onClick={dismiss}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              {isIos ? 'Tamam' : '7 gun gizle'}
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
