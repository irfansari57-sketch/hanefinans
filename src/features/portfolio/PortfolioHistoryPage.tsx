/**
 * /portfoy/gecmis — Portföy geçmişi (aylık/haftalık trend)
 *
 * D1'deki portfolio_snapshots'tan çekilen zaman serisi:
 *   - Line chart: son 30/90/365 gün toplam değer
 *   - Özet kartlar: bugün vs 1 hafta / 1 ay / 3 ay önce
 *   - En son 20 snapshot tablosu (tarih, değer, K/Z%)
 *
 * Auth zorunlu. Anon → giriş yap CTA.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, TrendingUp, TrendingDown, RefreshCw, Save } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { useAuth } from '@/store/auth';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';

interface Snapshot {
  asOf: string;
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  positionCount: number;
  createdAt: number;
}

export function PortfolioHistoryPage() {
  const user = useAuth((s) => s.user);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<30 | 90 | 365>(90);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/portfolio/snapshots?days=${days}`, { credentials: 'include' })
      .then((r) => r.json() as Promise<{ ok: boolean; snapshots?: Snapshot[]; error?: string }>)
      .then((r) => {
        if (!alive) return;
        if (r.ok && r.snapshots) setSnapshots(r.snapshots);
      })
      .catch(() => { /* ignore */ })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [user, days]);

  const stats = useMemo(() => {
    if (snapshots.length === 0) return null;
    const last = snapshots[snapshots.length - 1];
    const findAgo = (d: number): Snapshot | null => {
      const target = new Date(last.asOf);
      target.setDate(target.getDate() - d);
      const targetISO = target.toISOString().slice(0, 10);
      let best: Snapshot | null = null;
      for (const s of snapshots) {
        if (s.asOf <= targetISO) best = s;
        else break;
      }
      return best;
    };
    const w = findAgo(7);
    const m = findAgo(30);
    const q = findAgo(90);
    const pct = (from?: Snapshot | null) =>
      from && from.totalValue > 0 ? ((last.totalValue - from.totalValue) / from.totalValue) * 100 : null;
    return {
      current: last.totalValue,
      week: pct(w),
      month: pct(m),
      quarter: pct(q),
    };
  }, [snapshots]);

  const takeSnapshot = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // PortfolioPage'in canlı verisini alamayız burada; kullanıcıyı portfoy sayfasına yönlendir
      toast.info('Snapshot almak için önce Portföyüm sayfasına gitmen gerekiyor', 'Otomatik gün sonu snapshot yakında eklenecek');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <>
        <SeoHead title="Portföy Geçmişi" description="Portföy değeri trend analizi" path="/portfoy/gecmis" noindex />
        <PageHeader title="Portföy Geçmişi" subtitle="Aylık ve haftalık portföy değer trendi." />
        <EmptyState
          icon={<History size={28} />}
          title="Giriş yap"
          description="Portföy geçmişini görmek için giriş yapman gerekiyor."
        />
      </>
    );
  }

  return (
    <>
      <SeoHead title="Portföy Geçmişi" description="Portföy değeri trend analizi" path="/portfoy/gecmis" noindex />
      <PageHeader
        title="Portföy Geçmişi"
        subtitle="Aylık ve haftalık portföy değer trendi."
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border bg-bg-soft p-0.5">
              {([30, 90, 365] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={cn(
                    'rounded-sm px-2.5 py-1 text-[11px] font-medium transition',
                    days === d ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
                  )}
                >
                  {d === 30 ? '30G' : d === 90 ? '3A' : '1Y'}
                </button>
              ))}
            </div>
            <button className="btn-secondary" onClick={takeSnapshot} disabled={saving}>
              <Save size={14} /> Şimdi Snapshot
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="card p-6">
          <Skeleton variant="rect" className="w-full mb-3" height={80} />
          <Skeleton variant="rect" className="w-full" height={200} />
        </div>
      ) : snapshots.length === 0 ? (
        <div>
          <EmptyState
            icon={<History size={28} />}
            title="Henüz snapshot yok"
            description="Portföy geçmişi otomatik alınacak — Portföyüm sayfasını ilk açtığında ilk snapshot yazılır. Ertesi gün grafiği görebilirsin."
          />
          <div className="mt-3 text-center">
            <Link to="/portfoy" className="text-accent hover:underline text-sm">
              Portföyüme git →
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Özet kartlar */}
          {stats && (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Bugünkü Değer" value={formatMoney(stats.current)} />
              <StatCard label="1 Hafta" pct={stats.week} />
              <StatCard label="1 Ay" pct={stats.month} />
              <StatCard label="3 Ay" pct={stats.quarter} />
            </div>
          )}

          {/* SVG Line Chart */}
          <div className="card mb-4 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Değer Trendi</h2>
              <span className="text-[10px] text-slate-500">{snapshots.length} snapshot</span>
            </div>
            <LineChart data={snapshots} />
          </div>

          {/* Tablo */}
          <div className="card overflow-hidden">
            <div className="border-b border-border px-4 py-2.5 text-sm font-semibold text-slate-200">
              Son Snapshotlar
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-bg-soft/40">
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2">Tarih</th>
                    <th className="px-3 py-2 text-right">Değer</th>
                    <th className="px-3 py-2 text-right">Maliyet</th>
                    <th className="px-3 py-2 text-right">K/Z</th>
                    <th className="px-3 py-2 text-right">K/Z %</th>
                    <th className="px-3 py-2 text-right">Poz.</th>
                  </tr>
                </thead>
                <tbody>
                  {[...snapshots].reverse().slice(0, 40).map((s) => (
                    <tr key={s.asOf} className="border-t border-border/50 hover:bg-bg-soft/40">
                      <td className="px-3 py-2 tabular-nums">{new Date(s.asOf).toLocaleDateString('tr-TR')}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(s.totalValue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{formatMoney(s.totalCost)}</td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums font-medium',
                          s.totalPnl >= 0 ? 'text-success' : 'text-danger',
                        )}
                      >
                        {s.totalPnl >= 0 ? '+' : ''}{formatMoney(s.totalPnl)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums font-bold',
                          s.totalPnlPct >= 0 ? 'text-success' : 'text-danger',
                        )}
                      >
                        {s.totalPnlPct >= 0 ? '+' : ''}{s.totalPnlPct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{s.positionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function StatCard({ label, value, pct }: { label: string; value?: string; pct?: number | null }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      {value && <div className="mt-1 text-lg font-bold text-slate-100 tabular-nums">{value}</div>}
      {pct != null && (
        <div
          className={cn(
            'mt-1 flex items-center gap-1 text-lg font-bold tabular-nums',
            pct >= 0 ? 'text-success' : 'text-danger',
          )}
        >
          {pct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </div>
      )}
      {pct === null && (
        <div className="mt-1 text-sm text-slate-500">—</div>
      )}
    </div>
  );
}

function LineChart({ data }: { data: Snapshot[] }) {
  if (data.length < 2) {
    return (
      <div className="py-8 text-center text-[11px] text-slate-500">
        Trend için en az 2 snapshot lazım.
      </div>
    );
  }

  const W = 800;
  const H = 240;
  const PAD_X = 40;
  const PAD_Y = 20;
  const values = data.map((d) => d.totalValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const xStep = (W - 2 * PAD_X) / (data.length - 1);
  const scaleY = (v: number) => H - PAD_Y - ((v - min) / range) * (H - 2 * PAD_Y);
  const points = data.map((d, i) => ({ x: PAD_X + i * xStep, y: scaleY(d.totalValue), d }));

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${path} L ${points[points.length - 1].x} ${H - PAD_Y} L ${points[0].x} ${H - PAD_Y} Z`;

  const positive = data[data.length - 1].totalValue >= data[0].totalValue;
  const stroke = positive ? '#22c55e' : '#ef4444';
  const fill = positive ? 'url(#gradG)' : 'url(#gradR)';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
      <defs>
        <linearGradient id="gradG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gradR" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Y-axis labels */}
      <text x="4" y={PAD_Y + 4} className="text-[9px] fill-slate-500">{formatMoney(max)}</text>
      <text x="4" y={H - PAD_Y} className="text-[9px] fill-slate-500">{formatMoney(min)}</text>
      {/* Area */}
      <path d={areaPath} fill={fill} />
      {/* Line */}
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" />
      {/* Endpoint dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="4"
        fill={stroke}
      />
      {/* X labels: ilk + orta + son */}
      {[0, Math.floor(data.length / 2), data.length - 1].map((i) => (
        <text
          key={i}
          x={points[i].x}
          y={H - 5}
          className="text-[9px] fill-slate-500"
          textAnchor="middle"
        >
          {new Date(data[i].asOf).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
        </text>
      ))}
    </svg>
  );
}
