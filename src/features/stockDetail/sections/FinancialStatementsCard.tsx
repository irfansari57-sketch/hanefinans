/**
 * FinancialStatementsCard — Hisse detay sayfasında şirket finansalları.
 *
 * Veri: /api/stocks/:symbol/financials (FVT proxy)
 *   - Son 11 çeyrek: Net Satış, Brüt Kar, FAVÖK, Net Kar, Toplam Varlık, Özsermaye, Net Borç
 *   - Çarpanlar: FK, PDDD, FD/FAVÖK, Piyasa Değeri, Ödenmiş Sermaye, Fiili Dolaşım
 *
 * UI felsefesi: FVT'nin ağaç-ağır tablosundan farklı — çeyreklik mini-bar
 * grafikleri + metrik kartları ile görsel özet.
 */

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCompact } from '@/lib/format';

interface Period {
  donem: string;
  donemTarihi: string;
  toplamVarliklar: number | null;
  ozsermaye: number | null;
  netBorc: number | null;
  netSatis: number | null;
  brutKar: number | null;
  faaliyetKari: number | null;
  favok: number | null;
  netKar: number | null;
  nakitNakitBenzerleri: number | null;
  gonderimTarihi: string;
}

interface Carpanlar {
  fk: number | null;
  pddd: number | null;
  fdFavok: number | null;
  piyasaDegeri: number | null;
  odenmisSermaye: number | null;
  fiiliDolasimOrani: number | null;
}

interface FinancialsResp {
  ok: boolean;
  symbol?: string;
  source?: string;
  updatedAt?: string;
  lastReport?: string | null;
  periods?: Period[];
  carpanlar?: Carpanlar | null;
  error?: string;
}

type MetricKey = 'netSatis' | 'brutKar' | 'favok' | 'netKar' | 'faaliyetKari';

const METRIC_LABELS: Record<MetricKey, string> = {
  netSatis: 'Net Satış',
  brutKar: 'Brüt Kar',
  favok: 'FAVÖK',
  faaliyetKari: 'Faaliyet Karı',
  netKar: 'Net Kar',
};

function formatTRY(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `₺${formatCompact(v)}`;
}

