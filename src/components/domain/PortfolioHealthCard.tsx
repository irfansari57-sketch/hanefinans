import { useEffect, useState } from 'react';
import { Activity, TrendingUp, ShieldCheck, Sparkles, ChevronDown, RefreshCw, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Portföy Sağlık Skoru — Panel kartı.
 * Kullanıcının portföyünü 0-100 arası skorlar + 3 kısa öneri.
 * Detay için /portfoy/saglik sayfası.
 */

interface HealthResponse {
  ok: boolean;
  score?: number;
  color?: 'green' | 'yellow' | 'orange' | 'red';
  label?: string;
  breakdown?: {
    diversity: { score: number; max: number };
    concentration: { score: number; max: number };
    risk: { score: number; max: number };
    returns: { score: number; max: number };
    tefas: { score: number; max: number };
    liquidity: { score: number; max: number };
  };
  aiSummary?: string;
  aiSuggestions?: string[];
  asOf?: string;
  fromCache?: boolean;
  error?: string;
}

interface Position {
  symbol: string;
  name?: string;
  sector?: string;
  kind: 'stock' | 'fund';
  lot: number;
  avgPrice: number;
  currentPrice?: number;
  tefasOpen?: boolean;
  changePct30d?: number;
}

interface Props {
  positions: Position[];
  bist30d?: number;
  riskProfileTolerance?: 'low' | 'medium' | 'high' | null;
  className?: string;
}

const COLOR_MAP = {
  green: {
    ring: 'ring-emerald-400/40',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    fill: 'stroke-emerald-400',
  },
  yellow: {
    ring: 'ring-yellow-400/40',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    fill: 'stroke-yellow-400',
  },
  orange: {
    ring: 'ring-orange-400/40',
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    fill: 'stroke-orange-400',
  },
  red: {
    ring: 'ring-red-400/40',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    fill: 'stroke-red-400',
  },
} as const;

async function fetchScore(input: {
  positions: Position[];
  bist30d?: number;
  riskProfileTolerance?: 'low' | 'medium' | 'high' | null;
}): Promise<HealthResponse> {
  const r = await fetch('/api/ai/portfolio-health', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  return (await r.json()) as HealthResponse;
}

async function fetchCachedScore(): Promise<HealthResponse> {
  const r = await fetch('/api/ai/portfolio-health', {
    method: 'GET',
    credentials: 'include',
  });
  return (await r.json()) as HealthResponse;
}

export function PortfolioHealthCard({ positions, bist30d, riskProfileTolerance, className }: Props) {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // İlk mount: cache'ten oku, yoksa hesapla
    let cancelled = false;
    (async () => {
      setLoading(true);
      const cached = await fetchCachedScore();
      if (cancelled) return;
      if (cached.ok && cached.score != null) {
        setData(cached);
        setLoading(false);
        return;
      }
      // Cache yok → hesapla
      if (positions.length === 0) {
        setData({ ok: false });
        setLoading(false);
        return;
      }
      const fresh = await fetchScore({ positions, bist30d, riskProfileTolerance });
      if (cancelled) return;
      setData(fresh);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    if (positions.length === 0) return;
    setRefreshing(true);
    try {
      const fresh = await fetchScore({ positions, bist30d, riskProfileTolerance });
      setData(fresh);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className={cn('glass-card p-4 sm:p-5', className)}>
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 animate-pulse rounded-full bg-bg-card" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-bg-card" />
            <div className="h-3 w-48 animate-pulse rounded bg-bg-card" />
          </div>
        </div>
      </div>
    );
  }

  if (!data?.ok || data.score == null) {
    // Portföy boş veya skor hesaplanamadı
    if (positions.length === 0) {
      return (
        <div className={cn('glass-card p-4 sm:p-5', className)}>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <Activity size={18} className="text-slate-500" />
            <span>Portföyünüze pozisyon ekleyin, sağlık skorunu hesaplayalım.</span>
          </div>
        </div>
      );
    }
    return null;
  }

  const color = COLOR_MAP[data.color ?? 'yellow'];
  const scorePct = data.score;
  const circumference = 2 * Math.PI * 26; // r=26
  const dashoffset = circumference - (scorePct / 100) * circumference;

  return (
    <div className={cn('glass-card p-4 sm:p-5', className)}>
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Circular progress + score */}
        <div className="relative shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgb(51,65,85)" strokeWidth="6" />
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
              className={color.fill}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className={cn('text-lg font-bold tabular-nums', color.text)}>{data.score}</span>
            <span className="text-[9px] text-slate-500">/ 100</span>
          </div>
        </div>

        {/* Label + summary */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-100 sm:text-base">Portföy Sağlığı</h3>
            <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', color.bg, color.text)}>
              {data.label}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] text-slate-400 sm:text-xs">
            {data.aiSummary ?? 'Skorunuz hesaplandı — detay sayfada breakdown ve öneriler.'}
          </p>
        </div>

        {/* Refresh + expand */}
        <div className="flex shrink-0 flex-col gap-1">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-md bg-bg-card p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-50"
            title="Yeniden hesapla"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md bg-bg-card p-1.5 text-slate-400 hover:text-slate-200"
            title={expanded ? 'Kapat' : 'Öneriler + detay'}
          >
            <ChevronDown size={12} className={cn('transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Mini breakdown — mobil compact */}
      {data.breakdown && (
        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          <MetricPill icon={<Sparkles size={10} />} label="Çeşit" score={data.breakdown.diversity.score} max={data.breakdown.diversity.max} />
          <MetricPill icon={<Activity size={10} />} label="Konsantre" score={data.breakdown.concentration.score} max={data.breakdown.concentration.max} />
          <MetricPill icon={<ShieldCheck size={10} />} label="Risk" score={data.breakdown.risk.score} max={data.breakdown.risk.max} />
          <MetricPill icon={<TrendingUp size={10} />} label="Getiri" score={data.breakdown.returns.score} max={data.breakdown.returns.max} />
          <MetricPill icon={<Activity size={10} />} label="TEFAS" score={data.breakdown.tefas.score} max={data.breakdown.tefas.max} />
          <MetricPill icon={<Activity size={10} />} label="Likidite" score={data.breakdown.liquidity.score} max={data.breakdown.liquidity.max} />
        </div>
      )}

      {/* Expanded: öneriler + detay */}
      {expanded && (
        <div className="mt-4 border-t border-slate-700/40 pt-3">
          {data.aiSuggestions && data.aiSuggestions.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                <Lightbulb size={12} />
                Gözlemler
              </div>
              <ul className="space-y-1.5">
                {data.aiSuggestions.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[12px] text-slate-300">
                    <span className="mt-0.5 shrink-0 text-accent">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">AI önerileri şu an kullanılamıyor.</p>
          )}
          {data.asOf && (
            <p className="mt-2 text-right text-[10px] text-slate-500">
              Hesaplama: {data.asOf} {data.fromCache && '(cache)'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MetricPill({ icon, label, score, max }: { icon: React.ReactNode; label: string; score: number; max: number }) {
  const pct = (score / max) * 100;
  const colorClass = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-yellow-400' : pct >= 40 ? 'text-orange-400' : 'text-red-400';
  return (
    <div className="rounded-md bg-bg-card px-2 py-1.5">
      <div className="flex items-center gap-1 text-[9px] text-slate-500">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn('text-xs font-bold tabular-nums', colorClass)}>
        {score.toFixed(0)}
        <span className="text-slate-500">/{max}</span>
      </div>
    </div>
  );
}
