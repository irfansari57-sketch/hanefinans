import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScalpRec } from './types';
import type { DailySnapshot } from './types';
import { loadSnapshots, todayDate, daysAgo } from './snapshotStore';
import { tfLabel } from './scalpHelpers';

/**
 * Tarihsel Performans kartı — geçmiş daily snapshot'lardaki önerilerin
 * MEVCUT (recs[]) fiyatlarla karşılaştırıldığında performansı.
 *
 * recs[]: bugünkü listede şu an olan semboller (entry fiyatları yok)
 * snapshots[]: geçmiş günlerden dönen önerilerin o günkü entry fiyatları
 *
 * Mantık: her snapshot için, snapshot'daki sembolleri recs[]'te bul.
 * Mevcut fiyat ile snapshot.entryPrice arasındaki yüzde fark = getirisi.
 */
export function HistoricalPerformanceCard({ recs }: { recs: ScalpRec[] }) {
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);

  useEffect(() => {
    setSnapshots(loadSnapshots());
  }, [recs]);

  // Bugünün snapshot'ını atla, yalnız geçmiş günler
  const today = todayDate();
  const pastSnaps = snapshots.filter((s) => s.date !== today);

  if (pastSnaps.length === 0) {
    return (
      <details className="card mb-3">
        <summary className="cursor-pointer px-3 py-2 text-xs text-slate-400 [&::-webkit-details-marker]:hidden flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gecmis Performans</span>
          <ChevronRight size={11} className="transition-transform group-open:rotate-90" />
          <span className="ml-auto text-[10px] text-slate-500">henuz kayit yok</span>
        </summary>
        <div className="border-t border-border px-3 py-3 text-xs text-slate-400">
          Bu gunkulistesi bu seansta kaydedildi. Yarin ve sonraki gunlerde geri donen onerilerin
          gercek performansini bu kartta gorebileceksin.
        </div>
      </details>
    );
  }

  // Her snapshot için getirisini hesapla
  const recsBySymbol = new Map(recs.map((r) => [r.stock.symbol, r]));
  const perfData = pastSnaps.map((snap) => {
    const detailed = snap.entries.map((e) => {
      const current = recsBySymbol.get(e.symbol);
      if (!current) return null;
      const returnPct = ((current.stock.price - e.entryPrice) / e.entryPrice) * 100;
      return { ...e, currentPrice: current.stock.price, returnPct };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    if (detailed.length === 0) {
      return { snap, hitRate: 0, avgReturn: 0, count: 0, top: null, bottom: null };
    }
    const positive = detailed.filter((d) => d.returnPct > 0).length;
    const hitRate = (positive / detailed.length) * 100;
    const avgReturn = detailed.reduce((s, d) => s + d.returnPct, 0) / detailed.length;
    const sorted = [...detailed].sort((a, b) => b.returnPct - a.returnPct);
    return {
      snap,
      hitRate,
      avgReturn,
      count: detailed.length,
      top: sorted[0],
      bottom: sorted[sorted.length - 1],
    };
  });

  return (
    <details className="card group mb-3">
      <summary className="cursor-pointer px-3 py-2.5 text-xs [&::-webkit-details-marker]:hidden flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gecmis Performans</span>
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent">{pastSnaps.length} kayit</span>
        <ChevronRight size={11} className="text-slate-500 transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border px-3 py-3">
        <div className="space-y-2">
          {perfData.map(({ snap, hitRate, avgReturn, count, top, bottom }) => {
            const ageDays = daysAgo(snap.date);
            const ageLabel = ageDays === 0 ? 'bugun' : ageDays === 1 ? '1 gun once' : `${ageDays} gun once`;
            const returnClass = avgReturn >= 0 ? 'text-success' : 'text-danger';
            const sign = avgReturn >= 0 ? '+' : '';
            return (
              <div key={snap.date} className="rounded-lg border border-border bg-bg-soft p-2.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-mono text-slate-300">{snap.date}</span>
                  <span className="text-slate-500">{ageLabel}</span>
                  <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[9px] uppercase text-slate-400">
                    {tfLabel(snap.selectedTf)} · {count} eslesme
                  </span>
                  <span className={cn('ml-auto font-semibold tabular-nums', returnClass)}>
                    Ort: {sign}{avgReturn.toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Isabet: %{hitRate.toFixed(0)}
                  </span>
                </div>
                {(top || bottom) && (
                  <div className="mt-1.5 flex gap-3 text-[10px]">
                    {top && (
                      <span className="text-success">
                        En iyi: <span className="font-mono font-bold">{top.symbol}</span> +{top.returnPct.toFixed(2)}%
                      </span>
                    )}
                    {bottom && bottom.returnPct < 0 && (
                      <span className="text-danger">
                        En kotu: <span className="font-mono font-bold">{bottom.symbol}</span> {bottom.returnPct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
          ℹ Bu metrik bugun listede HALA olan sembolleri esleştirir. Listeden cikmis semboller hesapta yer almaz.
          Snapshot her gun ilk refresh'te otomatik kaydedilir.
        </p>
      </div>
    </details>
  );
}
