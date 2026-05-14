import { useState } from 'react';
import { Crown, Sparkles, Check, X, Zap, Shield } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/store/auth';
import { cn } from '@/lib/utils';

interface Plan {
  tier: 'free' | 'pro' | 'elite';
  name: string;
  price: string;
  period: string;
  description: string;
  icon: typeof Crown;
  color: string;
  features: { label: string; included: boolean }[];
  cta: string;
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Ücretsiz',
    price: '₺0',
    period: 'sınırsız',
    description: 'Başlangıç paketi — temel BIST takibi',
    icon: Sparkles,
    color: 'text-slate-300',
    features: [
      { label: 'Watchlist + temel hisse takibi', included: true },
      { label: 'Günlük sabah raporu (mock + Yahoo verisi)', included: true },
      { label: 'Kripto, makro, fonlar referans paneli', included: true },
      { label: '5 fiyat alarmı', included: true },
      { label: 'IndexedDB yerel veritabanı', included: true },
      { label: 'Telegram otomatik bildirim', included: false },
      { label: 'Sınırsız alarm + portföy simülatörü', included: false },
      { label: 'AI destekli analiz (Claude entegrasyonu)', included: false },
    ],
    cta: 'Mevcut plan',
  },
  {
    tier: 'pro',
    name: 'PRO',
    price: '₺99',
    period: '/ay',
    description: 'Ciddi yatırımcı için',
    icon: Crown,
    color: 'text-warning',
    popular: true,
    features: [
      { label: 'Tüm Ücretsiz özellikler', included: true },
      { label: 'Telegram günlük otomatik rapor', included: true },
      { label: 'Sınırsız fiyat + RSI + MACD alarmı', included: true },
      { label: 'Reel-zamanlı BIST kotasyonu (gecikmesiz)', included: true },
      { label: 'Detaylı teknik göstergeler (Bollinger, ADX, Fibonacci)', included: true },
      { label: 'Sanal portföy simülatörü + backtest', included: true },
      { label: 'Özel "Öneri" havuzu (haftalık)', included: true },
      { label: 'AI destekli haber özetleme', included: false },
    ],
    cta: "PRO'ya geç",
  },
  {
    tier: 'elite',
    name: 'ELITE',
    price: '₺299',
    period: '/ay',
    description: 'Profesyonel + AI destekli analiz',
    icon: Shield,
    color: 'text-accent',
    features: [
      { label: 'Tüm PRO özellikler', included: true },
      { label: 'AI destekli haber özetleme (Claude API)', included: true },
      { label: 'Sembol başına AI analiz raporu (haftalık 50)', included: true },
      { label: 'Özel WhatsApp/Telegram grup', included: true },
      { label: '1-1 aylık 30 dk online seans', included: true },
      { label: 'Beta özelliklere erken erişim', included: true },
      { label: 'API kullanım kotası 10× artar', included: true },
    ],
    cta: "ELITE'e geç",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PricingModal({ open, onClose }: Props) {
  const user = useAuth((s) => s.user);
  const upgrade = useAuth((s) => s.upgradeTier);
  const [processing, setProcessing] = useState<string | null>(null);

  const handleUpgrade = async (tier: 'free' | 'pro' | 'elite') => {
    if (!user) return;
    if (tier === 'free') return;
    setProcessing(tier);
    // Mock — gerçek ödeme entegrasyonu (Iyzico/Stripe) eklenince burada akış değişecek
    await new Promise((r) => setTimeout(r, 600));
    await upgrade(tier, 1);
    setProcessing(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Hane Finans — Üyelik Paketleri" size="xl">
      <p className="text-xs text-slate-400">
        Ücretsiz ile başla, ihtiyacın olunca yükselt. İptal kolay — her ay yenilenir.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const current = user?.tier === plan.tier;
          return (
            <div
              key={plan.tier}
              className={cn(
                'rounded-xl border bg-bg-card p-4 transition',
                plan.popular ? 'border-warning/40 shadow-lg shadow-warning/10' : 'border-border',
                current && 'ring-2 ring-success/40',
              )}
            >
              {plan.popular && (
                <div className="-mt-2 mb-2 inline-block rounded-full bg-warning/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">
                  ⭐ En popüler
                </div>
              )}
              <div className="flex items-center gap-2">
                <Icon size={16} className={plan.color} />
                <h3 className={cn('text-base font-bold', plan.color)}>{plan.name}</h3>
                {current && (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                    Aktif
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums text-slate-100">{plan.price}</span>
                <span className="text-xs text-slate-500">{plan.period}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{plan.description}</p>

              <ul className="mt-4 space-y-1.5 text-xs">
                {plan.features.map((f) => (
                  <li key={f.label} className={cn('flex items-start gap-2', f.included ? 'text-slate-300' : 'text-slate-600 line-through')}>
                    {f.included ? (
                      <Check size={12} className="mt-0.5 shrink-0 text-success" />
                    ) : (
                      <X size={12} className="mt-0.5 shrink-0" />
                    )}
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>

              <button
                disabled={current || processing !== null || !user}
                onClick={() => handleUpgrade(plan.tier)}
                className={cn(
                  'mt-4 w-full',
                  current
                    ? 'btn-secondary opacity-60'
                    : plan.tier === 'elite'
                    ? 'btn-primary'
                    : plan.popular
                    ? 'btn bg-warning/20 text-warning hover:bg-warning/30 border border-warning/30'
                    : 'btn-secondary',
                )}
              >
                {processing === plan.tier ? 'İşleniyor…' : current ? 'Aktif plan' : plan.cta}
                {!current && <Zap size={14} />}
              </button>
            </div>
          );
        })}
      </div>
      {!user && (
        <p className="mt-4 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-center text-xs text-warning">
          Üye olmadan plan seçemezsin. <a href="/auth/signup" className="underline">Hesap aç</a> veya <a href="/auth/login" className="underline">giriş yap</a>.
        </p>
      )}
      <p className="mt-3 text-center text-[10px] text-slate-500">
        ⚠️ Şu an demo — gerçek ödeme entegrasyonu (Iyzico/Stripe) henüz aktif değil. Tıkladığında plan değişir ama ücret alınmaz.
      </p>
    </Modal>
  );
}
