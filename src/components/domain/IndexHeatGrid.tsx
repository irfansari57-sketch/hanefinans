/**
 * BIST Endeks Heat Map — ana BIST endeksleri ve sektor endeksleri
 * tek bir grid'de gunluk degisim renk yogunlugu ile.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { fetchIndexYahoo } from '@/data/api/yahoo';
import { cn } from '@/lib/utils';

interface IndexDef {
  symbol: string;     // Yahoo symbol (XU100.IS, XBANK.IS, vb)
  short: string;      // Kart kisa adi
  name: string;       // Tooltip / full ad
  group: 'ana' | 'sektor';
}

const BIST_INDICES: IndexDef[] = [
  // Ana endeksler
  { symbol: 'XU100.IS', short: 'BIST 100', name: 'BIST 100 — ana endeks', group: 'ana' },
  { symbol: 'XU030.IS', short: 'BIST 30',  name: 'BIST 30 — en likit 30 hisse', group: 'ana' },
  { symbol: 'XU050.IS', short: 'BIST 50',  name: 'BIST 50', group: 'ana' },
  { symbol: 'XU100D.IS', short: 'BIST 100-30', name: 'BIST 100-30 (30 disindaki 70 hisse)', group: 'ana' },
  // Sektor endeksleri
  { symbol: 'XBANK.IS', short: 'XBANK',  name: 'Bankacilik', group: 'sektor' },
  { symbol: 'XHOLD.IS', short: 'XHOLD',  name: 'Holding ve Yatirim', group: 'sektor' },
  { symbol: 'XSANI.IS', short: 'XSANI',  name: 'Sanayi', group: 'sektor' },
  { symbol: 'XGIDA.IS', short: 'XGIDA',  name: 'Gida, Icecek', group: 'sektor' },
  { symbol: 'XTRZM.IS', short: 'XTRZM',  name: 'Turizm', group: 'sektor' },
  { symbol: 'XELKT.IS', short: 'XELKT',  name: 'Elektrik', group: 'sektor' },
  { symbol: 'XILTM.IS', short: 'XILTM',  name: 'Iletisim', group: 'sektor' },
  { symbol: 'XMANA.IS', short: 'XMANA',  name: 'Madencilik', group: 'sektor' },
  { symbol: 'XKMYA.IS', short: 'XKMYA',  name: 'Kimya, Petrol, Plastik', group: 'sektor' },
  { symbol: 'XMESY.IS', short: 'XMESY',  name: 'Metal Esya, Makina', group: 'sektor' },
  { symbol: 'XHIZM.IS', short: 'XHIZM',  name: 'Hizmetler', group: 'sektor' },
  { symbol: 'XINSA.IS', short: 'XINSA',  name: 'Insaat', group: 'sektor' },
  { symbol: 'XSIGR.IS', short: 'XSIGR',  name: 'Sigortacilik', group: 'sektor' },
  { symbol: 'XGMYO.IS', short: 'XGMYO',  name: 'Gayrimenkul Yatirim Ortakligi', group: 'sektor' },
  { symbol: 'XUTEK.IS', short: 'XUTEK',  name: 'Teknoloji', group: 'sektor' },
  { symbol: 'XUSIN.IS', short: 'XUSIN',  name: 'Sinai (BIST Sinai)', group: 'sektor' },
  { symbol: 'XUMAL.IS', short: 'XUMAL',  name: 'Mali (BIST Mali)', group: 'sektor' },
];

interface IndexQuote {
  symbol: string;
  short: string;
  name: string;
  group: 'ana' | 'sektor';
  value: number | null;
  changePct: number | null;
}

interface Props {
  refreshMs?: number;
}

export function IndexHeatGrid({ refreshMs = 60_000 }: Props) {
  const [quotes, setQuotes] = useState<IndexQuote[]>(() =>
    BIST_INDICES.map((i) => ({ ...i, value: null, changePct: null }))
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      const results = await Promise.all(
        BIST_INDICES.map(async (i) => {
          const r = await fetchIndexYahoo(i.symbol).catch(() => null);
          return { ...i, value: r?.value ?? null, changePct: r?.changePct ?? null };
        })
      );
      if (!cancelled) {
        setQuotes(results);
        setLoading(false);
      }
    };
    fetchAll();
    const id = setInterval(fetchAll, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshMs]);

  const ana = quotes.filter((q) => q.group === 'ana');
  const sektor = quotes.filter((q) => q.group === 'sektor');

  return (
    <div className="space-y-4">
      {/* Ana endeksler — 4 buyuk kart */}
      <section className="glass-card p-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Activity size={14} className="text-accent" />
          Ana Endeksler
        </h3>
        <div className="grid gap-1.5 grid-cols-2 lg:grid-cols-4">
          {ana.map((q) => <IndexCell key={q.symbol} quote={q} large loading={loading} />)}
        </div>
      </section>

      {/* Sektor endeksleri — kompakt grid */}
      <section className="glass-card p-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Activity size={14} className="text-warning" />
          Sektor Endeksleri ({sektor.length})
        </h3>
        <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {sektor.map((q) => <IndexCell key={q.symbol} quote={q} loading={loading} />)}
        </div>
      </section>
    </div>
  );
}

function IndexCell({ quote, large, loading }: { quote: IndexQuote; large?: boolean; loading?: boolean }) {
  const change = quote.changePct;
  const value = quote.value;

  // Loading state — skeleton
  if (loading && change === null) {
    return (
      <div className={cn('rounded-md border border-border bg-bg-card/50 p-2 animate-pulse', large && 'p-3')}>
        <div className="h-3 w-16 rounded bg-slate-700/60 mb-1" />
        <div className="h-5 w-20 rounded bg-slate-700/40" />
      </div>
    );
  }

  const safeChange = Number.isFinite(change) ? (change as number) : 0;
  const intensity = Math.min(Math.abs(safeChange) / 5, 1);
  const bg = safeChange > 0
    ? `rgba(34, 197, 94, ${0.1 + intensity * 0.35})`
    : safeChange < 0
    ? `rgba(239, 68, 68, ${0.1 + intensity * 0.35})`
    : 'rgba(100, 116, 139, 0.12)';
  const border = safeChange > 0
    ? `rgba(34, 197, 94, ${0.35 + intensity * 0.3})`
    : safeChange < 0
    ? `rgba(239, 68, 68, ${0.35 + intensity * 0.3})`
    : 'rgba(100, 116, 139, 0.25)';
  const tone = safeChange > 0 ? 'text-success' : safeChange < 0 ? 'text-danger' : 'text-slate-400';

  return (
    <div
      className={cn(
        'rounded-md transition-all hover:scale-[1.02] hover:shadow-md cursor-default',
        large ? 'p-3' : 'p-2',
      )}
      style={{ background: bg, border: `1px solid ${border}` }}
      title={`${quote.short} — ${quote.name}`}
    >
      <div className={cn('font-mono font-bold text-slate-100', large ? 'text-sm' : 'text-xs')}>
        {quote.short}
      </div>
      <div className="text-[9px] text-slate-400 truncate">{quote.name}</div>
      <div className={cn('mt-0.5 font-bold tabular-nums', tone, large ? 'text-lg' : 'text-sm')}>
        {change === null ? '—' : `${safeChange >= 0 ? '+' : ''}${safeChange.toFixed(2)}%`}
      </div>
      {value !== null && (
        <div className="text-[10px] text-slate-400 tabular-nums">
          {value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
        </div>
      )}
    </div>
  );
}
