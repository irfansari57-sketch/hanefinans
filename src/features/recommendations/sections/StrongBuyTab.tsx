import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, RefreshCw, ChevronRight, Star, Briefcase, Activity } from 'lucide-react';
import { BROKER_RECOMMENDATIONS } from '@/data/brokerRecommendations';
import { MOCK_STOCKS } from '@/data/mock';
import { BIST_UNIQUE } from '@/data/bistAll';
import { loadStocks } from '@/data/services';
import type { Stock } from '@/data/types';
import type { PeriodReturns } from '@/data/api/yahoo';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

/**
 * Güçlü Al Havuzu — tüm BIST evrenini (700+) tarayan kazanç potansiyeli filtresi.
 *
 * İki giriş kapısı:
 *   A) Broker-onaylı: en az 1 broker'dan GÜÇLÜ AL/AL notu + skor >= 0.50
 *      → "● GÜÇLÜ AL" rozeti (yeşil dolgu)
 *   B) Teknik-güçlü:  broker kapsamı yok ama 1A/3A/6A/1Y dönemlerinin >=75%'i pozitif
 *      VE 3A getiri >= 10% (gerçek yukarı hareket)
 *      → "▲ MOMENTUM" rozeti (yeşil çerçeve)
 *
 * Skor formülü (0-1):
 *   broker-covered  → 0.40 × analyst + 0.30 × target + 0.30 × momentum
 *   broker-uncovered → 1.00 × momentum (tek faktör)
 */

interface AggregatedRec {
  symbol: string;
  name: string;
  sector?: string;
  price: number;
  changePct: number;
  alCount: number;
  tutCount: number;
  satCount: number;
  brokerCount: number;
  avgTarget: number | null;
  potentialPct: number | null;
  returns: PeriodReturns | undefined;
  score: number;
  source: 'broker' | 'technical';
}

const SCORE_THRESHOLD = 0.50;
const TECHNICAL_MOMENTUM_THRESHOLD = 0.75;
const TECHNICAL_3M_MIN_RETURN = 10;
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1500;

function aggregateBrokerRecs(): Map<string, {
  alCount: number; tutCount: number; satCount: number; brokerCount: number;
  targets: number[]; hasAl: boolean;
}> {
  const map = new Map<string, {
    alCount: number; tutCount: number; satCount: number; brokerCount: number;
    targets: number[]; hasAl: boolean;
  }>();
  for (const broker of BROKER_RECOMMENDATIONS) {
    for (const rec of broker.recommendations) {
      const sym = rec.symbol;
      const entry = map.get(sym) ?? {
        alCount: 0, tutCount: 0, satCount: 0, brokerCount: 0,
        targets: [], hasAl: false,
      };
      entry.brokerCount += 1;
      if (rec.rating === 'GÜÇLÜ AL' || rec.rating === 'AL') {
        entry.alCount += 1;
        entry.hasAl = true;
      } else {
        entry.tutCount += 1;
      }
      if (rec.targetPrice != null && rec.targetPrice > 0) {
        entry.targets.push(rec.targetPrice);
      }
      map.set(sym, entry);
    }
  }
  return map;
}

function computeMomentumScore(returns: PeriodReturns | undefined): number {
  if (!returns) return 0;
  let positive = 0;
  let total = 0;
  for (const key of ['1a', '3a', '6a', '1y'] as const) {
    const v = returns[key];
    if (v == null) continue;
    total += 1;
    if (v > 0) positive += 1;
  }
  return total > 0 ? positive / total : 0;
}

