import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Lock, Sparkles } from 'lucide-react';
import { useAuth, isPro, isElite } from '@/store/auth';
import { cn } from '@/lib/utils';

interface Props {
  tier?: 'pro' | 'elite';
  title?: string;
  description?: string;
  children: ReactNode;
  /** "preview": içeriği bulanık göster + üst üste paywall. "block": tamamen gizle. */
  mode?: 'preview' | 'block';
}

export function PremiumGate({
  tier = 'pro',
  title,
  description,
  children,
  mode = 'preview',
}: Props) {
  const user = useAuth((s) => s.user);

  const allowed = tier === 'elite' ? isElite(user) : isPro(user);
  if (allowed) return <>{children}</>;

  const Icon = tier === 'elite' ? Crown : Sparkles;
  const tierLabel = tier === 'elite' ? 'ELITE' : 'PRO';
  const tierTone = tier === 'elite' ? 'text-accent' : 'text-warning';

  return (
    <div className="relative overflow-hidden rounded-xl">
      {mode === 'preview' && (
        <div className="pointer-events-none select-none opacity-50 blur-md">{children}</div>
      )}
      <div className={cn(
        'rounded-xl border-2 border-dashed bg-bg-card/95 p-6 text-center backdrop-blur-sm',
        tier === 'elite' ? 'border-accent/40' : 'border-warning/40',
        mode === 'preview' && 'absolute inset-0 flex flex-col items-center justify-center',
      )}>
        <span className={cn('mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-bg-soft', tierTone)}>
          <Icon size={22} />
        </span>
        <h3 className="text-base font-semibold text-slate-100">
          {title ?? `Bu içerik ${tierLabel} üyelere özel`}
        </h3>
        {description && <p className="mt-1 max-w-md text-xs text-slate-400">{description}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Link
            to="/uyelik"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold transition',
              tier === 'elite'
                ? 'bg-accent text-accent-fg hover:brightness-110'
                : 'border border-warning/30 bg-warning/20 text-warning hover:bg-warning/30',
            )}
          >
            <Lock size={12} /> {tierLabel}'a yükselt
          </Link>
          {!user && (
            <Link to="/auth/signup" className="text-xs text-accent hover:underline">
              Önce ücretsiz hesap aç →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
