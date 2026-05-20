import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, PieChart, ChevronRight, FileText, Sparkles } from 'lucide-react';
import { BROKER_PORTFOLIOS, riskTone, type BrokerPortfolio } from '@/data/brokerPortfolios';
import { fetchBrokerRecsFeed } from '@/data/api/brokerRecommendationsFeed';
import { cn } from '@/lib/utils';

/**
 * Aracı kurum model portföyleri — RecommendationsPage'in "Model Portföyler" tabı.
 * Her broker için ağırlıklı hisse dağılımı (stacked bar + liste).
 * Sembollere tıklayınca /stock/SYM detay sayfası açılır.
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

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
          <PieChart size={18} className="text-accent" /> Aracı Kurum Model Portföyleri
          {feedUpdatedAt && feedUpdatedAt !== '1970-01-01T00:00:00Z' && (
            <></>
          )}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Aracı kurumların önerdiği ağırlıklı hisse dağılımları. Her bara tıklayarak ilgili hissenin detay sayfasına ulaşabilirsin.
          {feedUpdatedAt && feedUpdatedAt !== '1970-01-01T00:00:00Z' && (
            <> · <span className="text-success">Son güncelleme: {new Date(feedUpdatedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></>
          )}
        </p>
      </div>

      {/* Broker filter chip'leri */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setActive('all')}
          className={cn(
            'rounded-md border px-2.5 py-1 text-[11px] font-medium transition',
            active === 'all'
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border bg-bg-soft text-slate-400 hover:border-accent/30 hover:text-accent',
          )}
        >
          Tümü ({BROKER_PORTFOLIOS.length})
        </button>
        {BROKER_PORTFOLIOS.map((b) => (
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

      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map((p) => <PortfolioCard key={p.brokerId} portfolio={p} />)}
      </div>

      <p className="mt-4 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-[11px] leading-relaxed text-warning/90">
        ⚠ Model portföyler aracı kurumların kendi yatırım stratejilerinin örnek dağılımıdır. Yatırım tavsiyesi değildir.
        Kişisel risk profilinize göre değerlendirin.
      </p>
    </section>
  );
}

function PortfolioCard({ portfolio: p }: { portfolio: BrokerPortfolio }) {
  const updateDate = new Date(p.lastUpdate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const totalWeight = p.holdings.reduce((s, h) => s + h.weight, 0);
  // En yüksek 3 ağırlığı bul (büyük dilimleri vurgulamak için)
  const sortedHoldings = [...p.holdings].sort((a, b) => b.weight - a.weight);

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-border p-4"
        style={{ background: `linear-gradient(90deg, ${p.colorSeed}15 0%, transparent 100%)` }}
      >
        <span
          className="grid h-10 w-10 place-items-center rounded-lg text-sm font-bold text-white"
          style={{ background: p.colorSeed }}
        >
          {p.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-100">{p.brokerName}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border', riskTone(p.riskProfile))}>
              {p.riskProfile}
            </span>
            <span>· {p.holdings.length} hisse · {updateDate}</span>
          </div>
        </div>
        <a
          href={p.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent/20"
          title="Resmi rapor"
        >
          <FileText size={10} /> Rapor <ExternalLink size={9} />
        </a>
      </div>

      {/* Stacked weight bar */}
      <div className="border-b border-border bg-bg-card p-3">
        <div className="mb-1.5 flex items-center justify-between text-[10px]">
          <span className="font-medium text-slate-400">Ağırlık Dağılımı</span>
          <span className="tabular-nums text-slate-500">Toplam: %{totalWeight.toFixed(0)}</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-md bg-bg-soft">
          {sortedHoldings.map((h, i) => (
            <Link
              key={h.symbol}
              to={`/stock/${h.symbol}`}
              className="group relative transition hover:brightness-125"
              style={{
                width: `${(h.weight / totalWeight) * 100}%`,
                background: shadeColor(p.colorSeed, i),
              }}
              title={`${h.symbol} — %${h.weight}`}
            >
              <span className="pointer-events-none absolute inset-x-0 -bottom-5 hidden truncate text-center text-[9px] text-slate-400 group-hover:block">
                {h.symbol}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Holdings table */}
      <div className="divide-y divide-border">
        {sortedHoldings.map((h, i) => (
          <div key={h.symbol} className="group flex items-start gap-3 px-3 py-2 transition hover:bg-bg-soft/40">
            <span className="w-4 text-[10px] text-slate-500 tabular-nums">{i + 1}</span>
            <Link
              to={`/stock/${h.symbol}`}
              className="inline-flex shrink-0 items-center gap-1 font-mono text-sm font-bold text-accent hover:underline"
            >
              {h.symbol}
              <ChevronRight size={10} className="opacity-0 transition group-hover:opacity-100" />
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
    </div>
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
