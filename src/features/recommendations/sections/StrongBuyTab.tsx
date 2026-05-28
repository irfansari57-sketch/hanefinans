import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, RefreshCw, ChevronRight, Star } from 'lucide-react';
import { BROKER_RECOMMENDATIONS } from '@/data/brokerRecommendations';
import { MOCK_STOCKS } from '@/data/mock';
import { loadStocks } from '@/data/services';
import type { Stock } from '@/data/types';
import type { PeriodReturns } from '@/data/api/yahoo';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

/**
 * Güçlü Al Havuzu — analist konsensüsü + hedef potansiyel + teknik momentum
 * birleşimine göre BIST hisselerinden filtreli bir liste.
 *
 * Skor (0-1) formülü:
 *   0.40 × analyst_score   — kapsayan brokerlardan AL/GÜÇLÜ AL oranı
 *   0.30 × target_score    — ortalama hedef fiyat potansiyeli (clip 30%'ye)
 *   0.30 × momentum_score  — 1A/3A/6A/1Y getirilerden kaç tanesi pozitif (4'e bölünür)
 *
 * "GÜÇLÜ AL" havuzuna girmek için:
 *   - En az 1 broker'dan "GÜÇLÜ AL" veya "AL" notu
 *   - Skor >= 0.50
 */

interface AggregatedRec {
  symbol: string;
  name: string;
  sector?: string;
  price: number;
  changePct: number;
  alCount: number;        // GÜÇLÜ AL + AL
  tutCount: number;       // TUT + BIRIKIM YAP + NÖTR
  satCount: number;       // SAT/GÜÇLÜ SAT (şu an veri yok = 0)
  brokerCount: number;
  avgTarget: number | null;
  potentialPct: number | null;
  hasStrongBuy: boolean;
  returns: PeriodReturns | undefined;
  score: number;
  analystScore: number;
  targetScore: number;
  momentumScore: number;
}

const SCORE_THRESHOLD = 0.50;

function aggregateBrokerRecs(): Map<string, {
  alCount: number; tutCount: number; satCount: number; brokerCount: number;
  targets: number[]; hasStrongBuy: boolean;
}> {
  const map = new Map<string, {
    alCount: number; tutCount: number; satCount: number; brokerCount: number;
    targets: number[]; hasStrongBuy: boolean;
  }>();
  for (const broker of BROKER_RECOMMENDATIONS) {
    for (const rec of broker.recommendations) {
      const sym = rec.symbol;
      const entry = map.get(sym) ?? {
        alCount: 0, tutCount: 0, satCount: 0, brokerCount: 0,
        targets: [], hasStrongBuy: false,
      };
      entry.brokerCount += 1;
      if (rec.rating === 'GÜÇLÜ AL') { entry.alCount += 1; entry.hasStrongBuy = true; }
      else if (rec.rating === 'AL') entry.alCount += 1;
      else entry.tutCount += 1; // TUT, BIRIKIM YAP, NÖTR
      if (rec.targetPrice != null && rec.targetPrice > 0) {
        entry.targets.push(rec.targetPrice);
      }
      map.set(sym, entry);
    }
  }
  return map;
}

function computeScore(
  alCount: number, tutCount: number, satCount: number,
  brokerCount: number,
  potentialPct: number | null,
  returns: PeriodReturns | undefined,
): { score: number; analystScore: number; targetScore: number; momentumScore: number } {
  // 1) Analyst score: AL oranı (0-1), broker sayısı azsa hafif penalty
  const positiveRatio = brokerCount > 0 ? alCount / brokerCount : 0;
  const coverageWeight = Math.min(1, brokerCount / 2); // 2+ broker = full weight
  const analystScore = positiveRatio * coverageWeight;

  // 2) Target score: 0-30% potential → 0-1, clip
  const targetScore = potentialPct == null
    ? 0
    : Math.max(0, Math.min(1, potentialPct / 30));

  // 3) Momentum score: kaç dönem getirisi pozitif (1A/3A/6A/1Y)
  let positiveMonths = 0;
  let totalMonths = 0;
  for (const key of ['1a', '3a', '6a', '1y'] as const) {
    const v = returns?.[key];
    if (v == null) continue;
    totalMonths += 1;
    if (v > 0) positiveMonths += 1;
  }
  const momentumScore = totalMonths > 0 ? positiveMonths / totalMonths : 0;

  const score = 0.40 * analystScore + 0.30 * targetScore + 0.30 * momentumScore;
  return { score, analystScore, targetScore, momentumScore };
}

