/**
 * PortföyEquityCurve — kullanicinin gerçek pozisyon geçmişinden hesaplanan
 * portföy değer eğrisi + benchmark karşılaştırma (BIST 100, USD, Altın, TÜFE, Mevduat).
 *
 * Dollar-weighted karşılaştırma: "aynı parayı aynı tarihte X'e yatırsaydım
 * bugün ne olurdu?" — apples-to-apples.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { db } from '@/data/db';
import { fetchHistoricalYahoo } from '@/data/api/yahoo';
import { fetchTefasFundByCode } from '@/data/api/tefasGithub';
import { cn } from '@/lib/utils';
import { formatDateTR } from '@/lib/date';
import {
  computeEquityCurve, computeBenchmarkCurve, computeMetrics,
  type EquityPoint, type Transaction, type PricePoint,
} from './lib/computeEquityCurve';
import { BENCHMARKS, loadBenchmarks, type BenchmarkId } from './lib/loadBenchmarks';

type TimeRange = '1m' | '3m' | '6m' | 'ytd' | '1y' | 'max';
const RANGE_LABELS: Record<TimeRange, string> = {
  '1m': '1 Ay', '3m': '3 Ay', '6m': '6 Ay',
  ytd: 'YBB', '1y': '1 Yıl', max: 'Tümü',
};

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}M ₺`;
  if (Math.abs(n) >= 1_000)
    return `${(n / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}K ₺`;
  return `${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`;
}

function fmtPct(n: number, decimals = 2): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}

function computeStartDate(range: TimeRange, earliestTxDate: string): string {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (range === 'max') return earliestTxDate;
  const d = new Date();
  if (range === '1m') d.setMonth(d.getMonth() - 1);
  else if (range === '3m') d.setMonth(d.getMonth() - 3);
  else if (range === '6m') d.setMonth(d.getMonth() - 6);
  else if (range === '1y') d.setFullYear(d.getFullYear() - 1);
  else if (range === 'ytd') { d.setMonth(0); d.setDate(1); }
  const candidate = d.toISOString().slice(0, 10);
  // earliest txn'den önce ise, oradan başla
  return candidate < earliestTxDate ? earliestTxDate : candidate < today ? candidate : earliestTxDate;
}

export function PortfolioEquityCurve() {
  const rawTxns = useLiveQuery(() => db.portfolioTxns.toArray(), []) ?? [];
  const positions = useLiveQuery(() => db.portfolio.toArray(), []) ?? [];

  // Txn geçmişi yoksa (eski kayitlar), her pozisyondan sentetik tek işlem türet:
  // lot@avgPrice at addedAt (yaklaşık kabul; kullanici gerçek geçmişi eklerse detaylı olur).
  const txns = useMemo(() => {
    if (rawTxns.length > 0) return rawTxns;
    // Fallback: pozisyonlardan sentetik txn'ler
    return positions
      .filter((p) => p.lot > 0 && p.avgPrice > 0)
      .map((p) => ({
        symbol: p.symbol,
        kind: p.kind ?? 'stock',
        lot: p.lot,
        price: p.avgPrice,
        executedAt: p.addedAt,
      }));
  }, [rawTxns, positions]);
  const [range, setRange] = useState<TimeRange>('ytd');
  const [activeBench, setActiveBench] = useState<Set<BenchmarkId>>(
    () => new Set(['BIST100', 'TUFE']),
  );

  const [portfolioCurve, setPortfolioCurve] = useState<EquityPoint[]>([]);
  const [benchmarkCurves, setBenchmarkCurves] = useState<Map<BenchmarkId, EquityPoint[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceCache] = useState(() => new Map<string, PricePoint[]>());
  const runToken = useRef(0);

  // Kronolojik en eski txn tarihi (max range için)
  const earliestTxDate = useMemo(() => {
    if (txns.length === 0) return new Date().toISOString().slice(0, 10);
    const earliest = Math.min(...txns.map((t) => t.executedAt));
    return new Date(earliest).toISOString().slice(0, 10);
  }, [txns]);

  // Aktif range'e göre başlangıç
  const startDate = useMemo(() => computeStartDate(range, earliestTxDate), [range, earliestTxDate]);
  const endDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Historical prices + benchmark yükle → curve hesapla
  useEffect(() => {
    if (txns.length === 0) {
      setPortfolioCurve([]);
      setBenchmarkCurves(new Map());
      return;
    }
    const myToken = ++runToken.current;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Bu range'in içindeki txn'leri filtrele
        const rangeTxns: Transaction[] = txns
          .filter((t) => {
            const day = new Date(t.executedAt).toISOString().slice(0, 10);
            return day >= startDate;
          })
          .map((t) => ({
            symbol: t.symbol,
            kind: (t.kind ?? 'stock') as 'stock' | 'fund',
            lot: t.lot,
            price: t.price,
            executedAt: t.executedAt,
          }));

        if (rangeTxns.length === 0) {
          if (myToken === runToken.current) {
            setPortfolioCurve([]);
            setBenchmarkCurves(new Map());
            setLoading(false);
          }
          return;
        }

        // Uniq semboller
        const stockSymbols = Array.from(new Set(
          rangeTxns.filter((t) => t.kind === 'stock').map((t) => t.symbol),
        ));
        const fundSymbols = Array.from(new Set(
          rangeTxns.filter((t) => t.kind === 'fund').map((t) => t.symbol),
        ));

        // Historical prices — cache'den veya fetch
        const priceMap = new Map<string, PricePoint[]>();

        await Promise.all([
          ...stockSymbols.map(async (sym) => {
            const cacheKey = `stock:${sym}`;
            if (priceCache.has(cacheKey)) {
              priceMap.set(sym, priceCache.get(cacheKey)!);
              return;
            }
            const hs = await fetchHistoricalYahoo(sym, '5y', '1d', { bistSuffix: true });
            if (hs?.closes) {
              const points: PricePoint[] = hs.closes.map((c) => ({
                date: new Date(c.date).toISOString().slice(0, 10),
                price: c.close,
              }));
              priceCache.set(cacheKey, points);
              priceMap.set(sym, points);
            }
          }),
          ...fundSymbols.map(async (sym) => {
            const cacheKey = `fund:${sym}`;
            if (priceCache.has(cacheKey)) {
              priceMap.set(sym, priceCache.get(cacheKey)!);
              return;
            }
            const fund = await fetchTefasFundByCode(sym);
            if (fund?.history && fund.history.length > 0) {
              const points = fund.history
                .filter((h) => h.price > 0)
                .map((h) => ({ date: h.date, price: h.price }))
                .sort((a, b) => (a.date < b.date ? -1 : 1));
              priceCache.set(cacheKey, points);
              priceMap.set(sym, points);
            }
          }),
        ]);

        if (myToken !== runToken.current) return;

        // Portföy curve
        const pfCurve = computeEquityCurve(rangeTxns, priceMap, endDate);

        // Benchmarks
        const benchIds = Array.from(activeBench);
        const benchmarkPrices = await loadBenchmarks(benchIds, startDate, endDate);
        const benchCurves = new Map<BenchmarkId, EquityPoint[]>();
        for (const id of benchIds) {
          const priceHist = benchmarkPrices.get(id);
          if (priceHist && priceHist.length > 0) {
            benchCurves.set(id, computeBenchmarkCurve(rangeTxns, priceHist, endDate));
          }
        }

        if (myToken === runToken.current) {
          setPortfolioCurve(pfCurve);
          setBenchmarkCurves(benchCurves);
        }
      } catch (e) {
        if (myToken === runToken.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (myToken === runToken.current) setLoading(false);
      }
    })();
  }, [txns, startDate, endDate, activeBench, priceCache]);

  const metrics = useMemo(() => computeMetrics(portfolioCurve), [portfolioCurve]);

  // Benchmark performans farkı (portföy vs benchmark)
  const benchmarkComparisons = useMemo(() => {
    const out: Array<{ id: BenchmarkId; label: string; color: string; pct: number; diff: number }> = [];
    if (portfolioCurve.length === 0) return out;
    const pfLast = portfolioCurve[portfolioCurve.length - 1];
    const pfInvested = pfLast.costBasis;
    if (pfInvested <= 0) return out;
    for (const [id, bc] of benchmarkCurves.entries()) {
      if (bc.length === 0) continue;
      const bLast = bc[bc.length - 1];
      const bReturnPct = bLast.costBasis > 0 ? ((bLast.value - bLast.costBasis) / bLast.costBasis) * 100 : 0;
      const pfReturnPct = (pfLast.value - pfInvested) / pfInvested * 100;
      const meta = BENCHMARKS.find((b) => b.id === id)!;
      out.push({
        id,
        label: meta.label,
        color: meta.color,
        pct: bReturnPct,
        diff: pfReturnPct - bReturnPct,
      });
    }
    return out;
  }, [portfolioCurve, benchmarkCurves]);

  // Chart hover state
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const allDates = useMemo(() => portfolioCurve.map((p) => p.date), [portfolioCurve]);

  // Chart geometrisi
  const W = 800;
  const H = 300;
  const PAD = { top: 12, right: 12, bottom: 28, left: 60 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const { minV, maxV } = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    const consider = (v: number) => {
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    };
    for (const p of portfolioCurve) consider(p.value);
    for (const [, bc] of benchmarkCurves) {
      for (const p of bc) consider(p.value);
    }
    if (!Number.isFinite(mn)) { mn = 0; mx = 100; }
    const pad = (mx - mn) * 0.05 || mx * 0.05;
    return { minV: Math.max(0, mn - pad), maxV: mx + pad };
  }, [portfolioCurve, benchmarkCurves]);

  const xOf = (i: number) => allDates.length <= 1
    ? PAD.left + innerW / 2
    : PAD.left + (i / (allDates.length - 1)) * innerW;
  const yOf = (v: number) => {
    const range = maxV - minV || 1;
    return PAD.top + innerH - ((v - minV) / range) * innerH;
  };

  const dateToIdx = useMemo(() => {
    const m = new Map<string, number>();
    allDates.forEach((d, i) => m.set(d, i));
    return m;
  }, [allDates]);

  function pathFor(points: EquityPoint[]): string {
    if (!points.length) return '';
    let d = '';
    let started = false;
    for (const p of points) {
      const idx = dateToIdx.get(p.date);
      if (idx == null) continue;
      const x = xOf(idx);
      const y = yOf(p.value);
      if (!started) { d += `M${x.toFixed(1)},${y.toFixed(1)}`; started = true; }
      else d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
  }

  const yTicks = useMemo(() => {
    const step = (maxV - minV) / 4;
    return [0, 1, 2, 3, 4].map((k) => minV + step * k);
  }, [minV, maxV]);
  const xTicks = useMemo(() => {
    if (allDates.length <= 5) return allDates.map((_, i) => i);
    const step = (allDates.length - 1) / 4;
    return [0, 1, 2, 3, 4].map((k) => Math.round(k * step));
  }, [allDates]);

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    if (!svgRef.current || allDates.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = W / rect.width;
    const localX = (e.clientX - rect.left) * scaleX;
    const rel = (localX - PAD.left) / innerW;
    const idx = Math.round(rel * (allDates.length - 1));
    if (idx >= 0 && idx < allDates.length) setHoverIdx(idx);
  }

  if (txns.length === 0) {
    return (
      <div className="card mb-4 p-6 text-center">
        <BarChart3 className="mx-auto mb-2 text-slate-500" size={32} />
        <p className="text-sm text-slate-400">Portföyünüze pozisyon ekleyin — gelişim grafiği burada belirir.</p>
      </div>
    );
  }

  return (
    <div className="card mb-4 p-4">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <BarChart3 size={14} className="text-accent" /> Portföy Gelişim Grafiği
          </h2>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Dollar-weighted karşılaştırma — aynı parayı aynı tarihlerde benchmark'a yatırsaydınız
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Range chips */}
          <div className="inline-flex rounded-md border border-border bg-bg-soft p-0.5">
            {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  'rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wider transition',
                  range === r ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Benchmark chips */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Karşılaştır:
        </span>
        {BENCHMARKS.map((b) => {
          const on = activeBench.has(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                const nx = new Set(activeBench);
                if (on) nx.delete(b.id); else nx.add(b.id);
                setActiveBench(nx);
              }}
              className={cn(
                'flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition',
                on ? 'border-border bg-bg-card text-slate-100'
                   : 'border-border/40 bg-transparent text-slate-500',
              )}
              title={b.description}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: on ? b.color : '#666' }} />
              {b.label}
            </button>
          );
        })}
      </div>

      {/* Metrik kartları */}
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <MetricCard label="Portföy Değeri" value={fmtMoney(metrics.currentValue)} sub={`Yatırım: ${fmtMoney(metrics.initialValue)}`} accent="neutral" />
        <MetricCard label="Toplam Getiri" value={fmtPct(metrics.totalReturnPct)} sub={metrics.totalReturn >= 0 ? `Kar: ${fmtMoney(metrics.totalReturn)}` : `Zarar: ${fmtMoney(-metrics.totalReturn)}`} accent={metrics.totalReturnPct >= 0 ? 'up' : 'down'} />
        <MetricCard label="Yıllık (CAGR)" value={fmtPct(metrics.cagr)} sub="Bileşik yıllık getiri" accent={metrics.cagr >= 0 ? 'up' : 'down'} />
        <MetricCard label="Max Drawdown" value={`-${metrics.maxDrawdownPct.toFixed(2)}%`} sub={`Volatilite: ${metrics.volatilityAnnualPct.toFixed(1)}%`} accent="down" />
      </div>

      {/* Chart */}
      {loading && portfolioCurve.length === 0 ? (
        <div className="h-[320px] grid place-items-center text-xs text-slate-500">
          Grafik hazırlanıyor…
        </div>
      ) : error ? (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          Hata: {error}
        </div>
      ) : portfolioCurve.length === 0 ? (
        <div className="h-[200px] grid place-items-center text-xs text-slate-500">
          Seçili aralıkta işlem yok.
        </div>
      ) : (
        <div className="relative">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
            {/* Y grid */}
            {yTicks.map((v, i) => (
              <g key={`yg-${i}`}>
                <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v)} y2={yOf(v)}
                  stroke="currentColor" strokeOpacity={0.08} strokeDasharray="2 3" />
                <text x={PAD.left - 6} y={yOf(v)} textAnchor="end" dominantBaseline="middle"
                  fontSize="10" fill="currentColor" fillOpacity={0.55}>
                  {fmtMoney(v)}
                </text>
              </g>
            ))}
            {/* X labels */}
            {xTicks.map((i) => (
              <text key={`xg-${i}`} x={xOf(i)} y={H - 8} textAnchor="middle"
                fontSize="10" fill="currentColor" fillOpacity={0.6}>
                {allDates[i] ? formatDateTR(new Date(allDates[i]).toISOString()) : ''}
              </text>
            ))}
            {/* Benchmark paths */}
            {Array.from(benchmarkCurves.entries()).map(([id, curve]) => {
              const meta = BENCHMARKS.find((b) => b.id === id);
              if (!meta) return null;
              return (
                <path key={`b-${id}`} d={pathFor(curve)} fill="none"
                  stroke={meta.color} strokeWidth={1.5} strokeOpacity={0.7}
                  strokeLinecap="round" strokeLinejoin="round" />
              );
            })}
            {/* Portfolio path */}
            <path d={pathFor(portfolioCurve)} fill="none" stroke="#a78bfa"
              strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {/* Crosshair */}
            {hoverIdx != null && (
              <line x1={xOf(hoverIdx)} x2={xOf(hoverIdx)}
                y1={PAD.top} y2={H - PAD.bottom}
                stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 3" />
            )}
            {/* Hover capture */}
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH}
              fill="transparent" onMouseMove={handleMove}
              onMouseLeave={() => setHoverIdx(null)} />
          </svg>

          {/* Tooltip */}
          {hoverIdx != null && allDates[hoverIdx] && (
            <div className="pointer-events-none absolute top-2 rounded-md border border-border bg-bg-card/95 px-3 py-2 text-[11px] shadow-lg backdrop-blur"
              style={{ left: `min(calc(${(xOf(hoverIdx) / W) * 100}% + 12px), calc(100% - 200px))` }}>
              <div className="mb-1 font-semibold text-slate-200">
                {formatDateTR(new Date(allDates[hoverIdx]).toISOString())}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: '#a78bfa' }} />
                  <span className="font-semibold text-slate-100">Portföyünüz</span>
                </span>
                <span className="tabular-nums text-slate-100">
                  {fmtMoney(portfolioCurve[hoverIdx]?.value ?? 0)}
                </span>
              </div>
              {Array.from(benchmarkCurves.entries()).map(([id, curve]) => {
                const meta = BENCHMARKS.find((b) => b.id === id);
                const p = curve[hoverIdx];
                if (!meta || !p) return null;
                return (
                  <div key={id} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                      <span className="text-slate-300">{meta.label}</span>
                    </span>
                    <span className="tabular-nums text-slate-300">{fmtMoney(p.value)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Benchmark karşılaştırma tablosu */}
      {benchmarkComparisons.length > 0 && (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {benchmarkComparisons.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border border-border bg-bg-soft/40 px-3 py-1.5 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className="text-slate-300">{c.label} getirisi:</span>
                <span className={cn('tabular-nums font-semibold', c.pct >= 0 ? 'text-success' : 'text-danger')}>
                  {fmtPct(c.pct)}
                </span>
              </span>
              <span className={cn('tabular-nums font-semibold', c.diff >= 0 ? 'text-success' : 'text-danger')}>
                {c.diff >= 0 ? <TrendingUp size={11} className="inline mr-0.5" /> : <TrendingDown size={11} className="inline mr-0.5" />}
                {fmtPct(c.diff)} {c.diff >= 0 ? 'önde' : 'geride'}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
        <Info size={10} className="inline mr-1" />
        Portföy değeri gerçek işlem tarihleriniz ve historical fiyatlarla hesaplanır.
        Benchmark eğrisi "aynı tutarı aynı gün X'e yatırsaydım" mantığıyla karşılaştırma yapar.
        Kaynak: Yahoo Finance (hisse/BIST/USD/altın), TEFAS (fon), sentetik seri (TÜFE/mevduat).
      </p>
    </div>
  );
}

function MetricCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string;
  accent: 'up' | 'down' | 'neutral';
}) {
  const accentClass = accent === 'up' ? 'text-success' : accent === 'down' ? 'text-danger' : 'text-slate-100';
  return (
    <div className="rounded-md border border-border bg-bg-soft/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-0.5 text-base font-bold tabular-nums', accentClass)}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}
