import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Crown, Sparkles, Shield, Check, X, Zap, AlertCircle,
  Calendar, ArrowRight, ArrowDown, RotateCcw,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth, isPro } from '@/store/auth';
import { usePricing } from '@/store/pricing';
import { cn } from '@/lib/utils';

interface Plan {
  tier: 'free' | 'pro' | 'elite';
  name: string;
  price: string;
  periodPrice: string;
  description: string;
  icon: typeof Crown;
  color: string;
  ringColor: string;
  features: string[];
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Ücretsiz',
    price: '₺0',
    periodPrice: 'sınırsız',
    description: 'Başlangıç paketi — temel BIST takibi',
    icon: Sparkles,
    color: 'text-slate-300',
    ringColor: 'ring-slate-500/30',
    features: [
      'Watchlist + temel hisse takibi',
      'Günlük analiz (mock + Yahoo verisi)',
      'Kripto, makro, fonlar referans paneli',
      '5 fiyat alarmı',
      'IndexedDB yerel veritabanı',
      'TradingView grafik (lightweight-charts)',
    ],
  },
  {
    tier: 'pro',
    name: 'PRO',
    price: '₺99',
    periodPrice: '/ay',
    description: 'Ciddi yatırımcı için',
    icon: Crown,
    color: 'text-warning',
    ringColor: 'ring-warning/40',
    popular: true,
    features: [
      'Tüm Ücretsiz özellikler',
      'Telegram günlük otomatik rapor',
      'Sınırsız fiyat + RSI + MACD alarmı',
      'Gecikmesiz BIST kotasyonu',
      'Detaylı teknik göstergeler (Bollinger, ADX, Fibonacci)',
      'Sanal portföy simülatörü + backtest',
      'Haftalık özel "Öneri" havuzu',
    ],
  },
  {
    tier: 'elite',
    name: 'ELITE',
    price: '₺299',
    periodPrice: '/ay',
    description: 'Profesyonel + AI destekli analiz',
    icon: Shield,
    color: 'text-accent',
    ringColor: 'ring-accent/40',
    features: [
      'Tüm PRO özellikler',
      'AI destekli haber özetleme (Claude API)',
      'Sembol başına AI analiz raporu (haftalık 50)',
      'Özel WhatsApp/Telegram grup',
      '1-1 aylık 30 dk online seans',
      'Beta özelliklere erken erişim',
      'API kullanım kotası 10× artar',
    ],
  },
];

const TIER_ORDER: Array<'free' | 'pro' | 'elite'> = ['free', 'pro', 'elite'];

