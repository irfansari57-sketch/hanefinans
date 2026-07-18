import { useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { DISCLAIMER_TITLE, DisclaimerBody } from './Disclaimer';

const STORAGE_KEY = 'fa.disclaimer.acceptedAt.v1';

/** İlk girişte gösterilen YTD + KVKK onay modali. */
export function DisclaimerModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const accepted = localStorage.getItem(STORAGE_KEY);
      if (!accepted) {
        // Sayfa render bittikten sonra göster (anlık popup şoku olmasın)
        const t = setTimeout(() => setOpen(true), 500);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
    >
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-warning/40 bg-bg-soft shadow-2xl shadow-warning/10">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border px-6 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
            <AlertTriangle size={20} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="disclaimer-title" className="text-lg font-bold text-warning">{DISCLAIMER_TITLE}</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              InvestLiq'a hoş geldin. Devam etmeden önce lütfen aşağıdaki uyarıyı oku.
            </p>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <DisclaimerBody />
          <p className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-accent">
            <strong>Onay</strong> — "Okudum, Onaylıyorum" butonuna tıklayarak yukarıdaki uyarıları okuduğunu,
            yatırım kararlarındaki tüm sorumluluğun sana ait olduğunu ve Kişisel Verilerin Korunması Kanunu (KVKK)
            beyanını kabul etmiş sayılırsın.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-bg-card/60 px-6 py-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-[10px] text-slate-500">
            Bu onay tarayıcında saklanır; tekrar göstermez.
          </p>
          <button
            type="button"
            onClick={accept}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-warning px-5 py-2.5 text-sm font-bold text-bg shadow-lg shadow-warning/30 transition hover:brightness-110 active:scale-[0.98]"
          >
            <Check size={16} /> Okudum, Onaylıyorum
          </button>
        </div>
      </div>
    </div>
  );
}
