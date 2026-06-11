import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, RefreshCw, ChevronRight, Star, Briefcase, Activity } from 'lucide-react';
import { BROKER_RECOMMENDATIONS } from '@/data/brokerRecommendations';
import { MOCK_STOCKS } from '@/data/mock';
import { BIST_UNIQUE } from '@/data/bistAll';
import { BIST_SCOPES, isInBistScope, type BistScopeCode } from '@/data/bistIndices';
import { loadStocks } from '@/data/services';
import type { Stock } from '@/data/types';
import type { PeriodReturns } from '@/data/api/yahoo';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { useAuth, isPro } from '@/store/auth';
import { Crown, Lock } from 'lucide-react';

const FREE_PREVIEW_LIMIT = 5;

/**
 * Güçlü Al Havuzu — tüm BIST evrenini tarayan SIKI kalite filtresi, maks. 25 hisse.
 *
 * İki giriş kapısı (her ikisi de sıkı eşikli):
 *   A) Broker-onaylı: en az 1 AL notu + skor >= 0.65 + ortalama hedef potansiyel >= %10
 *      → "● GÜÇLÜ AL" rozeti (Briefcase ikonu, yeşil dolgu)
 *   B) Teknik-güçlü: 4 dönem (1A/3A/6A/1Y) TÜMÜ pozitif + 3A >= %15 + 1Y >= %25
 *      → "▲ MOMENTUM" rozeti (Activity ikonu, mavi çerçeve)
 *
 * Birleşik skor (0-1):
 *   broker  → 0.40 × analyst + 0.30 × target + 0.30 × momentum
 *   teknik  → 1.00 × momentum (tek faktör)
 *
 * Son havuz: birleşik skora göre sıralı, ilk 25.
 *
 * Layout: Fon Havuzu pattern'i — header card + source chip + summary kartları + tablo.
 */

const SCORE_THRESHOLD = 0.65;
const TECHNICAL_MOMENTUM_THRESHOLD = 1.0; // 4/4 dönem pozitif
const TECHNICAL_3M_MIN_RETURN = 15;
const TECHNICAL_1Y_MIN_RETURN = 25;
const BROKER_MIN_POTENTIAL = 10; // %10+ hedef potansiyeli zorunlu
const MAX_POOL = 25;
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1500;

