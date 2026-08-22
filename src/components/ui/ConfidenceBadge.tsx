/**
 * ConfidenceBadge — data quality durumunu gösteren küçük rozet.
 * Nokta + hover'da tooltip (uyarı listesi).
 */
import { useState } from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, ShieldQuestion } from 'lucide-react';
import type { DataQualityResult, ConfidenceLevel } from '@/lib/dataQuality';
import { levelLabel } from '@/lib/dataQuality';
import { cn } from '@/lib/utils';

function iconFor(level: ConfidenceLevel) {
  switch (level) {
    case 'high': return CheckCircle2;
    case 'medium': return AlertTriangle;
    case 'low': return AlertCircle;
    case 'invalid': return ShieldQuestion;
  }
}

function dotClass(level: ConfidenceLevel): string {
  switch (level) {
    case 'high': return 'bg-success';
    case 'medium': return 'bg-warning';
    case 'low': return 'bg-danger';
    case 'invalid': return 'bg-slate-500';
  }
}

interface ConfidenceBadgeProps {
  dq: DataQualityResult;
  compact?: boolean;
  className?: string;
  /** Nokta yerine ikon + etiket göster. */
  detailed?: boolean;
}

/** Küçük renkli nokta + hover tooltip. Sadece medium/low/invalid için görünür (temiz veride gizli). */
export function ConfidenceBadge({ dq, compact = false, className, detailed = false }: ConfidenceBadgeProps) {
  const [hover, setHover] = useState(false);
  // High + no warnings → sessiz
  if (dq.level === 'high' && dq.warnings.length === 0 && !detailed) return null;

  const Icon = iconFor(dq.level);

  if (compact) {
    return (
      <span
        className={cn('relative inline-flex items-center', className)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          setHover((v) => !v);
        }}
      >
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full cursor-help',
            dotClass(dq.level),
          )}
          title={levelLabel(dq.level)}
        />
        {hover && (
          <div className="absolute left-1/2 top-full z-50 mt-1 w-64 -translate-x-1/2 rounded-lg border border-border bg-bg-card p-2 shadow-lg">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-200">
              <Icon size={12} className={cn(
                dq.level === 'high' && 'text-success',
                dq.level === 'medium' && 'text-warning',
                dq.level === 'low' && 'text-danger',
                dq.level === 'invalid' && 'text-slate-500',
              )} />
              {levelLabel(dq.level)} — {dq.confidence}/100
            </div>
            {dq.warnings.length > 0 && (
              <ul className="space-y-1 text-[10px] text-slate-400">
                {dq.warnings.map((w, i) => (
                  <li key={i} className="flex gap-1">
                    <span className="shrink-0">•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
            {dq.corrected && (
              <div className="mt-1 rounded bg-accent/10 px-1.5 py-1 text-[10px] text-accent">
                ✓ Otomatik düzeltildi ({dq.corrected.source})
              </div>
            )}
          </div>
        )}
      </span>
    );
  }

  // Detailed görünüm: ikon + etiket
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
        dq.level === 'high' && 'border-success/30 bg-success/10 text-success',
        dq.level === 'medium' && 'border-warning/30 bg-warning/10 text-warning',
        dq.level === 'low' && 'border-danger/30 bg-danger/10 text-danger',
        dq.level === 'invalid' && 'border-slate-500/30 bg-slate-500/10 text-slate-500',
        className,
      )}
      title={dq.warnings.join(' • ') || levelLabel(dq.level)}
    >
      <Icon size={10} /> {levelLabel(dq.level)}
    </span>
  );
}
