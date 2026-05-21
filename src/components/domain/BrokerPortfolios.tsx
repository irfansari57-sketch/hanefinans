import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, PieChart, ChevronRight, FileText, Sparkles } from 'lucide-react';
import { BROKER_PORTFOLIOS, riskTone, type BrokerPortfolio } from '@/data/brokerPortfolios';
import { fetchBrokerRecsFeed } from '@/data/api/brokerRecommendationsFeed';
import { RecPoolStats, type PoolStatBoxData } from './RecPoolStats';
import { cn } from '@/lib/utils';

/**
 * Aracı kurum model portföyleri — RecommendationsPage'in "Model Portföyler" tabı.
 * Her broker bir akordeon satırı: summary'de risk profili + holdings count,
 * açılınca stacked bar + holdings tablosu. Üstte havuz istatistikleri.
 */
export function BrokerPortfolios() {
  const [active, setActive] = useState<string>('all');
  const [merged, setMerged] = useState<BrokerPortfolio[]>(BROKER_PORTFOLIOS);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    fetchBrokerRecsFeed().then((feed) => {
      if (!feed?.brokers) return;
      setFeedUpdatedAt(feed.fetchedAt);
      // Static + dynamic merge — dynamic portföy varsa öncelikli
      const dynamicMap = new Map(feed.brokers.map((b) => [b.brokerId, b]));
      const result = BROKER_PORTFOLIOS.map((stat) => {
        const dyn = dynamicMap.get(stat.brokerId);
        if (!dyn?.portfolio || dyn.portfolio.length === 0) return stat;
        return {
          ...stat,
          lastUpdate: dyn.lastUpdate,
          holdings: dyn.portfolio.map((h) => ({
            symbol: h.symbol,
            weight: h.weight,
          })),
          note: 'Otomatik (İş Yatırım önerileri sayfasından scrape)',
        };
      });
      setMerged(result);
    });
  }, []);

  const filtered = active === 'all'
    ? merged
    : merged.filter((p) => p.brokerId === active);

  const stats = useMemo(() => computePortfolioPoolStats(filtered), [filtered]);

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
          <PieChart size={18} className="text-accent" /> Aracı Kurum Model Portföyleri
          {feedUpdatedAt && feedUpdatedAt !== '1970-01-01T00:00:00Z' && (
            <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
              <Sparkles size={10} /> canlı
            </span>
          )}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Aracı kurumların önerdiği ağırlıklı hisse dağılımları. Satıra tıklayıp açın, ardından sembollere tıklayarak detaya ulaşın.
          {feedUpdatedAt && feedUpdatedAt !== '1970-01-01T00:00:00Z' && (
            <> · <span className="text-success">Son güncelleme: {new Date(feedUpdatedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></>
          )}
        </p>
      </div>

      {/* Havuz istatistikleri */}
      <RecPoolStats boxes={stats} />

      {/* Top/Bottom konsensüs ağırlık */}
      <PortfolioConsensusStrip portfolios={filtered} />

      {/* Broker filter chip'leri */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => setActive('all')}
          className={cn(
            'rounded-md border px-2.5 py-1 text-[11px] font-medium transition',
            active === 'all'
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border bg-bg-soft text-slate-400 hover:border-accent/30 hover:text-accent',
          )}
        >
          Tümü ({merged.length})
        </button>
        {merged.map((b) => (
          <button
            key={b.brokerId}
            onClick={() => setActive(b.brokerId)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition',
              active === b.brokerId
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border bg-bg-soft text-slate-400 hover:border-accent/30 hover:text-accent',
            )}
          >
            <span
              className="grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold text-white"
              style={{ background: b.colorSeed }}
            >
              {b.initials}
            </span>
            {b.brokerName}
          </button>
        ))}
      </div>

      {/* Akordeon liste */}
      <div className="space-y-1.5">
        {filtered.map((p) => <PortfolioAccordionItem key={p.brokerId} portfolio={p} />)}
      </div>

      <p className="mt-4 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-[11px] leading-relaxed text-warning/90">
        ⚠ Model portföyler aracı kurumların kendi yatırım stratejilerinin örnek dağılımıdır. Yatırım tavsiyesi değildir.
        Kişisel risk profilinize göre değerlendirin.
      </p>
    </section>
  );
}

