import { Link } from 'react-router-dom';
import type { PoolStatBoxData } from '@/components/domain/RecPoolStats';
import type { FundPerformance } from '@/data/types';

/**
 * TEFAS fonları için pool stats (toplam fon, ortalama YTD, pozitif oran,
 * en yüksek/en düşük 1Y, dominant kategori).
 */
export function computeFundPoolStats(funds: FundPerformance[]): PoolStatBoxData[] {
  const total = funds.length;
  if (total === 0) return [];
  const validYear = funds.filter((f) => Number.isFinite(f.year));
  const validYtd = funds.filter((f) => Number.isFinite(f.ytd));
  const avgYear = validYear.length > 0
    ? validYear.reduce((s, f) => s + f.year, 0) / validYear.length
    : 0;
  const avgYtd = validYtd.length > 0
    ? validYtd.reduce((s, f) => s + f.ytd, 0) / validYtd.length
    : 0;
  const positives = validYear.filter((f) => f.year >= 0).length;
  const positiveRatio = validYear.length > 0 ? (positives / validYear.length) * 100 : 0;
  const sortedYear = [...validYear].sort((a, b) => b.year - a.year);
  const best = sortedYear[0];

  // Dominant kategori
  const catCounts = new Map<string, number>();
  funds.forEach((f) => catCounts.set(f.category, (catCounts.get(f.category) ?? 0) + 1));
  const dominantCat = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return [
    { label: 'Toplam Fon',  value: `${total}`, sub: `${catCounts.size} kategori`, tone: 'slate' },
    { label: 'Ort. 1Y',     value: `${avgYear >= 0 ? '+' : ''}${avgYear.toFixed(1)}%`, tone: avgYear >= 0 ? 'success' : 'danger' },
    { label: 'Ort. YTD',    value: `${avgYtd >= 0 ? '+' : ''}${avgYtd.toFixed(1)}%`, tone: avgYtd >= 0 ? 'success' : 'danger' },
    { label: 'Pozitif Oran', value: `%${positiveRatio.toFixed(0)}`, sub: `${positives}/${validYear.length}`, tone: 'accent' },
    { label: 'En Yüksek',   value: best ? best.code : '-', sub: best ? `+${best.year.toFixed(1)}%` : undefined, tone: 'success' },
    { label: 'Dominant',    value: dominantCat ? dominantCat[0] : '-', sub: dominantCat ? `${dominantCat[1]} fon` : undefined, tone: 'warning' },
  ];
}

/** Top 3 / Bottom 3 fon (1Y getiri bazlı). */
export function FundConsensusStrip({ funds }: { funds: FundPerformance[] }) {
  const valid = funds.filter((f) => Number.isFinite(f.year));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => b.year - a.year);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();

  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-success">Top 3 (1Y)</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {top3.map((f) => (
            <Link key={f.code} to={`/fund/${f.code}`} className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 font-mono font-semibold text-success hover:bg-success/20">
              {f.code}<span className="text-[10px] opacity-70">+{f.year.toFixed(1)}%</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-danger">Bottom 3 (1Y)</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {bottom3.map((f) => (
            <Link key={f.code} to={`/fund/${f.code}`} className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-0.5 font-mono font-semibold text-danger hover:bg-danger/20">
              {f.code}<span className="text-[10px] opacity-70">{f.year >= 0 ? '+' : ''}{f.year.toFixed(1)}%</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