type SbSortKey = 'score' | 'price' | 'changePct' | 'r1a' | 'r3a' | 'r1y' | 'potential';

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
  const [sourceFilter, setSourceFilter] = useState<'all' | 'broker' | 'technical'>('all');
  // BIST kapsam filtresi — default BIST 100 (en başta XU100 odaklı havuz)
  const [scopeFilter, setScopeFilter] = useState<BistScopeCode>(() => {
    try {
      const saved = localStorage.getItem('fa.strongbuy.scopeFilter');
      if (saved === 'XU100' || saved === 'XU030' || saved === 'BISTTUM') return saved;
    } catch { /* */ }
    return 'XU100';
  });
  useEffect(() => {
    try { localStorage.setItem('fa.strongbuy.scopeFilter', scopeFilter); } catch { /* */ }
  }, [scopeFilter]);
  const [sortKey, setSortKey] = useState<SbSortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const setSort = (k: SbSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  // BIST evreni: hızlı meta-data lookup için (name + sector)
  const universeMeta = useMemo(() => {
    const map = new Map<string, { name: string; sector: string }>();
    for (const s of MOCK_STOCKS) {
      if (map.has(s.symbol)) continue;
      map.set(s.symbol, { name: s.name, sector: s.sector ?? '' });
    }
    for (const s of BIST_UNIQUE) {
      if (map.has(s.symbol)) continue;
      map.set(s.symbol, { name: s.name, sector: s.sector });
    }
    return map;
  }, []);

  // 1) Returns snapshot ÖNCE çek — kapsadığı sembolleri "tradable evren" olarak kullan
  // Bu sayede borsada işlem görmeyen ~250 çöp sembol elenir → tarama ~%40 hızlanır
  useEffect(() => {
    let cancelled = false;
    setReturnsLoading(true);
    setLoading(true);

    (async () => {
      // Snapshot
      let map: Record<string, PeriodReturns> = {};
      try {
        const r = await fetch('/api/yahoo/returns-snapshot');
        if (r.ok) {
          const j = await r.json() as { ok: boolean; returns?: Record<string, PeriodReturns> };
          if (j.ok && j.returns) {
            for (const [ySym, ret] of Object.entries(j.returns)) {
              const sym = ySym.endsWith('.IS') ? ySym.slice(0, -3) : ySym;
              map[sym] = ret;
            }
          }
        }
      } catch { /* */ }
      if (cancelled) return;
      setReturnsMap(map);
      setReturnsLoading(false);

      // 2) Tarama evreni: snapshot'taki sembol + broker önerilerinin kapsadıkları
      // (snapshot bazen yeni broker eklenen ama henüz cache'lenmemiş sembolü kaçırabilir)
      const brokerSyms = new Set<string>();
      for (const broker of BROKER_RECOMMENDATIONS) {
        for (const rec of broker.recommendations) brokerSyms.add(rec.symbol);
      }
      const tradableSet = new Set<string>([...Object.keys(map), ...brokerSyms]);
      // BIST evreninde tanımlı olanlarla kesişim al (yabancı sembolleri ele)
      const finalSymbols: string[] = [];
      for (const sym of tradableSet) {
        if (universeMeta.has(sym)) finalSymbols.push(sym);
      }
      finalSymbols.sort();

      setProgress({ done: 0, total: finalSymbols.length });
      const placeholder: Stock[] = finalSymbols.map((sym) => {
        const meta = universeMeta.get(sym)!;
        return {
          symbol: sym, name: meta.name, sector: meta.sector,
          price: 0, changePct: 0, updatedAt: new Date().toISOString(),
        };
      });
      setStocks(placeholder);

      // 3) Batch live price fetch — sadece tradable evren (~500 sembol)
      const liveAll: Stock[] = [];
      for (let i = 0; i < finalSymbols.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = finalSymbols.slice(i, i + BATCH_SIZE);
        try {
          const { data } = await loadStocks(batch);
          liveAll.push(...data);
          const liveMap = new Map(liveAll.map((s) => [s.symbol, s]));
          const merged = placeholder.map((p) => liveMap.get(p.symbol) ?? p);
          if (!cancelled) {
            setStocks(merged);
            setProgress({ done: Math.min(i + BATCH_SIZE, finalSymbols.length), total: finalSymbols.length });
          }
        } catch { /* batch hatası — devam */ }
        if (i + BATCH_SIZE < finalSymbols.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [universeMeta]);

  // Aggregate + filter (sıkı kriterler)
  const aggregated = useMemo<AggregatedRec[]>(() => {
    const brokerMap = aggregateBrokerRecs();
    const out: AggregatedRec[] = [];
    for (const stock of stocks) {
      if (!(stock.price > 0)) continue;
      const returns = returnsMap[stock.symbol];
      const momentumScore = computeMomentumScore(returns);
      const brokerEntry = brokerMap.get(stock.symbol);

      if (brokerEntry && brokerEntry.brokerCount > 0) {
        const avgTarget = brokerEntry.targets.length > 0
          ? brokerEntry.targets.reduce((a, b) => a + b, 0) / brokerEntry.targets.length
          : null;
        const potentialPct = avgTarget != null && stock.price > 0
          ? ((avgTarget - stock.price) / stock.price) * 100
          : null;
        const positiveRatio = brokerEntry.alCount / brokerEntry.brokerCount;
        const coverageWeight = Math.min(1, brokerEntry.brokerCount / 2);
        const analystScore = positiveRatio * coverageWeight;
        const targetScore = potentialPct == null ? 0 : Math.max(0, Math.min(1, potentialPct / 30));
        const score = 0.40 * analystScore + 0.30 * targetScore + 0.30 * momentumScore;

        // SIKI: skor + AL notu + hedef potansiyeli %10+
        if (
          score >= SCORE_THRESHOLD &&
          brokerEntry.hasAl &&
          potentialPct != null &&
          potentialPct >= BROKER_MIN_POTENTIAL
        ) {
          out.push({
            symbol: stock.symbol, name: stock.name, sector: stock.sector,
            price: stock.price, changePct: stock.changePct,
            alCount: brokerEntry.alCount, tutCount: brokerEntry.tutCount, satCount: brokerEntry.satCount,
            brokerCount: brokerEntry.brokerCount,
            avgTarget, potentialPct, returns, score, source: 'broker',
          });
        }
      } else {
        // Teknik: 4/4 dönem pozitif + 3A>=%15 + 1Y>=%25
        const r3a = returns?.['3a'];
        const r1y = returns?.['1y'];
        if (
          momentumScore >= TECHNICAL_MOMENTUM_THRESHOLD &&
          r3a != null && r3a >= TECHNICAL_3M_MIN_RETURN &&
          r1y != null && r1y >= TECHNICAL_1Y_MIN_RETURN
        ) {
          out.push({
            symbol: stock.symbol, name: stock.name, sector: stock.sector,
            price: stock.price, changePct: stock.changePct,
            alCount: 0, tutCount: 0, satCount: 0, brokerCount: 0,
            avgTarget: null, potentialPct: null,
            returns, score: momentumScore, source: 'technical',
          });
        }
      }
    }
    return out;
  }, [stocks, returnsMap]);

  // Scope chip counts (her scope için kaç hisse aggregated içinde)
  const scopeCounts = useMemo(() => {
    const result: Record<BistScopeCode, number> = { XU100: 0, XU030: 0, BISTTUM: 0 };
    for (const a of aggregated) {
      for (const sc of BIST_SCOPES) {
        if (isInBistScope(a.symbol, sc.code)) result[sc.code] += 1;
      }
    }
    return result;
  }, [aggregated]);

  // Source filter + scope filter + sort + cap MAX_POOL
  const pool = useMemo(() => {
    let list = sourceFilter === 'all' ? aggregated : aggregated.filter((a) => a.source === sourceFilter);
    // BIST kapsam filtresi (BIST 100 default, BIST 30 daraltır, BISTTUM hepsi)
    list = list.filter((a) => isInBistScope(a.symbol, scopeFilter));
    list = [...list].sort((a, b) => {
      let va: number, vb: number;
      switch (sortKey) {
        case 'price':      va = a.price; vb = b.price; break;
        case 'changePct':  va = a.changePct; vb = b.changePct; break;
        case 'r1a':        va = a.returns?.['1a'] ?? -Infinity; vb = b.returns?.['1a'] ?? -Infinity; break;
        case 'r3a':        va = a.returns?.['3a'] ?? -Infinity; vb = b.returns?.['3a'] ?? -Infinity; break;
        case 'r1y':        va = a.returns?.['1y'] ?? -Infinity; vb = b.returns?.['1y'] ?? -Infinity; break;
        case 'potential':  va = a.potentialPct ?? -Infinity; vb = b.potentialPct ?? -Infinity; break;
        case 'score':
        default:           va = a.score; vb = b.score;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return list.slice(0, MAX_POOL);
  }, [aggregated, sourceFilter, scopeFilter, sortKey, sortDir]);

  const brokerCount = aggregated.filter((a) => a.source === 'broker').length;
  const technicalCount = aggregated.filter((a) => a.source === 'technical').length;
  const stillLoading = loading || returnsLoading;
  const loadPct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  // Havuzun ortalama performansı — Fon Havuzu summary pattern'i
  const summary = useMemo(() => {
    if (pool.length === 0) return null;
    const calc = (key: '1a' | '3a' | '6a' | '1y' | 'day') => {
      let sum = 0, count = 0, positives = 0, negatives = 0;
      for (const r of pool) {
        const v = key === 'day' ? r.changePct : r.returns?.[key];
        if (v == null || !Number.isFinite(v)) continue;
        sum += v; count += 1;
        if (v > 0) positives += 1; else if (v < 0) negatives += 1;
      }
      return { avg: count > 0 ? sum / count : 0, count, positives, negatives };
    };
    return {
      day: calc('day'),
      r1a: calc('1a'),
      r3a: calc('3a'),
      r1y: calc('1y'),
      total: pool.length,
      avgScore: pool.reduce((s, r) => s + r.score, 0) / pool.length,
    };
  }, [pool]);

  const user = useAuth((s) => s.user);
  const proUser = isPro(user);
  const visiblePool = proUser ? pool : pool.slice(0, FREE_PREVIEW_LIMIT);
  const lockedCount = proUser ? 0 : Math.max(0, pool.length - FREE_PREVIEW_LIMIT);

  return (
    <div className="space-y-3">
      {/* Üst kontrol bandı — Fon Havuzu ile aynı pattern */}
      <div className="rounded-xl border border-border bg-bg-soft p-3">
        <div className="flex items-start gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-success/15 text-success">
            <TrendingUp size={16} />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-100">Güçlü Al Havuzu — En İyi {MAX_POOL}</h3>
            <p className="text-[11px] text-slate-400 max-w-2xl">
              Tüm BIST evreninden sıkı kalite filtresi: <span className="text-success">broker-onaylı</span> (skor &ge;{SCORE_THRESHOLD.toFixed(2)} + hedef potansiyel &ge;%{BROKER_MIN_POTENTIAL})
              veya <span className="text-accent">teknik-güçlü</span> (4/4 dönem pozitif + 3A&ge;%{TECHNICAL_3M_MIN_RETURN} + 1Y&ge;%{TECHNICAL_1Y_MIN_RETURN}).
              Skora göre sıralı ilk {MAX_POOL} hisse.
            </p>
          </div>
        </div>

        {/* BIST kapsam chip'leri — EN ÜSTE (BIST 100 / BIST 30 / BIST Tüm) */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Kapsam:</span>
          {BIST_SCOPES.map((sc) => {
            const isActive = scopeFilter === sc.code;
            const count = scopeCounts[sc.code];
            return (
              <button
                key={sc.code}
                type="button"
                onClick={() => setScopeFilter(sc.code)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition',
                  isActive
                    ? 'border-accent/50 bg-accent/15 text-accent shadow-sm shadow-accent/10'
                    : 'border-border bg-bg-soft text-slate-400 hover:border-accent/30 hover:text-slate-200',
                )}
                aria-pressed={isActive}
              >
                <span>{sc.label}</span>
                <span className={cn('rounded px-1 py-0.5 text-[9px] font-bold tabular-nums', isActive ? 'bg-accent/20' : 'bg-bg-card text-slate-500')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Source chip'leri — single-select (Fon Havuzu ile aynı görünüm) */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <SourceChip label={`Tümü (${aggregated.length})`} active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')} />
          <SourceChip label={`Broker (${brokerCount})`} active={sourceFilter === 'broker'} onClick={() => setSourceFilter('broker')} tone="success" />
          <SourceChip label={`Teknik (${technicalCount})`} active={sourceFilter === 'technical'} onClick={() => setSourceFilter('technical')} tone="accent" />
          <span className="ml-auto rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            {pool.length} hisse
          </span>
        </div>
      </div>

      {/* Loading progress */}
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
            <div className="h-full bg-accent transition-all" style={{ width: `${loadPct}%` }} />
          </div>
        </div>
      )}

      {/* Özet performans kartları — Fon Havuzu pattern */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <SummaryCard label="Havuzdaki Hisse" mainValue={`${summary.total}`} sub={`Ort. skor ${summary.avgScore.toFixed(2)}`} tone="neutral" />
          <SummaryCard label="Ortalama Gün %" mainValue={fmtAvg(summary.day.avg, summary.day.count)} sub={fmtRatio(summary.day)} tone={summary.day.avg >= 0 ? 'pos' : 'neg'} />
          <SummaryCard label="Ortalama 1 Ay %" mainValue={fmtAvg(summary.r1a.avg, summary.r1a.count)} sub={fmtRatio(summary.r1a)} tone={summary.r1a.avg >= 0 ? 'pos' : 'neg'} />
          <SummaryCard label="Ortalama 3 Ay %" mainValue={fmtAvg(summary.r3a.avg, summary.r3a.count)} sub={fmtRatio(summary.r3a)} tone={summary.r3a.avg >= 0 ? 'pos' : 'neg'} />
          <SummaryCard label="Ortalama 1 Yıl %" mainValue={fmtAvg(summary.r1y.avg, summary.r1y.count)} sub={fmtRatio(summary.r1y)} tone={summary.r1y.avg >= 0 ? 'pos' : 'neg'} />
        </div>
      )}

      {/* Tablo */}
      {pool.length === 0 && !stillLoading ? (
        <div className="rounded-xl border border-border bg-bg-soft p-6 text-center">
          <Star size={28} className="mx-auto text-slate-600" />
          <p className="mt-2 text-sm text-slate-300">Güçlü Al kriterine uyan hisse bulunamadı.</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Sıkı kalite eşikleri uygulanıyor — veriler tamamlanıyor olabilir.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="border-b border-border bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="sticky left-0 z-20 bg-bg-soft px-2 py-2.5 text-left">#</th>
                <th className="sticky left-8 z-20 bg-bg-soft px-2 py-2.5 text-left">Sembol</th>
                <th className="px-2 py-2.5 text-left hidden md:table-cell">Şirket / Sektör</th>
                <SortableHeader label="Fiyat" sortKey="price" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                <SortableHeader label="Gün %" sortKey="changePct" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                <SortableHeader label="1A %" sortKey="r1a" activeKey={sortKey} dir={sortDir} onClick={setSort} className="hidden lg:table-cell" />
                <SortableHeader label="3A %" sortKey="r3a" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                <SortableHeader label="1Y %" sortKey="r1y" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                <th className="px-2 py-2.5 text-center">Tavsiye</th>
              </tr>
            </thead>
            <tbody>
              {visiblePool.map((r, i) => (
                <StrongBuyRow key={r.symbol} rec={r} rank={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lockedCount > 0 && (
        <div className="rounded-xl border-2 border-warning/40 bg-gradient-to-br from-warning/15 via-warning/5 to-transparent p-4 shadow-[0_0_24px_rgba(245,158,11,0.15)]">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning/20 text-warning shadow-inner">
              <Crown size={20} strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-warning font-bold uppercase tracking-wider text-xs">
                <Lock size={12} /> Geri Kalan {lockedCount} Hisse PRO Uyelere Ozel
              </div>
              <p className="mt-1 text-xs text-slate-300 max-w-2xl">
                Ilk {FREE_PREVIEW_LIMIT} hisseyi gosterdik. Tam Guclu Al havuzuna — {pool.length} hissenin tamamina,
                broker hedef potansiyeli, momentum skoru ve siki kalite filtreleri ile birlikte — eris.
              </p>
              <Link
                to="/uyelik"
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-warning px-3 py-1.5 text-xs font-bold text-bg-base hover:bg-warning/90 transition"
              >
                <Crown size={12} /> PRO Ol — Tum Havuza Eris
              </Link>
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-500">
        Skor: broker için 0.40 × analist + 0.30 × hedef + 0.30 × momentum; teknik için sadece momentum (4/4 dönem pozitif).
        Yatırım tavsiyesi değildir.
      </p>
    </div>
  );
}

// --- Yardımcı bileşenler ---

function fmtAvg(v: number, count: number): string {
  if (count === 0) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function fmtRatio(s: { positives: number; negatives: number; count: number }): string {
  if (s.count === 0) return '—';
  return `${s.positives} ▲ / ${s.negatives} ▼`;
}

function SourceChip({ label, active, onClick, tone }: {
  label: string; active: boolean; onClick: () => void; tone?: 'success' | 'accent';
}) {
  const activeBg = tone === 'success' ? 'bg-success/15 text-success border-success/50'
    : tone === 'accent' ? 'bg-accent/15 text-accent border-accent/50'
    : 'bg-accent/15 text-accent border-accent/50';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[10px] font-medium transition',
        active ? activeBg : 'border-border bg-bg-card text-slate-400 hover:border-accent/30 hover:text-slate-200',
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function SummaryCard({ label, mainValue, sub, tone }: {
  label: string; mainValue: string; sub: string; tone: 'pos' | 'neg' | 'neutral';
}) {
  const toneClass = tone === 'pos' ? 'text-success' : tone === 'neg' ? 'text-danger' : 'text-slate-100';
  const accent = tone === 'pos' ? 'success' : tone === 'neg' ? 'danger' : 'slate';
  return (
    <PremiumCard accent={accent} hover="lift" density="compact">
      <div className="text-[10px] font-bold uppercase tracking-wider text-accent">{label}</div>
      <div className={cn('mt-1 text-base font-bold tabular-nums drop-shadow-sm', toneClass)}>{mainValue}</div>
      <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>
    </PremiumCard>
  );
}

// --- Tablo satırı ---

interface StrongBuyRowProps { rec: AggregatedRec; rank: number; }

function StrongBuyRow({ rec, rank }: StrongBuyRowProps) {
  const dayTone = rec.changePct >= 0 ? 'text-success' : 'text-danger';
  const sign = (v: number) => (v >= 0 ? '+' : '');
  const returnsTone = (v: number | undefined) =>
    v == null ? 'text-slate-500' : v >= 0 ? 'text-success' : 'text-danger';
  const fmtReturn = (v: number | undefined) =>
    v == null ? '—' : `${sign(v)}${v.toFixed(2)}%`;

  return (
    <tr className="group border-b border-border/60 transition hover:bg-bg-card">
      <td className="sticky left-0 z-10 bg-bg-soft px-2 py-2 text-left text-[11px] text-slate-500 tabular-nums">{rank}</td>
      <td className="sticky left-8 z-10 bg-bg-soft px-2 py-2 text-left whitespace-nowrap">
        <Link to={`/stock/${rec.symbol}`} className="inline-flex items-center gap-1 font-mono text-[13px] font-semibold text-accent hover:underline">
          {rec.symbol}
          <ChevronRight size={10} className="opacity-0 transition group-hover:opacity-100" />
        </Link>
      </td>
      <td className="px-2 py-2 text-left hidden md:table-cell">
        <div className="truncate max-w-[180px] text-slate-200">{rec.name}</div>
        {rec.sector && <div className="mt-0.5 text-[9px] text-slate-500">{rec.sector}</div>}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-100">{formatMoney(rec.price)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums font-medium', dayTone)}>
        {sign(rec.changePct)}{rec.changePct.toFixed(2)}%
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', returnsTone(rec.returns?.['1a']))}>
        {fmtReturn(rec.returns?.['1a'])}
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums', returnsTone(rec.returns?.['3a']))}>
        {fmtReturn(rec.returns?.['3a'])}
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums', returnsTone(rec.returns?.['1y']))}>
        {fmtReturn(rec.returns?.['1y'])}
      </td>
      <td className="px-2 py-2 text-center">
        {rec.source === 'broker' ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success"
            title="Broker-onaylı: AL notu + skor + hedef potansiyel"
          >
            <Briefcase size={10} /> GÜÇLÜ AL
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent"
            title="Teknik-güçlü: 4/4 dönem pozitif + 3A≥%15 + 1Y≥%25"
          >
            <Activity size={10} /> MOMENTUM
          </span>
        )}
      </td>
    </tr>
  );
}