/** Pool stats: toplam portföy, toplam unik sembol, risk dağılımı, ortalama holdings count. */
function computePortfolioPoolStats(portfolios: BrokerPortfolio[]): PoolStatBoxData[] {
  const totalPortfolios = portfolios.length;
  const allHoldings = portfolios.flatMap((p) => p.holdings);
  const totalHoldingsCount = allHoldings.length;
  const uniqueSymbols = new Set(allHoldings.map((h) => h.symbol)).size;
  const avgHoldings = totalPortfolios > 0 ? totalHoldingsCount / totalPortfolios : 0;

  // Risk profile dağılımı
  const riskCounts = new Map<string, number>();
  portfolios.forEach((p) => riskCounts.set(p.riskProfile, (riskCounts.get(p.riskProfile) ?? 0) + 1));
  const dominantRisk = [...riskCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  // Konsensüs lider: tüm portföylerde en sık geçen sembol
  const symbolCounts = new Map<string, number>();
  allHoldings.forEach((h) => symbolCounts.set(h.symbol, (symbolCounts.get(h.symbol) ?? 0) + 1));
  const topConsensus = [...symbolCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  // En son güncellenme
  const latestUpdate = portfolios.length > 0
    ? portfolios.map((p) => p.lastUpdate).sort().reverse()[0]
    : '';
  const latestDisplay = latestUpdate
    ? new Date(latestUpdate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
    : '-';

  return [
    { label: 'Toplam Portföy', value: `${totalPortfolios}`, sub: `${uniqueSymbols} unik sembol`, tone: 'slate' },
    { label: 'Toplam Holding', value: `${totalHoldingsCount}`, sub: `ort ${avgHoldings.toFixed(1)}/portföy`, tone: 'accent' },
    { label: 'Risk Profili',   value: dominantRisk ? dominantRisk[0] : '-', sub: dominantRisk ? `${dominantRisk[1]} broker` : undefined, tone: 'warning' },
    { label: 'Konsensüs',      value: topConsensus ? topConsensus[0] : '-', sub: topConsensus ? `${topConsensus[1]} portföyde` : undefined, tone: 'success' },
    { label: 'Pozisyon Çeşit', value: `${uniqueSymbols}`, sub: 'tekrar dışı', tone: 'accent' },
    { label: 'Son Güncelleme', value: latestDisplay, tone: 'slate' },
  ];
}

/** En çok ağırlık verilen ve en az ağırlık verilen 3 sembol (tüm portföyler toplam). */
function PortfolioConsensusStrip({ portfolios }: { portfolios: BrokerPortfolio[] }) {
  const allHoldings = portfolios.flatMap((p) => p.holdings);
  if (allHoldings.length === 0) return null;

  // Sembol → toplam ağırlık (tüm portföyler bazında)
  const map = new Map<string, { totalWeight: number; portfolios: number }>();
  for (const p of portfolios) {
    for (const h of p.holdings) {
      const e = map.get(h.symbol) ?? { totalWeight: 0, portfolios: 0 };
      e.totalWeight += h.weight;
      e.portfolios++;
      map.set(h.symbol, e);
    }
  }
  const ranked = [...map.entries()].sort((a, b) => b[1].totalWeight - a[1].totalWeight);
  const top3 = ranked.slice(0, 3);
  const bottom3 = ranked.slice(-3).reverse();

  if (top3.length === 0) return null;

  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-success">Top 3 Ağırlık</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {top3.map(([sym, e]) => (
            <Link key={sym} to={`/stock/${sym}`} className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 font-mono font-semibold text-success hover:bg-success/20">
              {sym}<span className="text-[10px] opacity-70">%{e.totalWeight.toFixed(0)}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-500/30 bg-slate-500/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">En Az Ağırlık</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {bottom3.map(([sym, e]) => (
            <Link key={sym} to={`/stock/${sym}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-0.5 font-mono font-semibold text-slate-300 hover:border-accent/40 hover:text-accent">
              {sym}<span className="text-[10px] opacity-70">%{e.totalWeight.toFixed(0)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Bir broker portföy akordeon satırı. Summary'de özet, açılınca bar + holdings. */
function PortfolioAccordionItem({ portfolio: p }: { portfolio: BrokerPortfolio }) {
  const updateDate = new Date(p.lastUpdate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const totalWeight = p.holdings.reduce((s, h) => s + h.weight, 0);
  const sortedHoldings = [...p.holdings].sort((a, b) => b.weight - a.weight);
  const topPick = sortedHoldings[0];

  return (
    <details className="group overflow-hidden rounded-lg border border-border bg-bg-soft transition hover:border-accent/30">
      <summary
        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm select-none [&::-webkit-details-marker]:hidden"
        style={{ background: `linear-gradient(90deg, ${p.colorSeed}10 0%, transparent 60%)` }}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
          style={{ background: p.colorSeed }}
        >
          {p.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate text-sm font-semibold text-slate-100">{p.brokerName}</span>
            <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border', riskTone(p.riskProfile))}>
              {p.riskProfile}
            </span>
            {topPick && (
              <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent">
                {topPick.symbol} <span className="opacity-70">%{topPick.weight}</span>
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500">
            {p.holdings.length} hisse · {updateDate}
          </div>
        </div>
        <a
          href={p.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent/20"
          title="Resmi rapor"
          onClick={(e) => e.stopPropagation()}
        >
          <FileText size={10} /> Rapor <ExternalLink size={9} />
        </a>
        <ChevronRight size={14} className="shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
      </summary>

      {/* Stacked weight bar */}
      <div className="border-t border-border bg-bg-card p-3">
        <div className="mb-1.5 flex items-center justify-between text-[10px]">
          <span className="font-medium text-slate-400">Ağırlık Dağılımı</span>
          <span className="tabular-nums text-slate-500">Toplam: %{totalWeight.toFixed(0)}</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-md bg-bg-soft">
          {sortedHoldings.map((h, i) => (
            <Link
              key={h.symbol}
              to={`/stock/${h.symbol}`}
              className="group/seg relative transition hover:brightness-125"
              style={{
                width: `${(h.weight / Math.max(totalWeight, 1)) * 100}%`,
                background: shadeColor(p.colorSeed, i),
              }}
              title={`${h.symbol} — %${h.weight}`}
            >
              <span className="pointer-events-none absolute inset-x-0 -bottom-5 hidden truncate text-center text-[9px] text-slate-400 group-hover/seg:block">
                {h.symbol}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Holdings table */}
      <div className="divide-y divide-border bg-bg-card">
        {sortedHoldings.map((h, i) => (
          <div key={h.symbol} className="group/row flex items-start gap-3 px-3 py-2 transition hover:bg-bg-soft/40">
            <span className="w-4 text-[10px] text-slate-500 tabular-nums">{i + 1}</span>
            <Link
              to={`/stock/${h.symbol}`}
              className="inline-flex shrink-0 items-center gap-1 font-mono text-sm font-bold text-accent hover:underline"
            >
              {h.symbol}
              <ChevronRight size={10} className="opacity-0 transition group-hover/row:opacity-100" />
            </Link>
            <div className="min-w-0 flex-1">
              {h.thesis && <p className="text-[11px] leading-relaxed text-slate-400">{h.thesis}</p>}
            </div>
            <div className="text-right">
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-accent">
                %{h.weight}
              </span>
            </div>
          </div>
        ))}
      </div>

      {p.note && (
        <div className="border-t border-border bg-bg-soft/40 px-3 py-2 text-[10px] text-slate-500">
          ℹ️ {p.note}
        </div>
      )}
    </details>
  );
}

// Renk skalası — broker rengini base alıp dilimleri farklı tonlarda gösterir
function shadeColor(hex: string, idx: number): string {
  // Basit alfa düşürme — sıralı dilimler için yeterli görsel ayrım
  const alpha = Math.max(0.45, 1 - idx * 0.06);
  // hex → rgba dönüştür
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
