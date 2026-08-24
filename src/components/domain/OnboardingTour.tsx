import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, LayoutDashboard, Star, Bell, PiggyBank, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'fa.onboarding.completed.v1';

interface Step {
  icon: typeof Sparkles;
  title: string;
  description: string;
  action?: { label: string; to: string };
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: 'InvestliQ\'a hoş geldin!',
    description:
      'BIST hisseleri, fonlar, kripto, emtia ve döviz için canlı veriler tek panelde. Bu kısa tur sana ana özellikleri gösterecek (30 saniye).',
  },
  {
    icon: LayoutDashboard,
    title: 'Panel — günün özeti',
    description:
      'BIST 100, USD/TRY, altın gibi kritik göstergeler, sıcak haberler ve günün hareketleri tek ekranda. Kartlara tıklayarak detay sayfalarına gidebilirsin.',
    action: { label: 'Panel\'i aç', to: '/panel' },
  },
  {
    icon: Star,
    title: 'Takip Listem — yıldız sistemi',
    description:
      'Her hisse veya fon kartında yıldıza tıkla; Takip Listem sayfasında topluca izle. Hisseler ve fonlar ayrı sekmelerde, birleşik yönetim.',
    action: { label: 'Takip Listem', to: '/watchlist' },
  },
  {
    icon: Bell,
    title: 'Fiyat Alarmları + AI Analizi',
    description:
      'Hisse detayında çan ikonuyla fiyat alarmı kur — hedef fiyat aşıldığında haberin olur. Portföy sayfasında AI ile risk analizi al (PRO).',
    action: { label: 'Portföyüm', to: '/portfoy' },
  },
  {
    icon: PiggyBank,
    title: 'BES Birikim Hesaplayıcı',
    description:
      'Eğitim sayfasında 25 yıllık BES projeksiyonu — devlet katkısı + bileşik getiri. Aylık katkı, başlangıç birikimi, yaş senaryolarını dene.',
    action: { label: 'Hesaplayıcıyı aç', to: '/egitim' },
  },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    // Disclaimer modal sonrasında onboarding'i göster — kullanıcı yasal onayı verdikten sonra
    const completed = localStorage.getItem(STORAGE_KEY);
    if (completed) return;
    const t = setTimeout(() => setOpen(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const close = (skip = false) => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setOpen(false);
    if (skip) setStep(0);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else close();
  };

  const goToAction = (to: string) => {
    close();
    navigate(to);
  };

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => close(true)} />
      <div className="relative w-full max-w-md rounded-2xl border border-accent/30 bg-bg-soft p-6 shadow-2xl">
        <button
          onClick={() => close(true)}
          className="absolute right-3 top-3 rounded p-1 text-slate-500 hover:bg-bg-card hover:text-slate-200"
          aria-label="Atla"
        >
          <X size={16} />
        </button>

        {/* İlerleme noktaları */}
        <div className="mb-4 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === step ? 'w-8 bg-accent' : i < step ? 'w-1.5 bg-accent/60' : 'w-1.5 bg-slate-600',
              )}
            />
          ))}
        </div>

        <div className="text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Icon size={22} />
          </span>
          <h3 className="mt-3 text-lg font-bold text-slate-100">{current.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{current.description}</p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => close(true)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Atla
          </button>
          <div className="flex items-center gap-2">
            {current.action && (
              <button
                onClick={() => goToAction(current.action!.to)}
                className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
              >
                {current.action.label}
              </button>
            )}
            <button
              onClick={next}
              className="btn-primary"
            >
              {isLast ? 'Başla' : 'İleri'}
              {!isLast && <ChevronRight size={14} />}
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-[10px] text-slate-600">
          {step + 1} / {STEPS.length}
        </p>
      </div>
    </div>
  );
}

/** Manuel açma için — Ayarlar veya help'ten tetiklenebilir */
export function resetOnboarding() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
