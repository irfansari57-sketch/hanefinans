/**
 * Admin > Data Quality Dashboard
 *
 * Client-side telemetriden gelen 24 saatlik veri kalite raporunu gosterir.
 * Backend health endpoint'i (/api/health/data-quality) ile birlestirilebilir.
 */
import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, Trash2, Shield, Activity } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { getDQLog, summarizeDQLog, clearDQLog, type DQLogEntry, levelColor } from '@/lib/dataQuality';
import { useAuth, isAdmin } from '@/store/auth';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

interface BackendHealth {
  ok: boolean;
  checkedAt?: string;
  yahoo?: { ok: boolean; latency?: number; error?: string };
  tefas?: { ok: boolean; latency?: number; error?: string };
  bist?: { ok: boolean; latency?: number; error?: string };
  crypto?: { ok: boolean; latency?: number; error?: string };
  news?: { ok: boolean; count?: number };
}

export function DataQualityPage() {
  const user = useAuth((s) => s.user);
  const admin = isAdmin(user);
  const [tick, setTick] = useState(0);
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  useEffect(() => {
    // 30 saniyede bir refresh
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const refreshBackendHealth = async () => {
    setLoadingHealth(true);
    try {
      const r = await fetch('/api/health/data-quality');
      if (r.ok) {
        const json = (await r.json()) as BackendHealth;
        setBackendHealth(json);
      }
    } catch {
      setBackendHealth({ ok: false, checkedAt: new Date().toISOString() });
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    refreshBackendHealth();
  }, []);

  if (!admin) {
    return (
      <EmptyState
        icon={<Shield size={28} />}
        title="Sadece yönetici"
        description="Bu sayfa yönetici kullanıcılara özeldir."
      />
    );
  }

  const entries = getDQLog();
  const summary = summarizeDQLog();

  return (
    <>
      <PageHeader
        title="Data Quality Dashboard"
        subtitle="24 saatlik veri kalite raporu — client-side telemetri + backend feed sağlığı"
      />

      {/* Backend Feed Health */}
      <div className="card mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Shield size={14} className="text-accent" />
            Backend Feed Sağlığı
          </h2>
          <button
            type="button"
            onClick={refreshBackendHealth}
            disabled={loadingHealth}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[11px] text-slate-400 hover:border-accent/40 hover:text-accent disabled:opacity-50"
          >
            <RefreshCw size={11} className={loadingHealth ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>
        {backendHealth ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <HealthCard label="Yahoo" status={backendHealth.yahoo} />
            <HealthCard label="TEFAS" status={backendHealth.tefas} />
            <HealthCard label="BIST" status={backendHealth.bist} />
            <HealthCard label="Kripto" status={backendHealth.crypto} />
            <HealthCard label="Haberler" status={backendHealth.news} />
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">Backend health yükleniyor...</div>
        )}
        {backendHealth?.checkedAt && (
          <div className="mt-2 text-[10px] text-slate-500">
            Kontrol: {new Date(backendHealth.checkedAt).toLocaleString('tr-TR')}
          </div>
        )}
      </div>

      {/* Client Telemetri Özet Kartları */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Toplam Event" value={summary.total} />
        <StatCard label="Otomatik Düzeltme" value={`${summary.correctionRate.toFixed(0)}%`} />
        <StatCard
          label="Yüksek Güven"
          value={summary.byLevel.high}
          accent="text-success"
        />
        <StatCard
          label="Sorunlu"
          value={summary.byLevel.low + summary.byLevel.invalid}
          accent="text-danger"
        />
      </div>

      {/* Seviye Dağılımı */}
      <div className="card mb-4 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Güven Seviyesi Dağılımı (24s)</h2>
        <div className="space-y-2">
          {(['high', 'medium', 'low', 'invalid'] as const).map((lvl) => {
            const count = summary.byLevel[lvl];
            const pct = summary.total > 0 ? (count / summary.total) * 100 : 0;
            const labels = { high: 'Yüksek', medium: 'Orta', low: 'Düşük', invalid: 'Bozuk' };
            return (
              <div key={lvl}>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className={cn('font-medium', levelColor(lvl).split(' ')[0])}>{labels[lvl]}</span>
                  <span className="tabular-nums text-slate-400">{count} ({pct.toFixed(1)}%)</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg-soft">
                  <div
                    className={cn(
                      'h-full transition-all',
                      lvl === 'high' && 'bg-success',
                      lvl === 'medium' && 'bg-warning',
                      lvl === 'low' && 'bg-danger',
                      lvl === 'invalid' && 'bg-slate-500',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sorunlu Semboller */}
      {summary.topProblemSymbols.length > 0 && (
        <div className="card mb-4 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <AlertCircle size={14} className="text-warning" />
            En Sorunlu 20 Sembol
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border text-left text-slate-500">
                  <th className="pb-2">Sembol</th>
                  <th className="pb-2 text-right">Olay</th>
                  <th className="pb-2 text-right">Ort. Güven</th>
                </tr>
              </thead>
              <tbody>
                {summary.topProblemSymbols.map((s) => (
                  <tr key={s.symbol} className="border-b border-border/50 hover:bg-bg-soft/40">
                    <td className="py-1.5 font-mono font-semibold text-accent">{s.symbol}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-300">{s.count}</td>
                    <td
                      className={cn(
                        'py-1.5 text-right tabular-nums font-semibold',
                        s.avgConfidence >= 80 && 'text-success',
                        s.avgConfidence >= 50 && s.avgConfidence < 80 && 'text-warning',
                        s.avgConfidence < 50 && 'text-danger',
                      )}
                    >
                      {s.avgConfidence.toFixed(0)}/100
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Son Event Feed */}
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Son 50 Event</h2>
          <button
            type="button"
            onClick={() => {
              if (confirm('Data quality logunu temizlemek istediğinden emin misin?')) {
                clearDQLog();
                setTick((t) => t + 1);
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[11px] text-danger hover:bg-danger/20"
          >
            <Trash2 size={11} />
            Temizle
          </button>
        </div>
        {entries.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-slate-500">
            Son 24 saatte kaydedilmiş data quality event yok.
          </div>
        ) : (
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {entries.slice(-50).reverse().map((e, i) => (
              <EventRow key={i} entry={e} tick={tick} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', accent ?? 'text-slate-100')}>{value}</div>
    </div>
  );
}

function HealthCard({ label, status }: { label: string; status?: { ok: boolean; latency?: number; error?: string; count?: number } }) {
  const ok = status?.ok === true;
  return (
    <div
      className={cn(
        'rounded-lg border p-2',
        ok ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5',
      )}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400">
        {ok ? <CheckCircle2 size={11} className="text-success" /> : <AlertCircle size={11} className="text-danger" />}
        {label}
      </div>
      <div className={cn('mt-1 text-sm font-bold', ok ? 'text-success' : 'text-danger')}>
        {status ? (ok ? (status.count != null ? `${status.count}` : `${status.latency ?? '—'}ms`) : 'HATA') : '—'}
      </div>
      {status?.error && (
        <div className="mt-0.5 truncate text-[9px] text-danger/80" title={status.error}>
          {status.error}
        </div>
      )}
    </div>
  );
}

function EventRow({ entry, tick: _tick }: { entry: DQLogEntry; tick: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={cn(
        'rounded-md border px-2 py-1.5 text-[11px]',
        levelColor(entry.level),
      )}
    >
      <div
        className="flex cursor-pointer items-center gap-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="font-mono font-semibold">{entry.symbol}</span>
        <span className="text-[10px] uppercase tracking-wider opacity-70">{entry.kind}</span>
        <span className="ml-auto text-[10px] tabular-nums opacity-70">
          {entry.confidence}/100
        </span>
        <span className="text-[10px] opacity-60">
          {new Date(entry.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {expanded && (
        <div className="mt-1 space-y-0.5 border-t border-current pt-1 text-[10px] opacity-80">
          {entry.warnings.map((w, i) => (
            <div key={i} className="flex gap-1">
              <span>•</span>
              <span>{w}</span>
            </div>
          ))}
          {entry.correctedApplied && (
            <div className="font-semibold">✓ Otomatik düzeltme uygulandı</div>
          )}
        </div>
      )}
    </div>
  );
}
