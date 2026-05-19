import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText, Briefcase, ChevronRight, Sparkles } from 'lucide-react';
import { BROKER_RECOMMENDATIONS, ratingTone, type BrokerRecommendationSet } from '@/data/brokerRecommendations';
import { fetchBrokerRecsFeed, mergeWithStatic } from '@/data/api/brokerRecommendationsFeed';
import { cn } from '@/lib/utils';

/**
 * Aracı kurum hisse önerileri kart bloğu — RecommendationsPage'in ana içeriği.
 * Her broker için ayrı kart, içinde 3-5 hisse önerisi (rating + target + tez).
 * Sembol kodları Link — tıklayınca /stock/SYM detay sayfasına gider.
 */

export function BrokerRecommendations() {
  const [activeBroker, setActiveBroker] = useState<string>('all');
  const [merged, setMerged] = useState<BrokerRecommendationSet[]>(BROKER_RECOMMENDATIONS);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    fetchBrokerRecsFeed().then((feed) => {
      if (feed) {
        setMerged(mergeWithStatic(BROKER_RECOMMENDATIONS, feed));
        setFeedUpdatedAt(feed.fetchedAt);
      }
    });
  }, []);

  const filtered = activeBroker === 'all'
    ? merged
    : merged.filter((b) => b.brokerId === activeBroker);

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
            <Briefcase size={18} className="text-accent" /> Aracı Kurum Hisse Önerileri
            {feedUpdatedAt && feedUpdatedAt !== '1970-01-01T00:00:00Z' && (
              <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                <Sparkles size={10} /> Claude AI · canlı
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Türkiye'nin önde gelen aracı kurumlarının güncel hisse listesi. Sembole tıklayarak detay ve grafiğe ulaş.
            {feedUpdatedAt && feedUpdatedAt !== '1970-01-01T00:00:00Z' && (
              <> · <span className="text-accent">Son güncelleme: {new Date(feedUpdatedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></>
            )}
          </p>
        </div>
      </div>

      {/* Broker filter chip'leri */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveBroker('all')}
          className={cn(
            'rounded-md border px-2.5 py-1 text-[11px] font-medium transition',
            activeBroker === 'all'
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border bg-bg-soft text-slate-400 hover:border-accent/30 hover:text-accent',
          )}
        >
          Tümü ({BROKER_RECOMMENDATIONS.length})
        </button>
        {BROKER_RECOMMENDATIONS.map((b) => (
          <button
            key={b.brokerId}
            onClick={() => setActiveBroker(b.brokerId)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition',
              activeBroker === b.brokerId
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
        {filtered.map((b) => <BrokerCard key={b.brokerId} broker={b} />)}
      </div>

      <p className="mt-4 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-[11px] leading-relaxed text-warning/90">
        ⚠ Önerilen hisseler aracı kurumların resmi raporlarından alınmış bilgi amaçlı verilerdir. Yatırım tavsiyesi
        değildir. Her hisse için kart altındaki <strong>"Resmi rapor"</strong> linkinden kurumun güncel görüşüne
        ulaşabilirsiniz.
      </p>
    </section>
  );
}

function BrokerCard({ broker }: { broker: BrokerRecommendationSet }) {
  const updateDate = new Date(broker.lastUpdate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

  return (
    <div className="card overflow-hidden">
      {/* Broker header */}
      <div
        className="flex items-center gap-3 border-b border-border p-4"
        style={{ background: `linear-gradient(90deg, ${broker.colorSeed}15 0%, transparent 100%)` }}
      >
        <span
          className="grid h-10 w-10 place-items-center rounded-lg text-sm font-bold text-white"
          style={{ background: broker.colorSeed }}
        >
          {broker.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-100">{broker.brokerName}</div>
          <div className="text-[10px] text-slate-500">
            {broker.recommendations.length} öneri · Son güncelleme: {updateDate}
          </div>
        </div>
        <a
          href={broker.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent/20"
          title="Resmi rapor"
        >
          <FileText size={10} /> Rapor <ExternalLink size={9} />
        </a>
      </div>

      {/* Recommendations list */}
      <div className="divide-y divide-border">
        {broker.recommendations.map((r) => (
          <div key={r.symbol} className="group flex items-start gap-3 p-3 transition hover:bg-bg-soft/40">
            <Link
              to={`/stock/${r.symbol}`}
              className="inline-flex shrink-0 items-center gap-1 font-mono text-sm font-bold text-accent hover:underline"
            >
              {r.symbol}
              <ChevronRight size={11} className="opacity-0 transition group-hover:opacity-100" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border', ratingTone(r.rating))}>
                  {r.rating}
                </span>
                {r.targetPrice != null && (
                  <span className="text-[11px] text-slate-300">
                    Hedef: <strong className="text-success tabular-nums">{r.targetPrice.toLocaleString('tr-TR')}₺</strong>
                  </span>
                )}
                {r.stopLoss != null && (
                  <span className="text-[11px] text-slate-400">
                    Stop: <strong className="text-danger tabular-nums">{r.stopLoss.toLocaleString('tr-TR')}₺</strong>
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{r.thesis}</p>
            </div>
          </div>
        ))}
      </div>

      {broker.note && (
        <div className="border-t border-border bg-bg-soft/40 px-3 py-2 text-[10px] text-slate-500">
          ℹ️ {broker.note}
        </div>
      )}
    </div>
  );
}