function formatRatio(v: number | null | undefined, suffix = ''): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}${suffix}`;
}

function pctChange(a: number | null, b: number | null): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

interface Props {
  symbol: string;
}

export function FinancialStatementsCard({ symbol }: Props) {
  const [data, setData] = useState<FinancialsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>('netSatis');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/financials`);
        const j = (await r.json()) as FinancialsResp;
        if (cancelled) return;
        if (!j.ok) {
          setError(j.error ?? 'Veri alınamadı');
          setData(null);
        } else {
          setData(j);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fetch hatası');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [symbol]);

  // Grafik için son 8 çeyreği eski → yeni sırada
  const chartPeriods = useMemo(() => {
    if (!data?.periods) return [];
    return [...data.periods].slice(0, 8).reverse();
  }, [data]);

  const chartMax = useMemo(() => {
    if (chartPeriods.length === 0) return 0;
    return Math.max(...chartPeriods.map((p) => Math.abs(p[metric] ?? 0)));
  }, [chartPeriods, metric]);

  const latest = data?.periods?.[0];
  const prev = data?.periods?.[1];
  const yoy = data?.periods?.[4]; // 4 çeyrek önce = YoY karşılaştırma

  if (loading) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <BarChart3 size={14} /> Şirket Finansalları
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw size={11} className="animate-spin" /> Yükleniyor…
        </div>
      </div>
    );
  }

  if (error || !data?.periods || data.periods.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <BarChart3 size={14} /> Şirket Finansalları
        </div>
        <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-amber-500/70" />
          <span>Bu sembol için finansal rapor verisi bulunamadı. {error ? `(${error})` : ''}</span>
        </div>
      </div>
    );
  }

  const c = data.carpanlar;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <BarChart3 size={14} /> Şirket Finansalları
        </h3>
        <div className="text-[10px] text-slate-500">
          {data.lastReport ? `Son rapor: ${data.lastReport}` : ''}
        </div>
      </div>

      {/* Çarpanlar strip */}
      {c && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border bg-bg-soft/40 px-5 py-3 sm:grid-cols-3 lg:grid-cols-6">
          <RatioItem label="F/K" value={formatRatio(c.fk)} />
          <RatioItem label="PD/DD" value={formatRatio(c.pddd)} />
          <RatioItem label="FD/FAVÖK" value={formatRatio(c.fdFavok)} />
          <RatioItem label="Piyasa Değeri" value={formatTRY(c.piyasaDegeri)} />
          <RatioItem label="Ödenmiş Sermaye" value={formatTRY(c.odenmisSermaye)} />
          <RatioItem label="Fiili Dolaşım" value={c.fiiliDolasimOrani != null ? `%${c.fiiliDolasimOrani.toFixed(1)}` : '—'} />
        </div>
      )}

      {/* Son çeyrek özeti + YoY karşılaştırma */}
      {latest && (
        <div className="grid grid-cols-2 gap-3 border-b border-border px-5 py-4 sm:grid-cols-4">
          <SummaryCard
            label="Net Satış"
            value={formatTRY(latest.netSatis)}
            yoy={pctChange(latest.netSatis, yoy?.netSatis ?? null)}
            period={latest.donem}
          />
          <SummaryCard
            label="FAVÖK"
            value={formatTRY(latest.favok)}
            yoy={pctChange(latest.favok, yoy?.favok ?? null)}
            period={latest.donem}
          />
          <SummaryCard
            label="Net Kar"
            value={formatTRY(latest.netKar)}
            yoy={pctChange(latest.netKar, yoy?.netKar ?? null)}
            period={latest.donem}
          />
          <SummaryCard
            label="Net Borç"
            value={formatTRY(latest.netBorc)}
            yoy={pctChange(latest.netBorc, yoy?.netBorc ?? null)}
            period={latest.donem}
            invertColor
          />
        </div>
      )}

      {/* Metrik seçici + çeyreklik bar grafiği */}
      <div className="px-5 py-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(Object.keys(METRIC_LABELS) as MetricKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                metric === k
                  ? 'bg-accent text-white'
                  : 'bg-bg-soft text-slate-400 hover:bg-bg-card hover:text-slate-200',
              )}
            >
              {METRIC_LABELS[k]}
            </button>
          ))}
        </div>

        <div className="flex items-end justify-between gap-1" style={{ minHeight: '140px' }}>
          {chartPeriods.map((p) => {
            const v = p[metric];
            const abs = v != null ? Math.abs(v) : 0;
            const MAX_BAR_PX = 110;
            const h = chartMax > 0 ? Math.max(3, (abs / chartMax) * MAX_BAR_PX) : 0;
            const negative = v != null && v < 0;
            return (
              <div key={p.donem} className="group flex flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    'w-full min-w-[12px] rounded-t transition-opacity hover:opacity-80',
                    negative ? 'bg-danger' : 'bg-accent',
                  )}
                  style={{ height: `${h}px` }}
                  title={`${p.donem} · ${formatTRY(v)}`}
                />
                <div className="text-[9px] tabular-nums text-slate-500 whitespace-nowrap">{p.donem}</div>
              </div>
            );
          })}
        </div>

        {/* Çeyreklik QoQ delta */}
        {latest && prev && (
          <div className="mt-3 flex items-center gap-4 text-[11px]">
            <QoQBadge
              label="QoQ"
              value={pctChange(latest[metric], prev[metric])}
            />
            <QoQBadge
              label="YoY"
              value={pctChange(latest[metric], yoy?.[metric] ?? null)}
            />
          </div>
        )}
      </div>

      {/* Bilanço özeti */}
      {latest && (
        <div className="border-t border-border bg-bg-soft/30 px-5 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Bilanço · {latest.donem}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-4">
            <BilancoRow label="Toplam Varlıklar" value={formatTRY(latest.toplamVarliklar)} />
            <BilancoRow label="Özsermaye" value={formatTRY(latest.ozsermaye)} />
            <BilancoRow label="Net Borç" value={formatTRY(latest.netBorc)} />
            <BilancoRow label="Nakit" value={formatTRY(latest.nakitNakitBenzerleri)} />
          </div>
        </div>
      )}
    </div>
  );
}

function RatioItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-slate-100">{value}</div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  yoy,
  period,
  invertColor,
}: {
  label: string;
  value: string;
  yoy: number | null;
  period: string;
  invertColor?: boolean;
}) {
  const positive = yoy != null && yoy > 0;
  const good = invertColor ? !positive : positive;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-base font-bold tabular-nums text-slate-100">{value}</div>
      {yoy != null && (
        <div className={cn('mt-0.5 flex items-center gap-1 text-[10px] font-medium', good ? 'text-success' : 'text-danger')}>
          {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          <span className="tabular-nums">{yoy > 0 ? '+' : ''}{yoy.toFixed(1)}%</span>
          <span className="text-slate-500">YoY</span>
        </div>
      )}
      <div className="text-[9px] text-slate-600">{period}</div>
    </div>
  );
}

function BilancoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium tabular-nums text-slate-200">{value}</span>
    </div>
  );
}

function QoQBadge({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const positive = value > 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-500">{label}:</span>
      <span className={cn('font-semibold tabular-nums', positive ? 'text-success' : 'text-danger')}>
        {positive ? '+' : ''}{value.toFixed(1)}%
      </span>
    </div>
  );
}
