import { Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { MultiTimeframeResult, TimeframeAnalysis } from '@/lib/multiTimeframe';
import { computeMarketRegime, computePriceTrend, regimeLabel, trendLabel } from '@/lib/multiTimeframe';
import { cn } from '@/lib/utils';

interface MultiTimeframeCardProps {
  r: MultiTimeframeResult;
  /** Fiyat formatı — ₺ veya $ */
  currency?: '₺' | '$' | '';
  /** Üst başlığı (sembol) gizle */
  hideHeader?: boolean;
}

/**
 * Multi-Timeframe analiz kartı.
 *
 * KULLANICI TALEBİ İLE PRO KİLİTLERİ KALDIRILDI — Büyük oyuncu eğilimi, yorum
 * ve tüm zaman dilimi kutuları artık herkese açık. Üst kısımda EMA 200 (Boğa/Ayı)
 * ve EMA 55 (Yükseliş/Düşüş) odaklı, sade ana yön rozetleri öne çıkar.
 */
export function MultiTimeframeCard({ r, currency = '₺', hideHeader }: MultiTimeframeCardProps) {
  const changeTone = r.changePct >= 0 ? 'text-success' : 'text-danger';
  const leanColor = r.bigPlayerLean === 'alıcı' ? 'border-success/40 bg-success/10 text-success'
    : r.bigPlayerLean === 'satıcı' ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-slate-500/40 bg-slate-500/10 text-slate-300';

  // Eğer field verilmemişse günlük EMA'lardan otomatik türet
  const regime = r.marketRegime ?? computeMarketRegime(r.price, r.tf1d?.emaValues[200]);
  const trend = r.priceTrend ?? computePriceTrend(r.price, r.tf1d?.emaValues[55]);

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

      {/* ANA YÖN ROZETLERİ — EMA 200 (Boğa/Ayı) + EMA 55 (Yükseliş/Düşüş) */}
      <div className={cn('grid grid-cols-2 gap-2', hideHeader ? 'mt-0' : 'mt-3')}>
        <RegimeBadge regime={regime} />
        <TrendBadge trend={trend} />
      </div>

      {/* TF kutuları — artık herkese açık */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <TimeframeBox label="1 SAATLİK" ta={r.tf1h} />
        <TimeframeBox label="4 SAATLİK" ta={r.tf4h} />
        <TimeframeBox label="GÜNLÜK" ta={r.tf1d} />
      </div>

      {/* Büyük Oyuncu — artık herkese açık */}
      <div className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', leanColor)}>
        <div className="flex items-center justify-between">
          <span className="font-semibold uppercase tracking-wider text-[10px]">Büyük Oyuncu Eğilimi</span>
          <span className="font-bold uppercase">
            {r.bigPlayerLean === 'alıcı' ? '↑ ALICI BASKIN' : r.bigPlayerLean === 'satıcı' ? '↓ SATICI BASKIN' : '↔ KARARSIZ'}
          </span>
        </div>
      </div>

      {/* Yorum — artık herkese açık */}
      {r.verdict && (
        <div className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-300">
          <strong className="text-accent">Yorum: </strong>
          {r.verdict}
        </div>
      )}
    </div>
  );
}

/** Boğa / Ayı piyasası rozeti — EMA 200 odaklı, büyük ve baskın */
function RegimeBadge({ regime }: { regime: 'bull' | 'bear' | 'unknown' }) {
  const cls = regime === 'bull' ? 'border-success/40 bg-success/10 text-success'
    : regime === 'bear' ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-slate-500/40 bg-slate-500/10 text-slate-400';
  const Icon = regime === 'bull' ? TrendingUp : regime === 'bear' ? TrendingDown : Minus;
  return (
    <div className={cn('rounded-lg border px-3 py-2 flex items-center justify-between gap-2', cls)}>
      <div>
        <div className="text-[9px] uppercase tracking-wider opacity-70">Piyasa Rejimi</div>
        <div className="mt-0.5 text-sm font-bold">{regimeLabel(regime)}</div>
      </div>
      <Icon size={20} />
    </div>
  );
}

/** Yükseliş / Düşüş trendi rozeti — EMA 55 odaklı */
function TrendBadge({ trend }: { trend: 'up' | 'down' | 'sideways' }) {
  const cls = trend === 'up' ? 'border-success/40 bg-success/10 text-success'
    : trend === 'down' ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-slate-500/40 bg-slate-500/10 text-slate-400';
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  return (
    <div className={cn('rounded-lg border px-3 py-2 flex items-center justify-between gap-2', cls)}>
      <div>
        <div className="text-[9px] uppercase tracking-wider opacity-70">Ana Yön</div>
        <div className="mt-0.5 text-sm font-bold">{trendLabel(trend)}</div>
      </div>
      <Icon size={20} />
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

// LockedBox kaldırıldı — TF kutuları artık herkese açık (kullanıcı talebi).

// İkonlu başlık — section header için
export function MultiTimeframeHeader({ title }: { title?: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent">
      <Zap size={14} /> {title ?? 'Çoklu Zaman Dilimi Yön Analizi'}
    </h2>
  );
}
