/**
 * FundHoldersCard — "Bu hisseyi tutan fonlar" (28 Eki 2026).
 * Kaynak: /api/stocks/:symbol/funds → KAP Portföy Dağılım Raporu ters indeksi (data/holdings/by-stock.json).
 * Dürüstlük: yalnız raporu işlenmiş fonlar (kapsam N fon) — "tüm fonlar" değil; dönem etiketi her satırda.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers } from 'lucide-react';

interface Holder { code: string; name: string; pct: number; period: string | null; tur: string }
interface Payload { ok: boolean; count: number; fundsCovered: number | null; indexUpdatedAt: string | null; holders: Holder[] }

function periodLabel(p: string | null): string {
  if (!p) return '';
  const w = /^(\d{4})-W?(\d{2})$/.exec(p);
  if (!w) return p;
  const n = Number(w[2]);
  if (n > 12) return `${n}. hafta ${w[1]}`;
  const ay = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][n - 1];
  return `${ay} ${w[1]}`;
}

export function FundHoldersCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    setState('loading'); setData(null); setShowAll(false);
    (async () => {
      try {
        const r = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/funds`, { headers: { Accept: 'application/json' } });
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) { if (alive) setState('error'); return; }
        const j = (await r.json()) as Payload;
        if (!alive) return;
        if (j.ok) { setData(j); setState('ok'); } else setState('error');
      } catch { if (alive) setState('error'); }
    })();
    return () => { alive = false; };
  }, [symbol]);

  if (state === 'error') return null; // kaynak yoksa sessiz
  const holders = data?.holders ?? [];
  const list = showAll ? holders : holders.slice(0, 8);
  const maxPct = holders[0]?.pct ?? 1;

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Layers size={15} className="text-accent" /> Bu hisseyi tutan fonlar
          {data && <span className="text-[11px] font-normal text-fg-3">{data.count} fon</span>}
        </h3>
        {data?.fundsCovered != null && (
          <span className="text-[10px] text-fg-3">KAP raporu işlenen {data.fundsCovered} fon içinde</span>
        )}
      </div>
      {state === 'loading' && <div className="h-24 skeleton rounded" />}
      {state === 'ok' && holders.length === 0 && (
        <p className="py-3 text-[12px] text-fg-3">İşlenen KAP raporlarında bu hisseyi tutan fon bulunmadı (kapsam dışı fonlar olabilir).</p>
      )}
      {state === 'ok' && holders.length > 0 && (
        <>
          <ul className="divide-y divide-border/60">
            {list.map((h) => (
              <li key={h.code} className="flex items-center gap-3 py-2">
                <Link to={`/fund/${h.code}`} className="w-12 shrink-0 font-mono text-[13px] font-bold text-fg hover:text-accent">{h.code}</Link>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-fg-2" title={h.name}>{h.name}</div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-bg-soft">
                    <div className="h-full rounded bg-accent/70" style={{ width: `${Math.max(2, (h.pct / maxPct) * 100)}%` }} />
                  </div>
                </div>
                <div className="w-16 shrink-0 text-right">
                  <div className="font-mono text-[13px] font-semibold text-fg">%{h.pct.toFixed(2).replace('.', ',')}</div>
                  <div className="text-[10px] text-fg-3">{periodLabel(h.period)}</div>
                </div>
              </li>
            ))}
          </ul>
          {holders.length > 8 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-[12px] font-medium text-accent hover:underline">
              {showAll ? 'Daha az göster' : `Tümünü göster (${holders.length})`}
            </button>
          )}
          <p className="mt-3 text-[10px] leading-relaxed text-fg-3">
            Ağırlık = fonun toplam değerine göre %, KAP aylık/haftalık Portföy Dağılım Raporu (dönem satırda). Yalnız raporu işlenen fonlar listelenir; yatırım tavsiyesi değildir.
          </p>
        </>
      )}
    </div>
  );
}