export function MembershipPage() {
  const user = useAuth((s) => s.user);
  const upgrade = useAuth((s) => s.upgradeTier);
  // Fiyatları store'dan oku — admin Ayarlar'dan değiştirebilir
  const proMonthly = usePricing((s) => s.proMonthly);
  const eliteMonthly = usePricing((s) => s.eliteMonthly);
  const [processing, setProcessing] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ tier: 'free' | 'pro' | 'elite'; label: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // PLANS const'undaki hardcoded fiyatları runtime'da override et
  const PLANS_LIVE: Plan[] = PLANS.map((p) => {
    if (p.tier === 'pro') return { ...p, price: `₺${proMonthly}` };
    if (p.tier === 'elite') return { ...p, price: `₺${eliteMonthly}` };
    return p;
  });

  if (!user) {
    return (
      <>
        <PageHeader title="Üyelik" subtitle="Plan seçmek için önce hesabına gir veya ücretsiz hesap aç." />
        <div className="glass-card p-8 text-center">
          <AlertCircle size={32} className="mx-auto text-warning" />
          <h2 className="mt-3 text-lg font-semibold text-slate-100">Önce hesap aç</h2>
          <p className="mt-1 text-sm text-slate-400">Üyelik planlarını yönetmek için bir hesabın olmalı.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/auth/signup" className="btn-primary">
              <Sparkles size={14} /> Ücretsiz hesap aç
            </Link>
            <Link to="/auth/login" className="btn-secondary">
              Giriş yap
            </Link>
          </div>
        </div>
      </>
    );
  }

  const currentTier = user.tier;
  const proActive = isPro(user);
  const currentPlan = PLANS_LIVE.find((p) => p.tier === currentTier) ?? PLANS_LIVE[0];
  const CurrentIcon = currentPlan.icon;

  const tierIndex = TIER_ORDER.indexOf(currentTier);

  const handleChange = (tier: 'free' | 'pro' | 'elite') => {
    if (tier === currentTier) return;
    const targetIdx = TIER_ORDER.indexOf(tier);
    const isUpgrade = targetIdx > tierIndex;
    setConfirmAction({
      tier,
      label: isUpgrade ? 'yükselt' : 'düşür',
    });
  };

  const confirmTierChange = async () => {
    if (!confirmAction) return;
    setProcessing(confirmAction.tier);
    await new Promise((r) => setTimeout(r, 600));
    await upgrade(confirmAction.tier, 1);
    setProcessing(null);
    setMessage(
      confirmAction.tier === 'free'
        ? 'Ücretsiz plana geçildi.'
        : `${confirmAction.tier.toUpperCase()} planına geçildi — aktif (mock ödeme).`,
    );
    setConfirmAction(null);
    setTimeout(() => setMessage(null), 4000);
  };

  const handleCancel = async () => {
    setProcessing('cancel');
    await new Promise((r) => setTimeout(r, 600));
    await upgrade('free', 0);
    setProcessing(null);
    setMessage('Aboneliğin iptal edildi, Ücretsiz plana döndün.');
    setConfirmCancel(false);
    setTimeout(() => setMessage(null), 4000);
  };

  return (
    <>
      <PageHeader
        title="Üyelik"
        subtitle="Mevcut planını gör, yükselt/düşür veya iptal et."
      />

      {message && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {message}
        </div>
      )}

      {/* Mevcut plan kartı */}
      <section className="glass-card mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'grid h-14 w-14 place-items-center rounded-xl ring-2',
                currentPlan.color,
                currentPlan.ringColor,
                currentTier === 'free' ? 'bg-slate-500/10' :
                currentTier === 'pro' ? 'bg-warning/10' : 'bg-accent/10',
              )}
            >
              <CurrentIcon size={26} />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Mevcut Plan</div>
              <h2 className={cn('text-2xl font-bold', currentPlan.color)}>
                {currentPlan.name}
                {proActive && currentTier !== 'free' && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                    <Check size={10} /> Aktif
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">{currentPlan.description}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-1">
              <span className="text-2xl font-bold tabular-nums text-slate-100">{currentPlan.price}</span>
              <span className="text-xs text-slate-500">{currentPlan.periodPrice}</span>
            </div>
            {user.tierExpiresAt && currentTier !== 'free' && (
              <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-500">
                <Calendar size={10} />
                {new Date(user.tierExpiresAt).toLocaleDateString('tr-TR')} tarihine kadar
              </div>
            )}
          </div>
        </div>

        {/* Aksiyon butonları */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {currentTier === 'free' && (
            <>
              <button
                onClick={() => handleChange('pro')}
                disabled={processing !== null}
                className="inline-flex items-center gap-1.5 rounded-md bg-warning/20 px-4 py-2 text-xs font-semibold text-warning border border-warning/30 hover:bg-warning/30"
              >
                <Crown size={13} /> PRO'ya Yükselt — ₺99/ay
                <ArrowRight size={12} />
              </button>
              <button
                onClick={() => handleChange('elite')}
                disabled={processing !== null}
                className="btn-primary"
              >
                <Shield size={13} /> ELITE'e Yükselt — ₺299/ay
              </button>
            </>
          )}
          {currentTier === 'pro' && (
            <>
              <button
                onClick={() => handleChange('elite')}
                disabled={processing !== null}
                className="btn-primary"
              >
                <Shield size={13} /> ELITE'e Yükselt — ₺299/ay <ArrowRight size={12} />
              </button>
              <button
                onClick={() => handleChange('free')}
                disabled={processing !== null}
                className="btn-secondary text-slate-400"
              >
                <ArrowDown size={13} /> Ücretsiz Plana Düş
              </button>
              <button
                onClick={() => setConfirmCancel(true)}
                disabled={processing !== null}
                className="btn-danger"
              >
                <RotateCcw size={13} /> Aboneliği İptal Et
              </button>
            </>
          )}
          {currentTier === 'elite' && (
            <>
              <button
                onClick={() => handleChange('pro')}
                disabled={processing !== null}
                className="btn-secondary"
              >
                <ArrowDown size={13} /> PRO'ya Düş — ₺99/ay
              </button>
              <button
                onClick={() => handleChange('free')}
                disabled={processing !== null}
                className="btn-secondary text-slate-400"
              >
                <ArrowDown size={13} /> Ücretsiz Plana Düş
              </button>
              <button
                onClick={() => setConfirmCancel(true)}
                disabled={processing !== null}
                className="btn-danger"
              >
                <RotateCcw size={13} /> Aboneliği İptal Et
              </button>
            </>
          )}
        </div>
      </section>

      {/* Plan karşılaştırma grid */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Tüm Paketler</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {PLANS_LIVE.map((plan) => {
          const Icon = plan.icon;
          const current = plan.tier === currentTier;
          const isUpgrade = TIER_ORDER.indexOf(plan.tier) > tierIndex;
          const isDowngrade = TIER_ORDER.indexOf(plan.tier) < tierIndex;
          return (
            <div
              key={plan.tier}
              className={cn(
                'glass-card relative p-5',
                current && 'ring-2 ring-success/40',
                plan.popular && !current && 'ring-2 ring-warning/30',
              )}
            >
              {plan.popular && !current && (
                <div className="absolute -top-2 left-4 inline-block rounded-full bg-warning/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">
                  ⭐ En popüler
                </div>
              )}
              {current && (
                <div className="absolute -top-2 right-4 inline-block rounded-full bg-success/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-success">
                  ✓ Aktif Plan
                </div>
              )}

              <div className="flex items-center gap-2">
                <Icon size={18} className={plan.color} />
                <h3 className={cn('text-lg font-bold', plan.color)}>{plan.name}</h3>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums text-slate-100">{plan.price}</span>
                <span className="text-xs text-slate-500">{plan.periodPrice}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{plan.description}</p>

              <ul className="mt-4 space-y-1.5 text-xs">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-slate-300">
                    <Check size={12} className="mt-0.5 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {!current && (
                <button
                  onClick={() => handleChange(plan.tier)}
                  disabled={processing !== null}
                  className={cn(
                    'mt-4 w-full',
                    isUpgrade
                      ? plan.popular ? 'btn bg-warning/20 text-warning border border-warning/30 hover:bg-warning/30' : 'btn-primary'
                      : 'btn-secondary text-slate-400',
                  )}
                >
                  {processing === plan.tier ? 'İşleniyor…' : (
                    <>
                      {isUpgrade ? <Zap size={13} /> : <ArrowDown size={13} />}
                      {isUpgrade ? 'Yükselt' : isDowngrade ? 'Bu plana düş' : 'Seç'}
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
        ⚠️ Şu an demo: gerçek ödeme entegrasyonu (Iyzico/Stripe) henüz aktif değil. Plan değişikliklerinde gerçek ücret alınmaz.
        Production'a geçtiğinde aylık ücretler otomatik tahsil edilecek; iptal sonrası bir sonraki yenileme yapılmaz.
      </p>

      {/* Plan değiştirme onayı */}
      <ConfirmDialog
        open={!!confirmAction}
        title={`${confirmAction?.label === 'yükselt' ? 'Plan yükselt' : 'Plan düşür'}`}
        message={
          confirmAction?.tier === 'free'
            ? 'Ücretsiz plana geçeceksin. Aktif aboneliğin sona erecek ve premium özellikler kapanacak.'
            : `${confirmAction?.tier.toUpperCase()} planına geçeceksin. Demo modda, gerçek ücret alınmaz.`
        }
        confirmText={confirmAction?.label === 'yükselt' ? 'Yükselt' : 'Düşür'}
        destructive={confirmAction?.tier === 'free' && currentTier !== 'free'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmTierChange}
      />

      {/* İptal onayı */}
      <ConfirmDialog
        open={confirmCancel}
        title="Aboneliği iptal et?"
        message={`${currentPlan.name} aboneliğin iptal edilecek ve Ücretsiz plana döneceksin. Premium özellikler hemen kapanır. Demo modda olduğun için iade işlemi yok.`}
        confirmText="Evet, iptal et"
        destructive
        onCancel={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
      />
    </>
  );
}
