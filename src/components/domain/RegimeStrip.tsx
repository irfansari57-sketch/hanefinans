import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadMarketBreadth, loadMacroAll, type MarketBreadth } from '@/data/services';
import { fetchTrCds, type TrCdsData } from '@/data/api/trCds';
import { fetchRegime, type RegimeApi } from '@/data/api/regime';
import { macroKeyToRoute } from '@/lib/macroRoutes';
import type { MacroIndicator } from '@/data/types';
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
let macroMemo: MacroIndicator[] = [];
let cdsMemo: TrCdsData | null = null;
let regimeMemo: RegimeApi | null = null;

/** Şeritteki piyasa kalemleri — sabit sıra; 15 Eki 2026: VIX yerine TR CDS */
const MARKET_KEYS = ['USD/TRY', 'EUR/TRY', 'Gram Altın', 'Gram Gümüş', 'BTC/USD', 'Brent'] as const;
const SHORT: Record<string, string> = { 'USD/TRY': 'USD', 'EUR/TRY': 'EUR', 'Gram Altın': 'Altın', 'Gram Gümüş': 'Gümüş', 'BTC/USD': 'BTC', Brent: 'Brent' };

function fmtV(v: number | undefined, key: string): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (key === 'BTC/USD') return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 1000) return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

function Pct({ v, invert }: { v: number | undefined; invert?: boolean }) {
  if (v == null || !Number.isFinite(v)) return <span className="font-mono text-fg-3">—</span>;
  const good = invert ? v <= 0 : v >= 0;
  return <span className={cn('font-mono font-semibold', v === 0 ? 'text-neutral' : good ? 'text-success' : 'text-danger')}>{v > 0 ? '+' : ''}{v.toFixed(2)}%</span>;
}

export function RegimeStrip({ className }: { className?: string }) {
  const [b, setB] = useState<MarketBreadth | null>(memo);
  const [macro, setMacro] = useState<MacroIndicator[]>(macroMemo);
  const [cds, setCds] = useState<TrCdsData | null>(cdsMemo);
  const [regime, setRegime] = useState<RegimeApi | null>(regimeMemo);
  useEffect(() => {
    let alive = true;
    // Endeks değeri hero grafikle AYNI kaynaktan (loadMacroAll → BIST 100); genişlik snapshot'tan.
    const run = () => Promise.all([loadMarketBreadth(), loadMacroAll().catch(() => null), fetchTrCds().catch(() => null), fetchRegime('XU100')]).then(([r, m, c, rg]) => {
      if (!alive || !r) return;
      const bist = m?.data.find((x) => x.key === 'BIST 100');
      const merged: MarketBreadth = bist && bist.value > 0
        ? { ...r, index: { price: bist.value, changePct: bist.changePct ?? 0, asOf: bist.asOf ?? bist.updatedAt, source: bist.feedSource, updatedAt: Date.parse(bist.updatedAt) || 0 } }
        : r;
      memo = merged; setB(merged);
      if (m) { macroMemo = m.data; setMacro(m.data); }
      if (c) { cdsMemo = c; setCds(c); }
      if (rg) { regimeMemo = rg; setRegime(rg); }
    });
    run();
    const t = window.setInterval(run, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);
  const macroMap = new Map(macro.map((x) => [x.key, x]));

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
        'flex h-9 items-center gap-2.5 overflow-x-auto whitespace-nowrap border-b border-border bg-bg-soft px-3 text-[12px] [scrollbar-width:none] 2xl:gap-4 2xl:px-4 2xl:text-[13px]',
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
      <span className="inline-flex items-center gap-1 text-fg-2" title="Piyasa genişliği: yükselen / düşen hisse">
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full', breadthTone)} aria-hidden />
        <span className="font-mono text-success">▲{b.advancers}</span>
        <span className="font-mono text-danger">▼{b.decliners}</span>
        <EvidenceLink
          title="Genişlik"
          rows={[
            { label: 'Yükselen', value: String(b.advancers), source: b.source.toUpperCase() },
            { label: 'Düşen', value: String(b.decliners), source: b.source.toUpperCase() },
            { label: 'Yatay', value: String(b.unchanged) },
            { label: 'Tavan / taban', value: `${b.limitUp} / ${b.limitDown}`, source: '≥ ±9,5%' },
            { label: 'Kapsam', value: `${b.total} yerli hisse (BYF hariç)` },
          ]}
        />
      </span>
      {regime && regime.bars >= 60 && (
        <span className="hidden md:inline-flex items-center gap-1 text-fg-2" title="Piyasa rejimi — deterministik (SMA50/200 eğimi, 20g gerçekleşmiş oynaklık)">
          <span className={cn('font-medium', regime.trend.regime === 'yükseliş' ? 'text-success' : regime.trend.regime === 'düşüş' ? 'text-danger' : 'text-fg')}>
            {regime.trend.regime === 'yükseliş' ? 'Yükseliş' : regime.trend.regime === 'düşüş' ? 'Düşüş' : 'Yatay'}
          </span>
          {/* Oynaklık yalnız normalden sapınca yazılır (normal = varsayılan durum, yer kaplamasın) */}
          {regime.vol.percentile1y != null && regime.vol.regime !== 'normal' && (
            <span className={cn(regime.vol.regime === 'yüksek' ? 'text-warning' : 'text-fg-2')}>
              · {regime.vol.regime === 'yüksek' ? 'yüksek' : 'düşük'} oynaklık
            </span>
          )}
          <EvidenceLink
            title={`Rejim · ${regime.asOfDate ?? ''}`}
            rows={[...regime.trend.evidence, ...regime.vol.evidence]}
          />
        </span>
      )}
      <span className="h-4 w-px bg-border" aria-hidden />
      {MARKET_KEYS.map((k) => {
        const m = macroMap.get(k);
        return (
          <Link key={k} to={macroKeyToRoute(k) ?? '/global'} className="inline-flex items-center gap-1 hover:text-accent">
            <span className="text-fg-2">{SHORT[k]}</span>
            <span className="font-mono font-semibold text-fg">{fmtV(m?.value, k)}</span>
            <Pct v={m?.changePct} />
          </Link>
        );
      })}
      <Link to="/global" className="inline-flex items-center gap-1.5 hover:text-accent" title="Türkiye 5 yıllık CDS (bps) — düşüş olumlu">
        <span className="text-fg-2">CDS</span>
        <span className="font-mono font-semibold text-fg">{cds?.value != null ? cds.value.toFixed(0) : '—'}</span>
        <Pct v={cds?.changePct ?? undefined} invert />
      </Link>
      <span className="ml-auto hidden 2xl:inline">
        <DataFreshness source={idx.source} asOf={asOfIso} delayMin={15} compact />
      </span>
      {/* Dar ekranda: yalnız saat, kaynak/gecikme tooltip'te */}
      <span className="ml-auto inline font-mono text-[11px] text-fg-3 2xl:hidden" title={`${idx.source ?? 'kaynak'} · ~15 dk gecikmeli`}>
        {asOfIso && !/^\d{4}-\d{2}-\d{2}$/.test(asOfIso) ? new Date(asOfIso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) : ''}
      </span>
    </div>
  );
}
