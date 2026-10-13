/**
 * RiskReportCard — Portföy risk raporu v1 (deterministik).
 *
 * Konsantrasyon + sektör + 60g volatilite/maks düşüş; açıklamalı uyarılar.
 * Fiyat geçmişi: en büyük 12 pozisyon için Yahoo 3 aylık günlük kapanış
 * (throttle'lı, paylaşılan cache). Yatırım tavsiyesi değildir.
 */

import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, ShieldCheck, Info, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeRiskReport, type RiskPosition } from '@/lib/portfolioRisk';
import { fetchHistoricalYahoo } from '@/data/api/yahoo';
import { findBistStock } from '@/data/bistAll';

interface Props {
  positions: RiskPosition[];
}

export function RiskReportCard({ positions }: Props) {
  const [closes, setCloses] = useState<Record<string, number[]>>({});
  const [loadingHist, setLoadingHist] = useState(false);

  // Sektör: satırda yoksa bistAll'dan tamamla
  const enriched = useMemo<RiskPosition[]>(
    () => positions.map((p) => ({ ...p, sector: p.sector ?? findBistStock(p.symbol)?.sector })),
    [positions],
  );

  // En büyük 12 hisse pozisyonu için 3 aylık günlük kapanış
  const histSymbols = useMemo(() => {
    const stockOnly = enriched.filter((p) => !p.kind || p.kind === 'stock');
    return [...stockOnly].sort((a, b) => b.marketValue - a.marketValue).slice(0, 12).map((p) => p.symbol);
  }, [enriched]);

  useEffect(() => {
    if (histSymbols.length === 0) return;
    let alive = true;
    setLoadingHist(true);
    Promise.all(
      histSymbols.map(async (s): Promise<[string, number[]]> => {
        try {
          const h = await fetchHistoricalYahoo(s, '3mo', '1d', { bistSuffix: true });
          return [s, h?.closes.map((c) => c.close) ?? []];
        } catch {
          return [s, []];
        }
      }),
    ).then((pairs) => {
      if (!alive) return;
      const m: Record<string, number[]> = {};
      for (const [s, c] of pairs) if (c.length > 0) m[s] = c;
      setCloses(m);
      setLoadingHist(false);
    });
    return () => { alive = false; };
  }, [histSymbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const report = useMemo(() => computeRiskReport(enriched, closes), [enriched, closes]);
  if (!report) return null;

  const tone = report.score < 30 ? 'text-success' : report.score < 50 ? 'text-slate-100' : report.score < 70 ? 'text-warning' : 'text-danger';
  const Icon = report.score < 50 ? ShieldCheck : ShieldAlert;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Icon size={14} className={tone} /> Risk Raporu
          <span className="rounded border border-border bg-bg-soft px-1.5 py-0.5 text-[10px] font-normal text-slate-500">v1 · deterministik</span>
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          {loadingHist && <RefreshCw size={10} className="animate-spin" />}
          <span>Geçmiş veri, gelecek garantisi değildir</span>
        </div>
      </div>

      {/* Skor + özet metrikler */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Risk skoru" value={`${report.score}`} sub={report.scoreLabel} tone={tone} />
        <Metric label="En büyük pozisyon" value={report.topWeight ? `%${(report.topWeight.weight * 100).toFixed(0)}` : '—'} sub={report.topWeight?.symbol} />
        <Metric label="İlk 3 ağırlığı" value={`%${(report.top3Weight * 100).toFixed(0)}`} />
        <Metric label="Etkin pozisyon" value={report.effectiveN.toFixed(1)} sub={`${report.positionCount} kayıt`} title="1/HHI — ağırlıklar dengesizse gerçek pozisyon sayısından küçük çıkar" />
        <Metric label="Volatilite (60g, yıllık)" value={report.vol60Annualized != null ? `%${report.vol60Annualized.toFixed(0)}` : '—'} sub={report.volCoverage < 1 ? `kapsam %${(report.volCoverage * 100).toFixed(0)}` : undefined} />
        <Metric label="Maks. düşüş (60g)" value={report.maxDrawdown60 != null ? `%${report.maxDrawdown60.toFixed(1)}` : '—'} tone={report.maxDrawdown60 != null && report.maxDrawdown60 <= -15 ? 'text-danger' : undefined} />
      </div>

      {/* Sektör dağılımı */}
      <div className="border-b border-border px-5 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sektör / varlık dağılımı</div>
        <div className="flex h-2.5 w-full overflow-hidden rounded bg-bg-soft">
          {report.sectors.map((s, i) => (
            <div
              key={s.sector}
              className={cn('h-full', SECTOR_COLORS[i % SECTOR_COLORS.length])}
              style={{ width: `${s.weight * 100}%` }}
              title={`${s.sector}: %${(s.weight * 100).toFixed(1)}`}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {report.sectors.slice(0, 8).map((s, i) => (
            <span key={s.sector} className="flex items-center gap-1 text-slate-400">
              <span className={cn('inline-block h-2 w-2 rounded-sm', SECTOR_COLORS[i % SECTOR_COLORS.length])} />
              {s.sector} <span className="tabular-nums text-slate-500">%{(s.weight * 100).toFixed(0)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Uyarılar */}
      <div className="px-5 py-3">
        {report.warnings.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-success"><ShieldCheck size={12} /> Belirgin bir konsantrasyon veya volatilite uyarısı yok.</div>
        ) : (
          <ul className="space-y-2">
            {report.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {w.level === 'high' ? <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger" />
                  : w.level === 'warn' ? <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" />
                  : <Info size={13} className="mt-0.5 shrink-0 text-slate-500" />}
                <div>
                  <div className={cn('font-medium', w.level === 'high' ? 'text-danger' : w.level === 'warn' ? 'text-warning' : 'text-slate-300')}>{w.title}</div>
                  <div className="text-slate-500">{w.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[10px] text-slate-600">
          Yöntem: HHI = Σ ağırlık²; etkin pozisyon = 1/HHI; volatilite = ağırlıklı günlük getiri std × √252 (son 60 iş günü, Yahoo);
          maksimum düşüş aynı seride tepe→dip. Bilgi amaçlıdır, yatırım tavsiyesi değildir.
        </p>
      </div>
    </div>
  );
}

const SECTOR_COLORS = ['bg-accent', 'bg-success', 'bg-warning', 'bg-danger', 'bg-sky-500', 'bg-violet-500', 'bg-pink-500', 'bg-teal-500', 'bg-slate-500'];

function Metric({ label, value, sub, tone, title }: { label: string; value: string; sub?: string; tone?: string; title?: string }) {
  return (
    <div title={title}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('text-base font-bold tabular-nums', tone ?? 'text-slate-100')}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}
