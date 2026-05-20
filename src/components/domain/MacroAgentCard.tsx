import { useEffect, useState } from 'react';
import { Globe, RefreshCw, Sparkles, Info, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { runMacroAgent, type MacroAgentResponse, type MacroAgentDriver, riskTone } from '@/data/api/macroAgent';
import { cn } from '@/lib/utils';

/**
 * Macro Agent kartı — Claude Haiku ile günlük makro risk briefingi.
 * RiskScore gauge + headline + commentary + drivers + snapshot grid.
 */
export function MacroAgentCard() {
  const [data, setData] = useState<MacroAgentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = async (force = false) => {
    setRefreshing(force);
    if (!force) setLoading(true);
    const res = await runMacroAgent(force);
    setData(res);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !data) {
    return (
      <div className="card p-4">
        <Header refreshing={false} onRefresh={() => run(true)} />
        <Skeleton variant="rect" height={180} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-4">
        <Header refreshing={refreshing} onRefresh={() => run(true)} />
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          <Info size={12} className="mr-1 inline -mt-0.5" />
          Macro Agent şu anda ulaşılamıyor. Yerel dev sunucusunda Pages Functions
          çalışmaz — production'da görülür.
        </div>
      </div>
    );
  }

  if (!data.ok) {
    return (
      <div className="card p-4">
        <Header refreshing={refreshing} onRefresh={() => run(true)} />
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          <AlertTriangle size={12} className="mt-0.5" />
          <div>
            <div className="font-semibold">Macro Agent hata verdi</div>
            <div className="mt-1 text-[11px] text-slate-400">{data.error ?? 'Bilinmeyen'}</div>
          </div>
        </div>
      </div>
    );
  }

  const tone = riskTone(data.riskLabel);
  const score = data.riskScore ?? 50;

  return (
    <div className="card p-4">
      <Header refreshing={refreshing} onRefresh={() => run(true)} generatedAt={data.generatedAt} />

      {/* Headline + Risk Score */}
      <div className={cn('flex items-start gap-4 rounded-lg border p-4', tone.border, tone.bg)}>
        <RiskGauge score={score} tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', tone.bg, tone.text)}>
              {data.riskLabel ?? 'belirsiz'}
            </span>
            <span className="text-[10px] text-slate-500">risk</span>
          </div>
          {data.headline && (
            <h3 className="mt-1 text-sm font-semibold leading-snug text-slate-100">
              {data.headline}
            </h3>
          )}
          {data.commentary && (
            <p className="mt-2 text-[12px] leading-relaxed text-slate-300">
              {data.commentary}
            </p>
          )}
        </div>
      </div>

      {/* Drivers */}
      {data.drivers && data.drivers.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ana Sürücüler</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.drivers.map((d, i) => (
              <DriverCard key={i} driver={d} />
            ))}
          </div>
        </div>
      )}

      {/* Snapshot grid */}
      {data.snapshot && data.snapshot.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300">
            ▸ Tarama Anlık Görüntü ({data.snapshot.length} gösterge)
          </summary>
          <div className="mt-2 grid gap-1 grid-cols-2 sm:grid-cols-4">
            {data.snapshot.map((s) => {
              const up = s.changePct >= 0;
              const sign = up ? '+' : '';
              return (
                <div key={s.symbol} className="rounded border border-border bg-bg-soft px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 truncate" title={s.label}>{s.label}</div>
                  <div className="mt-0.5 flex items-center justify-between gap-1">
                    <span className="text-xs font-bold tabular-nums text-slate-100">
                      {s.value.toLocaleString('en-US', { maximumFractionDigits: s.value < 10 ? 4 : 2 })}
                    </span>
                    <span className={cn('text-[10px] tabular-nums', up ? 'text-success' : 'text-danger')}>
                      {sign}{s.changePct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function Header({ refreshing, onRefresh, generatedAt }: {
  refreshing: boolean;
  onRefresh: () => void;
  generatedAt?: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent">
        <Globe size={14} />
      </span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Macro Agent</h2>
      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
        <Sparkles size={9} className="-mt-0.5 mr-0.5 inline" />
        claude
      </span>
      {generatedAt && (
        <span className="text-[10px] text-slate-500">
          {new Date(generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="btn-ghost ml-auto text-xs"
      >
        <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> Yenile
      </button>
    </div>
  );
}

function RiskGauge({ score, tone }: { score: number; tone: { text: string; border: string } }) {
  // Yarım daire gauge: 0 = sol, 100 = sağ
  const r = 32;
  const C = Math.PI * r; // yarım çevre
  const offset = C - (score / 100) * C;
  return (
    <div className="relative flex-shrink-0">
      <svg width="80" height="50" viewBox="0 0 80 50">
        {/* Track */}
        <path
          d={`M 8 42 A ${r} ${r} 0 0 1 72 42`}
          fill="none"
          stroke="#1f2a44"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Active arc */}
        <path
          d={`M 8 42 A ${r} ${r} 0 0 1 72 42`}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          className={tone.text}
        />
        <text x="40" y="36" textAnchor="middle" className="fill-slate-100" fontSize="16" fontWeight="700">
          {score}
        </text>
        <text x="40" y="46" textAnchor="middle" className="fill-slate-500" fontSize="7" letterSpacing="0.5">
          / 100
        </text>
      </svg>
    </div>
  );
}

function DriverCard({ driver }: { driver: MacroAgentDriver }) {
  const Icon = driver.impact === 'pozitif' ? TrendingUp : driver.impact === 'negatif' ? TrendingDown : Minus;
  const klass = driver.impact === 'pozitif' ? 'text-success border-success/30 bg-success/5' :
                driver.impact === 'negatif' ? 'text-danger border-danger/30 bg-danger/5' :
                'text-slate-400 border-border bg-bg-soft';
  return (
    <div className={cn('rounded border p-2.5', klass)}>
      <div className="flex items-center gap-1.5">
        <Icon size={11} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{driver.name}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-300">{driver.note}</p>
    </div>
  );
}