export function StrongBuyTab() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [returnsMap, setReturnsMap] = useState<Record<string, PeriodReturns>>({});
  const [loading, setLoading] = useState(true);
  const [returnsLoading, setReturnsLoading] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'broker' | 'technical'>('all');

  // --- Universe: MOCK_STOCKS + BIST_UNIQUE birleşik (700+) ---
  const universe = useMemo(() => {
    const seen = new Set<string>();
    const out: { symbol: string; name: string; sector: string }[] = [];
    for (const s of MOCK_STOCKS) {
      if (seen.has(s.symbol)) continue;
      seen.add(s.symbol);
      out.push({ symbol: s.symbol, name: s.name, sector: s.sector ?? '' });
    }
    for (const s of BIST_UNIQUE) {
      if (seen.has(s.symbol)) continue;
      seen.add(s.symbol);
      out.push({ symbol: s.symbol, name: s.name, sector: s.sector });
    }
    return out;
  }, []);

  // --- Stocks fetch: tüm evren, batch'lerle ---
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const allSymbols = universe.map((u) => u.symbol);
    setProgress({ done: 0, total: allSymbols.length });

    const placeholder: Stock[] = universe.map((u) => ({
      symbol: u.symbol,
      name: u.name,
      sector: u.sector,
      price: 0,
      changePct: 0,
      updatedAt: new Date().toISOString(),
    }));
    setStocks(placeholder);

    (async () => {
      const liveAll: Stock[] = [];
      for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = allSymbols.slice(i, i + BATCH_SIZE);
        try {
          const { data } = await loadStocks(batch);
          liveAll.push(...data);
          const liveMap = new Map(liveAll.map((s) => [s.symbol, s]));
          const merged = placeholder.map((p) => liveMap.get(p.symbol) ?? p);
          if (!cancelled) {
            setStocks(merged);
            setProgress({ done: Math.min(i + BATCH_SIZE, allSymbols.length), total: allSymbols.length });
          }
        } catch { /* batch hatasi - devam */ }
        if (i + BATCH_SIZE < allSymbols.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [universe]);

  // --- Returns snapshot ---
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

  // --- Aggregate + filter ---
  const aggregated = useMemo<AggregatedRec[]>(() => {
    const brokerMap = aggregateBrokerRecs();
    const out: AggregatedRec[] = [];

    for (const stock of stocks) {
      if (!(stock.price > 0)) continue;
      const returns = returnsMap[stock.symbol];
      const momentumScore = computeMomentumScore(returns);
      const brokerEntry = brokerMap.get(stock.symbol);

      if (brokerEntry && brokerEntry.brokerCount > 0) {
        // --- Yol A: Broker kapsamı var ---
        const avgTarget = brokerEntry.targets.length > 0
          ? brokerEntry.targets.reduce((a, b) => a + b, 0) / brokerEntry.targets.length
          : null;
        const potentialPct = avgTarget != null && stock.price > 0
          ? ((avgTarget - stock.price) / stock.price) * 100
          : null;
        const positiveRatio = brokerEntry.alCount / brokerEntry.brokerCount;
        const coverageWeight = Math.min(1, brokerEntry.brokerCount / 2);
        const analystScore = positiveRatio * coverageWeight;
        const targetScore = potentialPct == null
          ? 0
          : Math.max(0, Math.min(1, potentialPct / 30));
        const score = 0.40 * analystScore + 0.30 * targetScore + 0.30 * momentumScore;

        if (score >= SCORE_THRESHOLD && brokerEntry.hasAl) {
          out.push({
            symbol: stock.symbol,
            name: stock.name,
            sector: stock.sector,
            price: stock.price,
            changePct: stock.changePct,
            alCount: brokerEntry.alCount,
            tutCount: brokerEntry.tutCount,
            satCount: brokerEntry.satCount,
            brokerCount: brokerEntry.brokerCount,
            avgTarget,
            potentialPct,
            returns,
            score,
            source: 'broker',
          });
        }
      } else {
        // --- Yol B: Broker kapsamı yok — teknik momentum tabanlı ---
        const r3a = returns?.['3a'];
        if (
          momentumScore >= TECHNICAL_MOMENTUM_THRESHOLD &&
          r3a != null &&
          r3a >= TECHNICAL_3M_MIN_RETURN
        ) {
          out.push({
            symbol: stock.symbol,
            name: stock.name,
            sector: stock.sector,
            price: stock.price,
            changePct: stock.changePct,
            alCount: 0,
            tutCount: 0,
            satCount: 0,
            brokerCount: 0,
            avgTarget: null,
            potentialPct: null,
            returns,
            score: momentumScore, // teknik-only için tek faktör
            source: 'technical',
          });
        }
      }
    }
    return out;
  }, [stocks, returnsMap]);

  // --- Filter + sort ---
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = aggregated;
    if (sourceFilter !== 'all') {
      list = list.filter((a) => a.source === sourceFilter);
    }
    if (q) {
      list = list.filter((a) =>
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => b.score - a.score);
  }, [aggregated, query, sourceFilter]);

  const brokerCount = aggregated.filter((a) => a.source === 'broker').length;
  const technicalCount = aggregated.filter((a) => a.source === 'technical').length;
  const stillLoading = loading || returnsLoading;
  const loadPct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-bg-soft p-3">
        <div className="flex items-start gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-success/15 text-success">
            <TrendingUp size={16} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Güçlü Al Havuzu — Tüm BIST</h3>
            <p className="text-[11px] text-slate-400 max-w-2xl">
              {progress.total > 0 ? `${progress.total} hissenin tamamını tarar.` : ''} İki giriş kapısı:
              <span className="text-success"> broker-onaylı</span> (en az 1 AL notu + skor &ge; {SCORE_THRESHOLD.toFixed(2)}),
              veya <span className="text-accent">teknik-güçlü</span> (1A/3A/6A/1Y dönemlerin &ge;%75'i pozitif + 3A &ge; %{TECHNICAL_3M_MIN_RETURN}).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Hisse ara..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-accent focus:outline-none"
          />
          <div className="inline-flex rounded-lg border border-border bg-bg-card p-0.5">
            <button
              onClick={() => setSourceFilter('all')}
              className={cn(
                'rounded-md px-2 py-1 text-[10px] font-medium transition',
                sourceFilter === 'all' ? 'bg-accent/20 text-accent' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              Tümü ({aggregated.length})
            </button>
            <button
              onClick={() => setSourceFilter('broker')}
              className={cn(
                'rounded-md px-2 py-1 text-[10px] font-medium transition',
                sourceFilter === 'broker' ? 'bg-success/20 text-success' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              Broker ({brokerCount})
            </button>
            <button
              onClick={() => setSourceFilter('technical')}
              className={cn(
                'rounded-md px-2 py-1 text-[10px] font-medium transition',
                sourceFilter === 'technical' ? 'bg-accent/20 text-accent' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              Teknik ({technicalCount})
            </button>
          </div>
        </div>
      </div>

      {stillLoading && progress.total > 0 && (
        <div className="rounded-xl border border-border bg-bg-soft p-2.5">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw size={10} className="animate-spin text-accent" />
              Hisseler yükleniyor: {progress.done} / {progress.total}
            </span>
            <span>%{loadPct.toFixed(0)}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg-card">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${loadPct}%` }}
            />
          </div>
        </div>
      )}

      {filtered.length === 0 && !stillLoading ? (
        <div className="rounded-xl border border-border bg-bg-soft p-6 text-center">
          <Star size={28} className="mx-auto text-slate-600" />
          <p className="mt-2 text-sm text-slate-300">Güçlü Al kriterine uyan hisse bulunamadı.</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Veriler yüklendikçe veya filtre değiştikçe liste dolacak.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
          <table className="min-w-full text-xs">
            <thead className="bg-bg-card text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2.5 text-left">#</th>
                <th className="px-3 py-2.5 text-left">Sembol</th>
                <th className="px-3 py-2.5 text-left hidden md:table-cell">Şirket / Sektör</th>
                <th className="px-3 py-2.5 text-right">Fiyat</th>
                <th className="px-3 py-2.5 text-right">Gün %</th>
                <th className="px-3 py-2.5 text-right hidden lg:table-cell">1A %</th>
                <th className="px-3 py-2.5 text-right hidden lg:table-cell">3A %</th>
                <th className="px-3 py-2.5 text-right hidden xl:table-cell">1Y %</th>
                <th className="px-3 py-2.5 text-center hidden md:table-cell">Analist (AL/TUT)</th>
                <th className="px-3 py-2.5 text-right hidden md:table-cell">Hedef</th>
                <th className="px-3 py-2.5 text-right">Potansiyel</th>
                <th className="px-3 py-2.5 text-right">Skor</th>
                <th className="px-3 py-2.5 text-center">Tavsiye</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r, i) => (
                <StrongBuyRow key={r.symbol} rec={r} rank={i + 1} />
              ))}
            </tbody>
          </table>
          <div className="border-t border-border bg-bg-card/40 px-3 py-2 text-[10px] text-slate-500">
            Skor: broker-onaylı için 0.40 × analist + 0.30 × hedef + 0.30 × momentum; teknik için sadece momentum (pozitif dönem oranı).
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
  const scoreColor = rec.score >= 0.80
    ? 'text-success font-bold'
    : rec.score >= 0.65
      ? 'text-success'
      : 'text-slate-200';

  return (
    <tr className="group transition-colors hover:bg-bg-card">
      <td className="px-3 py-2.5 text-left text-[10px] text-slate-500 tabular-nums">{rank}</td>
      <td className="px-3 py-2.5 text-left whitespace-nowrap">
        <Link
          to={`/stock/${rec.symbol}`}
          className="inline-flex items-center gap-1.5 font-mono font-semibold text-accent hover:underline"
        >
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
      <td className="px-3 py-2.5 text-center text-[11px] tabular-nums hidden md:table-cell">
        {rec.source === 'broker' ? (
          <>
            <span className="text-success font-semibold">{rec.alCount}</span>
            <span className="mx-0.5 text-slate-600">/</span>
            <span className="text-slate-300">{rec.tutCount}</span>
          </>
        ) : (
          <span className="text-slate-600">—</span>
        )}
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
        {rec.source === 'broker' ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success"
            title="En az 1 broker'dan AL notu var + skor eşiği geçti"
          >
            <Briefcase size={10} /> GÜÇLÜ AL
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent"
            title="Broker kapsamı yok ama teknik momentumu güçlü (4 dönemin >=%75'i pozitif + 3A >= 10%)"
          >
            <Activity size={10} /> MOMENTUM
          </span>
        )}
      </td>
    </tr>
  );
}