export function StrongBuyTab() {
  const [stocks, setStocks] = useState<Stock[]>(MOCK_STOCKS);
  const [returnsMap, setReturnsMap] = useState<Record<string, PeriodReturns>>({});
  const [loading, setLoading] = useState(true);
  const [returnsLoading, setReturnsLoading] = useState(true);
  const [query, setQuery] = useState('');

  // Stocks fetch (canlı fiyatlar)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadStocks()
      .then(({ data }) => {
        if (!cancelled) setStocks(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Returns snapshot — D1 cache'den getiri özetleri
  useEffect(() => {
    let cancelled = false;
    setReturnsLoading(true);
    fetch('/api/yahoo/returns-snapshot')
      .then((r) => r.ok ? r.json() : null)
      .then((j: { ok: boolean; returns?: Record<string, PeriodReturns> } | null) => {
        if (cancelled || !j?.ok || !j.returns) return;
        const map: Record<string, PeriodReturns> = {};
        for (const [ySym, ret] of Object.entries(j.returns)) {
          const sym = ySym.endsWith('.IS') ? ySym.slice(0, -3) : ySym;
          map[sym] = ret;
        }
        setReturnsMap(map);
      })
      .catch(() => { /* sessizce */ })
      .finally(() => {
        if (!cancelled) setReturnsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Aggregate per symbol + compute score + filter
  const aggregated = useMemo<AggregatedRec[]>(() => {
    const brokerMap = aggregateBrokerRecs();
    const stockMap = new Map(stocks.map((s) => [s.symbol, s]));
    const out: AggregatedRec[] = [];

    for (const [sym, entry] of brokerMap) {
      const stock = stockMap.get(sym);
      if (!stock || !(stock.price > 0)) continue;

      const avgTarget = entry.targets.length > 0
        ? entry.targets.reduce((a, b) => a + b, 0) / entry.targets.length
        : null;
      const potentialPct = avgTarget != null && stock.price > 0
        ? ((avgTarget - stock.price) / stock.price) * 100
        : null;

      const returns = returnsMap[sym];
      const { score, analystScore, targetScore, momentumScore } = computeScore(
        entry.alCount, entry.tutCount, entry.satCount, entry.brokerCount,
        potentialPct, returns,
      );

      out.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        price: stock.price,
        changePct: stock.changePct,
        alCount: entry.alCount,
        tutCount: entry.tutCount,
        satCount: entry.satCount,
        brokerCount: entry.brokerCount,
        avgTarget,
        potentialPct,
        hasStrongBuy: entry.hasStrongBuy,
        returns,
        score,
        analystScore,
        targetScore,
        momentumScore,
      });
    }
    return out;
  }, [stocks, returnsMap]);

  // Filter to "GÜÇLÜ AL" pool: skor + en az 1 GÜÇLÜ AL veya AL
  const strongBuy = useMemo(() => {
    const filtered = aggregated.filter((a) =>
      a.score >= SCORE_THRESHOLD &&
      a.alCount > 0,
    );
    const q = query.trim().toLowerCase();
    const matched = q
      ? filtered.filter((a) =>
          a.symbol.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q),
        )
      : filtered;
    return matched.sort((a, b) => b.score - a.score);
  }, [aggregated, query]);

  const stillLoading = loading || returnsLoading;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-soft p-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-success/15 text-success">
            <TrendingUp size={16} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Güçlü Al Havuzu</h3>
            <p className="text-[11px] text-slate-400">
              Analist konsensüsü + hedef potansiyel + teknik momentum birleşik skoru — skor &ge; {SCORE_THRESHOLD.toFixed(2)} olan BIST hisseleri.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Hisse ara..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-accent focus:outline-none"
          />
          {stillLoading && (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
              <RefreshCw size={10} className="animate-spin" /> Yükleniyor
            </span>
          )}
          <span className="rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            {strongBuy.length} hisse
          </span>
        </div>
      </div>

      {strongBuy.length === 0 && !stillLoading ? (
        <div className="rounded-xl border border-border bg-bg-soft p-6 text-center">
          <Star size={28} className="mx-auto text-slate-600" />
          <p className="mt-2 text-sm text-slate-300">Henüz Güçlü Al kriterine uyan hisse yok.</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Analist tavsiyeleri veya getiri verileri yüklendikçe liste dolacak.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
          <table className="min-w-full text-xs">
            <thead className="bg-bg-card text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2.5 text-left">Sembol</th>
                <th className="px-3 py-2.5 text-left hidden md:table-cell">Şirket / Sektör</th>
                <th className="px-3 py-2.5 text-right">Fiyat</th>
                <th className="px-3 py-2.5 text-right">Gün %</th>
                <th className="px-3 py-2.5 text-right hidden lg:table-cell">1A %</th>
                <th className="px-3 py-2.5 text-right hidden lg:table-cell">3A %</th>
                <th className="px-3 py-2.5 text-right hidden xl:table-cell">1Y %</th>
                <th className="px-3 py-2.5 text-center">Analist (AL/TUT/SAT)</th>
                <th className="px-3 py-2.5 text-right hidden md:table-cell">Hedef</th>
                <th className="px-3 py-2.5 text-right">Potansiyel</th>
                <th className="px-3 py-2.5 text-right">Skor</th>
                <th className="px-3 py-2.5 text-center">Tavsiye</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {strongBuy.map((r, i) => (
                <StrongBuyRow key={r.symbol} rec={r} rank={i + 1} />
              ))}
            </tbody>
          </table>
          <div className="border-t border-border bg-bg-card/40 px-3 py-2 text-[10px] text-slate-500">
            Skor formülü: 0.40 × analist konsensüs + 0.30 × hedef potansiyel + 0.30 × momentum.
            Bu havuz yatırım tavsiyesi değildir.
          </div>
        </div>
      )}
    </div>
  );
}

interface StrongBuyRowProps {
  rec: AggregatedRec;
  rank: number;
}

function StrongBuyRow({ rec, rank }: StrongBuyRowProps) {
  const dayTone = rec.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = (v: number) => (v >= 0 ? '+' : '');
  const returnsTone = (v: number | undefined) =>
    v == null ? 'text-slate-500' : v >= 0 ? 'text-success' : 'text-danger';
  const fmtReturn = (v: number | undefined) =>
    v == null ? '—' : `${sign(v)}${v.toFixed(2)}%`;

  const potentialTone = rec.potentialPct == null
    ? 'text-slate-500'
    : rec.potentialPct >= 15 ? 'text-success' : rec.potentialPct >= 0 ? 'text-slate-200' : 'text-danger';

  // Skor görünümü: 0.50-0.65 normal yeşil, 0.65-0.80 koyu yeşil, 0.80+ vurgulu
  const scoreColor = rec.score >= 0.80
    ? 'text-success font-bold'
    : rec.score >= 0.65
      ? 'text-success'
      : 'text-slate-200';

  return (
    <tr className="group transition-colors hover:bg-bg-card">
      <td className="px-3 py-2.5 text-left whitespace-nowrap">
        <Link
          to={`/stock/${rec.symbol}`}
          className="inline-flex items-center gap-1.5 font-mono font-semibold text-accent hover:underline"
        >
          <span className="text-[9px] text-slate-500">#{rank}</span>
          {rec.symbol}
          <ChevronRight size={10} className="opacity-0 transition group-hover:opacity-100" />
        </Link>
      </td>
      <td className="px-3 py-2.5 text-left hidden md:table-cell">
        <div className="truncate max-w-[200px] text-slate-200">{rec.name}</div>
        {rec.sector && (
          <div className="mt-0.5 text-[9px] text-slate-500">{rec.sector}</div>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">{formatMoney(rec.price)}</td>
      <td className={cn('px-3 py-2.5 text-right tabular-nums font-medium', dayTone)}>
        {sign(rec.changePct)}{rec.changePct.toFixed(2)}%
      </td>
      <td className={cn('px-3 py-2.5 text-right tabular-nums hidden lg:table-cell', returnsTone(rec.returns?.['1a']))}>
        {fmtReturn(rec.returns?.['1a'])}
      </td>
      <td className={cn('px-3 py-2.5 text-right tabular-nums hidden lg:table-cell', returnsTone(rec.returns?.['3a']))}>
        {fmtReturn(rec.returns?.['3a'])}
      </td>
      <td className={cn('px-3 py-2.5 text-right tabular-nums hidden xl:table-cell', returnsTone(rec.returns?.['1y']))}>
        {fmtReturn(rec.returns?.['1y'])}
      </td>
      <td className="px-3 py-2.5 text-center text-[11px] tabular-nums">
        <span className="text-success font-semibold">{rec.alCount}</span>
        <span className="mx-0.5 text-slate-600">/</span>
        <span className="text-slate-300">{rec.tutCount}</span>
        <span className="mx-0.5 text-slate-600">/</span>
        <span className="text-danger">{rec.satCount}</span>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums hidden md:table-cell text-slate-200">
        {rec.avgTarget == null ? '—' : formatMoney(rec.avgTarget)}
      </td>
      <td className={cn('px-3 py-2.5 text-right tabular-nums font-medium', potentialTone)}>
        {rec.potentialPct == null
          ? '—'
          : `${sign(rec.potentialPct)}${rec.potentialPct.toFixed(1)}%`}
      </td>
      <td className={cn('px-3 py-2.5 text-right tabular-nums', scoreColor)}>
        {rec.score.toFixed(3)}
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
          ● GÜÇLÜ AL
        </span>
      </td>
    </tr>
  );
}
