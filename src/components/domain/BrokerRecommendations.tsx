import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText, Briefcase, ChevronRight, Sparkles } from 'lucide-react';
import { BROKER_RECOMMENDATIONS, ratingTone, type BrokerRecommendationSet, type StockRecommendation } from '@/data/brokerRecommendations';
import { fetchBrokerRecsFeed, mergeWithStatic } from '@/data/api/brokerRecommendationsFeed';
import { RecPoolStats, type PoolStatBoxData } from './RecPoolStats';
import { cn } from '@/lib/utils';

/**
 * Aracı kurum hisse önerileri akordeon listesi — RecommendationsPage'in
 * "Aracı Kurum" tab'ı. Her broker bir <details> satırı, açılınca öneriler
 * dökülür. Üstte havuz istatistikleri (toplam, AL/TUT dağılımı, en çok
 * önerilen sembol, ortalama hedef fiyat).
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

  // Pool stats — filtrelenmiş listeyi baz alır
  const stats = useMemo(() => computeBrokerPoolStats(filtered), [filtered]);

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

      {/* Üst özet bloğu (havuz istatistikleri + konsensüs satırı) kullanıcı talebi ile kaldırıldı. */}

      {/* Broker filter chip'leri */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveBroker('all')}
          className={cn(
            'rounded-md border px-2.5 py-1 text-[11px] font-medium transition',
            activeBroker === 'all'
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border bg-bg-soft text-slate-400 hover:border-accent/30 hover:text-accent',
          )}
        >
          Tümü ({merged.length})
        </button>
        {merged.map((b) => (
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

      {/* Akordeon liste */}
      <div className="space-y-1.5">
        {filtered.map((b) => <BrokerAccordionItem key={b.brokerId} broker={b} />)}
      </div>

      <p className="mt-4 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-[11px] leading-relaxed text-warning/90">
        ⚠ Önerilen hisseler aracı kurumların resmi raporlarından alınmış bilgi amaçlı verilerdir. Yatırım tavsiyesi
        değildir. Her broker satırını açıp <strong>"Rapor"</strong> linkinden kurumun güncel görüşüne ulaşabilirsiniz.
      </p>
    </section>
  );
}

/** Pool stats hesapla: toplam öneri, AL/TUT dağılımı, broker sayısı, ortalama hedef, en güncel tarih. */
function computeBrokerPoolStats(brokers: BrokerRecommendationSet[]): PoolStatBoxData[] {
  const allRecs: StockRecommendation[] = brokers.flatMap((b) => b.recommendations);
  const total = allRecs.length;
  const brokerCount = brokers.length;
  const buy = allRecs.filter((r) => r.rating === 'AL' || r.rating === 'GÜÇLÜ AL').length;
  const hold = allRecs.filter((r) => r.rating === 'TUT' || r.rating === 'BIRIKIM YAP').length;
  const neutral = allRecs.filter((r) => r.rating === 'NÖTR').length;
  const buyPct = total > 0 ? Math.round((buy / total) * 100) : 0;

  const withTarget = allRecs.filter((r) => Number.isFinite(r.targetPrice));
  const avgTarget = withTarget.length > 0
    ? withTarget.reduce((s, r) => s + (r.targetPrice ?? 0), 0) / withTarget.length
    : 0;

  // En son tarih
  const latestUpdate = brokers.length > 0
    ? brokers.map((b) => b.lastUpdate).sort().reverse()[0]
    : '';
  const latestDisplay = latestUpdate
    ? new Date(latestUpdate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
    : '-';

  // Konsensüs lider: en çok önerilen sembol
  const symbolCounts = new Map<string, number>();
  allRecs.forEach((r) => symbolCounts.set(r.symbol, (symbolCounts.get(r.symbol) ?? 0) + 1));
  const topConsensus = [...symbolCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return [
    { label: 'Toplam Öneri', value: `${total}`, sub: `${brokerCount} broker`, tone: 'slate' },
    { label: 'AL Oranı',     value: `%${buyPct}`, sub: `${buy} AL`, tone: 'success' },
    { label: 'TUT/Birikim',  value: `${hold}`, sub: `${neutral} nötr`, tone: 'warning' },
    { label: 'Ort. Hedef',   value: avgTarget > 0 ? `${avgTarget.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}₺` : '-', sub: `${withTarget.length} hedefli`, tone: 'accent' },
    { label: 'Konsensüs',    value: topConsensus ? topConsensus[0] : '-', sub: topConsensus ? `${topConsensus[1]} broker` : undefined, tone: 'accent' },
    { label: 'Son Güncelleme', value: latestDisplay, tone: 'slate' },
  ];
}

/** En çok önerilen 3 sembol + en az önerilen 3 sembol. */
function BrokerConsensusStrip({ brokers }: { brokers: BrokerRecommendationSet[] }) {
  const allRecs = brokers.flatMap((b) => b.recommendations);
  if (allRecs.length === 0) return null;

  // Sembol → broker count + ortalama hedef
  const map = new Map<string, { count: number; targets: number[] }>();
  allRecs.forEach((r) => {
    const e = map.get(r.symbol) ?? { count: 0, targets: [] };
    e.count++;
    if (Number.isFinite(r.targetPrice)) e.targets.push(r.targetPrice as number);
    map.set(r.symbol, e);
  });
  const ranked = [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  const top3 = ranked.slice(0, 3);
  const bottom3 = ranked.slice(-3).reverse();

  if (top3.length === 0) return null;

  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-success">Top 3 Konsensüs</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {top3.map(([sym, e]) => (
            <Link key={sym} to={`/stock/${sym}`} className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 font-mono font-semibold text-success hover:bg-success/20">
              {sym}<span className="text-[10px] opacity-70">×{e.count}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-500/30 bg-slate-500/5 px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Düşük Tekrar (1 broker)</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {bottom3.map(([sym, e]) => (
            <Link key={sym} to={`/stock/${sym}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-0.5 font-mono font-semibold text-slate-300 hover:border-accent/40 hover:text-accent">
              {sym}<span className="text-[10px] opacity-70">×{e.count}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Broker satırı — akordeon. Summary'de özet, açılınca tüm öneriler. */
function BrokerAccordionItem({ broker }: { broker: BrokerRecommendationSet }) {
  const updateDate = new Date(broker.lastUpdate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const buyCount = broker.recommendations.filter((r) => r.rating === 'AL' || r.rating === 'GÜÇLÜ AL').length;

  return (
    <details className="group overflow-hidden rounded-lg border border-border bg-bg-soft transition hover:border-accent/30">
      <summary
        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm select-none [&::-webkit-details-marker]:hidden"
        style={{ background: `linear-gradient(90deg, ${broker.colorSeed}10 0%, transparent 60%)` }}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
          style={{ background: broker.colorSeed }}
        >
          {broker.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate text-sm font-semibold text-slate-100">{broker.brokerName}</span>
            {buyCount > 0 && (
              <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                {buyCount} AL
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500">
            {broker.recommendations.length} öneri · {updateDate}
          </div>
        </div>
        <a
          href={broker.sourceUrl}
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

      <div className="divide-y divide-border border-t border-border bg-bg-card">
        {broker.recommendations.map((r) => (
          <div key={r.symbol} className="group/row flex items-start gap-3 p-3 transition hover:bg-bg-soft/40">
            <Link
              to={`/stock/${r.symbol}`}
              className="inline-flex shrink-0 items-center gap-1 font-mono text-sm font-bold text-accent hover:underline"
            >
              {r.symbol}
              <ChevronRight size={11} className="opacity-0 transition group-hover/row:opacity-100" />
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
    </details>
  );
}
