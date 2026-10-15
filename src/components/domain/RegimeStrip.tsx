import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadMarketBreadth, loadMacroAll, type MarketBreadth } from '@/data/services';
import { DataFreshness } from '@/components/ui/DataFreshness';
import { EvidenceLink } from '@/components/ui/EvidenceLink';
import { cn } from '@/lib/utils';

/**
 * Rejim şeridi — Design 03 Signature #1 (v1, 15 Eki 2026).
 * Her sayfanın üstünde tek satır: XU100 · günlük % · piyasa genişliği · veri yaşı.
 * v1 yalnız deterministik verileri gösterir (snapshot'tan yükselen/düşen sayımı).
 * Trend/oynaklık rejimi Hafta 2 motoru (/api/bars/regime) hazır olunca eklenir;
 * o zamana kadar bu alan BOŞ kalır, tahmin yazılmaz.
 */
let memo: MarketBreadth | null = null;

export function RegimeStrip({ className }: { className?: string }) {
  const [b, setB] = useState<MarketBreadth | null>(memo);
  useEffect(() => {
    let alive = true;
    // Endeks değeri hero grafikle AYNI kaynaktan (loadMacroAll → BIST 100); genişlik snapshot'tan.
    const run = () => Promise.all([loadMarketBreadth(), loadMacroAll().catch(() => null)]).then(([r, m]) => {
      if (!alive || !r) return;
      const bist = m?.data.find((x) => x.key === 'BIST 100');
      const merged: MarketBreadth = bist && bist.value > 0
        ? { ...r, index: { price: bist.value, changePct: bist.changePct ?? 0, asOf: bist.asOf ?? bist.updatedAt, source: bist.feedSource, updatedAt: Date.parse(bist.updatedAt) || 0 } }
        : r;
      memo = merged; setB(merged);
    });
    run();
    const t = window.setInterval(run, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  if (!b || !b.index) return null;
  const idx = b.index;
  const pct = idx.changePct;
  const tone = pct > 0.0001 ? 'text-success' : pct < -0.0001 ? 'text-danger' : 'text-neutral';
  const breadthPct = b.total > 0 ? Math.round((b.advancers / b.total) * 100) : 0;
  const breadthTone = breadthPct >= 60 ? 'bg-success' : breadthPct <= 40 ? 'bg-danger' : 'bg-warning';
  const asOfIso = idx.asOf;

  return (
    <div
      className={cn(
        'flex h-9 items-center gap-3 overflow-x-auto whitespace-nowrap border-b border-border bg-bg-soft px-4 text-[13px] [scrollbar-width:none]',
        className,
      )}
      aria-label="Piyasa rejimi"
    >
      <Link to="/stock/XU100" className="font-mono font-semibold text-fg hover:text-accent">
        XU100 {idx.price.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
      </Link>
      <span className={cn('font-mono font-semibold', tone)}>
        {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
      </span>
      <span className="text-fg-3">·</span>
      <span className="inline-flex items-center gap-1.5 text-fg-2">
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full', breadthTone)} aria-hidden />
        Genişlik
        <span className="font-mono text-fg">{b.advancers}</span>
        <span className="text-fg-3">/</span>
        <span className="font-mono text-fg">{b.decliners}</span>
        <span className="hidden sm:inline text-fg-3">yükselen/düşen</span>
        {(b.limitUp > 0 || b.limitDown > 0) && (
          <span className="hidden md:inline text-fg-3">
            · tavan <span className="font-mono text-success">{b.limitUp}</span> · taban <span className="font-mono text-danger">{b.limitDown}</span>
          </span>
        )}
        <EvidenceLink
          title="Genişlik hesabı"
          rows={[
            { label: 'Yükselen', value: String(b.advancers), source: b.source.toUpperCase() },
            { label: 'Düşen', value: String(b.decliners), source: b.source.toUpperCase() },
            { label: 'Yatay', value: String(b.unchanged) },
            { label: 'Kapsam', value: `${b.total} yerli hisse (BYF hariç)` },
            { label: 'Tavan / taban', value: `${b.limitUp} / ${b.limitDown}`, source: '≥ ±9,5%' },
          ]}
        />
      </span>
      <span className="ml-auto">
        <DataFreshness source={idx.source} asOf={asOfIso} delayMin={15} compact />
      </span>
    </div>
  );
}
