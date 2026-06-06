import { Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { MultiTimeframeResult, TimeframeAnalysis } from '@/lib/multiTimeframe';
import { computeMarketRegime, computePriceTrend, regimeLabel, trendLabel } from '@/lib/multiTimeframe';
import { PremiumGate } from '@/components/auth/PremiumGate';
import { cn } from '@/lib/utils';

interface MultiTimeframeCardProps {
  r: MultiTimeframeResult;
  /** Fiyat formatı — ₺ veya $ */
  currency?: '₺' | '$' | '';
  /** Üst başlığı (sembol) gizle */
  hideHeader?: boolean;
}

/**
 * Multi-Timeframe analiz kartı — PRO/Elite üyelere özel.
 *
 * Free üyeler "preview" modunda blur'lu içerik + paywall promp'u görür.
 * Yatırım kararı veren kullanıcı için en güçlü teknik analiz aracı — paywall'un
 * arkasında olması mantıklı (monetization hook).
 */
export function MultiTimeframeCard({ r, currency = '₺', hideHeader }: MultiTimeframeCardProps) {
  return (
    <PremiumGate
      tier="pro"
      title="Multi-Timeframe Analiz"
      description="1s + 4s + 1g zaman dilimlerinde EMA pozisyonları, büyük oyuncu eğilimi, hacim teyidi ve AI yorumu — Pro üyeliğe özel"
      mode="preview"
    >
      <MultiTimeframeCardInner r={r} currency={currency} hideHeader={hideHeader} />
    </PremiumGate>
  );
}

function MultiTimeframeCardInner({ r, currency = '₺', hideHeader }: MultiTimeframeCardProps) {
  const changeTone = r.changePct >= 0 ? 'text-success' : 'text-danger';

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

      {/* ANA YÖN ROZETLERİ — MA 200 (Boğa/Ayı) + MA 55 (Yükseliş/Düşüş) */}
      <div className={cn('grid grid-cols-2 gap-2', hideHeader ? 'mt-0' : 'mt-3')}>
        <RegimeBadge regime={regime} />
        <TrendBadge trend={trend} />
      </div>

      {/* Sade Günlük MA analizi — sadece günlük kart */}
      <div className="mt-3">
        <DailyMaBox ta={r.tf1d} price={r.price} />
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

/** Boğa / Ayı piyasası rozeti — MA 200 odaklı, büyük ve baskın */
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

/** Yükseliş / Düşüş trendi rozeti — MA 55 odaklı */
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

/**
 * Sade Günlük MA analizi — fiyatın MA 5/8/13 ile pozisyonunu net göster.
 */
function DailyMaBox({ ta, price }: { ta: TimeframeAnalysis | null; price?: number }) {
  if (!ta || !Number.isFinite(price)) {
    return (
      <div className="rounded border border-border bg-bg-soft p-3 text-center text-xs text-slate-500">
        Günlük MA verisi yok
      </div>
    );
  }
  const ma5 = ta.emaValues?.[5];
  const ma8 = ta.emaValues?.[8];
  const ma13 = ta.emaValues?.[13];
  const fmt = (v: number | undefined) => Number.isFinite(v)
    ? (v as number).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const above = (v: number | undefined) =>
    Number.isFinite(v) && (price as number) > (v as number);
  const a5 = above(ma5);
  const a8 = above(ma8);
  const a13 = above(ma13);
  const aboveCount = [a5, a8, a13].filter(Boolean).length;

  const verdict =
    aboveCount === 3 ? { label: 'GÜÇLÜ YUKARI TREND', cls: 'bg-success/20 text-success border-success/40' }
    : aboveCount === 0 ? { label: 'GÜÇLÜ AŞAĞI TREND', cls: 'bg-danger/20 text-danger border-danger/40' }
    : aboveCount === 2 ? { label: 'YUKARI EĞİLİM (karışık)', cls: 'bg-success/10 text-success border-success/30' }
    : { label: 'AŞAĞI EĞİLİM (karışık)', cls: 'bg-danger/10 text-danger border-danger/30' };

  const Row = ({ name, val, isAbove }: { name: string; val: number | undefined; isAbove: boolean }) => (
    <div className={cn(
      'flex items-center justify-between rounded px-3 py-2 text-sm',
      isAbove ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
    )}>
      <span className="font-semibold">{name}: {fmt(val)}</span>
      <span className="font-bold tabular-nums">
        Fiyat {isAbove ? 'ÜSTÜNDE ↑' : 'ALTINDA ↓'}
      </span>
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-bg-soft p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Günlük EMA Analizi</div>
        <div className={cn('rounded border px-2 py-0.5 text-[10px] font-bold', verdict.cls)}>
          {verdict.label}
        </div>
      </div>
      <div className="space-y-1.5">
        <Row name="EMA 5" val={ma5} isAbove={a5} />
        <Row name="EMA 8" val={ma8} isAbove={a8} />
        <Row name="EMA 13" val={ma13} isAbove={a13} />
      </div>
    </div>
  );
}

export function MultiTimeframeHeader({ title }: { title?: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent">
      <Zap size={14} /> {title ?? 'Çoklu Zaman Dilimi Yön Analizi'}
    </h2>
  );
}
