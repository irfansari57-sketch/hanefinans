import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, Check, X } from 'lucide-react';

/**
 * KVKK + GDPR uyumlu çerez onay banner.
 * İlk ziyarette altta belirir; "Tümünü Kabul" / "Sadece Zorunlu" seçimleri var.
 * Karar localStorage'da tutulur; tekrar gösterilmez.
 */

const STORAGE_KEY = 'fa.cookies.consent.v1';

interface ConsentState {
  decision: 'all' | 'essential';
  decidedAt: number;
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        // 1 saniye gecikme — disclaimer modal'ı ile çakışmasın
        const t = setTimeout(() => setVisible(true), 1500);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const save = (decision: ConsentState['decision']) => {
    try {
      const state: ConsentState = { decision, decidedAt: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[95] p-3 sm:p-4">
      <div className="mx-auto max-w-5xl rounded-xl border border-accent/30 bg-bg-soft/95 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
          <div className="flex items-start gap-3 sm:flex-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
              <Cookie size={16} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-100">Çerez Kullanımı</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                Sitemizin temel işlevleri için <strong className="text-slate-300">zorunlu çerezler</strong>{' '}
                (oturum, güvenlik) ve tercihlerin için <strong className="text-slate-300">işlevsel çerezler</strong>{' '}
                kullanırız. Üçüncü taraf takip yapmıyoruz.{' '}
                <Link to="/legal/cerez-politikasi" className="text-accent hover:underline">
                  Çerez politikası
                </Link>
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
            <button
              type="button"
              onClick={() => save('essential')}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-bg-card px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              <X size={12} /> Sadece Zorunlu
            </button>
            <button
              type="button"
              onClick={() => save('all')}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-accent-fg shadow-md shadow-accent/30 transition hover:brightness-110 active:scale-[0.98]"
            >
              <Check size={12} /> Tümünü Kabul
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
