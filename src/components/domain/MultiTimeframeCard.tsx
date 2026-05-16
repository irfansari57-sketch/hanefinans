import { Link } from 'react-router-dom';
import { Zap, Lock } from 'lucide-react';
import type { MultiTimeframeResult, TimeframeAnalysis } from '@/lib/multiTimeframe';
import { useAuth, isPro } from '@/store/auth';
import { cn } from '@/lib/utils';

interface MultiTimeframeCardProps {
  r: MultiTimeframeResult;
  /** Fiyat formatı — ₺ veya $ */
  currency?: '₺' | '$' | '';
  /** Üst başlığı (sembol) gizle */
  hideHeader?: boolean;
}

export function MultiTimeframeCard({ r, currency = '₺', hideHeader }: MultiTimeframeCardProps) {
  const user = useAuth((s) => s.user);
  const proUser = isPro(user);

  const changeTone = r.changePct >= 0 ? 'text-success' : 'text-danger';
  const leanColor = r.bigPlayerLean === 'alıcı' ? 'border-success/40 bg-success/10 text-success'
    : r.bigPlayerLean === 'satıcı' ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-slate-500/40 bg-slate-500/10 text-slate-300';

  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      {!hideHeader && (
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-base font-bold text-slate-100">{r.label}</h4>
          <div className="text-right">
            <div className="text-xl font-bold tabular-nums text-slate-100">
              {currency}{r.price.toLocaleString('tr-TR', { maximumFractionDigits: r.price < 100 ? 2 : 0 })}
            </div>
            <div className={cn('text-sm tabular-nums', changeTone)}>
              {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      <div className={cn('grid grid-cols-3 gap-2', hideHeader ? 'mt-0' : 'mt-3')}>
        {/* 1 SAATLIK — ücretsiz */}
        <TimeframeBox label="1 SAATLİK" ta={r.tf1h} />
        {/* 4 SAATLIK — PRO */}
        {proUser ? (
          <TimeframeBox label="4 SAATLİK" ta={r.tf4h} />
        ) : (
          <LockedBox label="4 SAATLİK" />
        )}
        {/* GÜNLÜK — PRO */}
        {proUser ? (
          <TimeframeBox label="GÜNLÜK" ta={r.tf1d} />
        ) : (
          <LockedBox label="GÜNLÜK" />
        )}
      </div>

      {/* Büyük Oyuncu — PRO */}
      {proUser ? (
        <div className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', leanColor)}>
          <div className="flex items-center justify-between">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Büyük Oyuncu Eğilimi</span>
            <span className="font-bold uppercase">
              {r.bigPlayerLean === 'alıcı' ? '↑ ALICI BASKIN' : r.bigPlayerLean === 'satıcı' ? '↓ SATICI BASKIN' : '↔ KARARSIZ'}
            </span>
          </div>
        </div>
      ) : (
        <Link
          to="/uyelik"
          className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning transition hover:bg-warning/15"
        >
          <span className="flex items-center gap-2">
            <Lock size={11} />
            <span className="font-semibold uppercase tracking-wider text-[10px]">Büyük Oyuncu Eğilimi</span>
          </span>
          <span className="font-bold uppercase">🔒 PRO</span>
        </Link>
      )}

      {/* Yorum — PRO */}
      {r.verdict && (
        proUser ? (
          <div className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-300">
            <strong className="text-accent">Yorum: </strong>
            {r.verdict}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-slate-400">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <Lock size={11} className="text-warning" />
                <strong className="text-warning">Algoritmik Yorum</strong> — 4H + Günlük + büyük oyuncu analizini içerir
              </span>
              <Link to="/uyelik" className="rounded-md bg-warning/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-warning hover:bg-warning/30">
                PRO'ya Geç →
              </Link>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function TimeframeBox({ label, ta }: { label: string; ta: TimeframeAnalysis | null }) {
  if (!ta) {
    return (
      <div className="rounded border border-border bg-bg-soft p-2 text-center">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="mt-1 text-xs font-bold text-slate-500">—</div>
      </div>
    );
  }
  const bg = ta.trend === 'long' ? 'border-success/40 bg-success/10'
    : ta.trend === 'short' ? 'border-danger/40 bg-danger/10'
    : 'border-slate-500/40 bg-slate-500/10';
  const color = ta.trend === 'long' ? 'text-success'
    : ta.trend === 'short' ? 'text-danger'
    : 'text-slate-400';
  const txt = ta.trend === 'long' ? 'LONG ↑'
    : ta.trend === 'short' ? 'SHORT ↓'
    : 'NEUTRAL ↔';
  return (
    <div className={cn('rounded border p-2 text-center', bg)}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-sm font-bold', color)}>{txt}</div>
      <div className="mt-0.5 text-[9px] text-slate-500">
        {ta.emaScore}/{ta.emasAbove.length + ta.emasBelow.length} EMA üstte
      </div>
    </div>
  );
}

function LockedBox({ label }: { label: string }) {
  return (
    <Link
      to="/uyelik"
      className="group relative rounded border border-warning/30 bg-warning/5 p-2 text-center transition hover:bg-warning/10"
      title="PRO/ELITE üyelere özel — Yükselt"
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 flex items-center justify-center gap-1 text-sm font-bold text-warning">
        <Lock size={11} /> PRO
      </div>
      <div className="mt-0.5 text-[9px] text-warning/80 group-hover:underline">
        Yükselt →
      </div>
    </Link>
  );
}

// İkonlu başlık — section header için
export function MultiTimeframeHeader({ title }: { title?: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent">
      <Zap size={14} /> {title ?? 'Çoklu Zaman Dilimi Yön Analizi'}
    </h2>
  );
}
