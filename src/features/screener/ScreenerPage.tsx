import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Send, AlertCircle, Info, RefreshCw, ChevronRight, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { fetchScreenerSpec, applySpec, type ScreenerSpec } from '@/data/api/screenerClient';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import type { FundPerformance, Stock } from '@/data/types';
import { MOCK_STOCKS } from '@/data/mock';
import { BIST_UNIQUE } from '@/data/bistAll';
import type { PeriodReturns } from '@/data/api/yahoo';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { SeoHead } from '@/components/seo/SeoHead';
import { track } from '@/lib/telemetry';
import { SortableHeader } from '@/components/ui/SortableHeader';

type StockSortKey = 'price' | 'r1g' | 'r1h' | 'r1a' | 'r3a' | 'r6a' | 'r1y';
type FundSortKey = 'day' | 'week' | 'month' | 'threeMonth' | 'sixMonth' | 'year';

/**
 * Doğal Dil Hisse/Fon Sorgusu — kullanıcı Türkçe doğal dilde sorgu yazar,
 * Claude Haiku sorguyu yapılandırılmış filtreye çevirir, lokal data üzerinde
 * uygulanıp sonuç tabloları sunulur.
 *
 * Örnek sorgular:
 *  - "Son 1 ayda %5+ getirili bankacılık hisseleri"
 *  - "Katılım fonlarında 1 yıl en iyi 10"
 *  - "Holding sektöründe günlük %2+ artanlar"
 *  - "Hisse Senedi fonu, 3 ayda %10'dan fazla"
 */

const EXAMPLES = [
  'Son 1 ayda %5+ getirili bankacılık hisseleri',
  'Holding sektöründe yıllık en iyi 20',
  'Katılım fonlarında 1 yıl en iyi 10',
  'Hisse senedi fonu, 3 ayda %15+ getirili',
  'Savunma sektörü, 3 ayda en yüksek 10',
];

// Filter spec'e geçmek için zenginleştirilmiş hisse satırı
interface EnrichedStock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  r1g: number;
  r1h?: number;
  r1a?: number;
  r3a?: number;
  r6a?: number;
  r1y?: number;
  [key: string]: unknown;
}

export function ScreenerPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<ScreenerSpec | null>(null);
  const [resultsStocks, setResultsStocks] = useState<EnrichedStock[]>([]);
  const [resultsFunds, setResultsFunds] = useState<FundPerformance[]>([]);
  const [datasetUsed, setDatasetUsed] = useState<'stocks' | 'funds' | null>(null);

  // Veri setleri (önceden yüklenir, sorgu hızlı çalışsın diye)
  const [allStocks, setAllStocks] = useState<EnrichedStock[]>([]);
  const [allFunds, setAllFunds] = useState<FundPerformance[]>([]);
  const [datasetsReady, setDatasetsReady] = useState({ stocks: false, funds: false });

  // Sıralama state'leri (hisse + fon ayrı)
  const [stockSortKey, setStockSortKey] = useState<StockSortKey>('r3a');
  const [stockSortDir, setStockSortDir] = useState<'asc' | 'desc'>('desc');
  const setStockSort = (k: StockSortKey) => {
    if (k === stockSortKey) setStockSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setStockSortKey(k); setStockSortDir('desc'); }
  };
  const [fundSortKey, setFundSortKey] = useState<FundSortKey>('year');
  const [fundSortDir, setFundSortDir] = useState<'asc' | 'desc'>('desc');
  const setFundSort = (k: FundSortKey) => {
    if (k === fundSortKey) setFundSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setFundSortKey(k); setFundSortDir('desc'); }
  };

  // Hisse + returns snapshot — sayfa açılır açılmaz prefetch
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/yahoo/returns-snapshot');
        if (!r.ok) throw new Error('snapshot');
        const j = await r.json() as { ok: boolean; returns?: Record<string, PeriodReturns> };
        if (!alive || !j.ok || !j.returns) return;
        const returnsMap: Record<string, PeriodReturns> = {};
        for (const [k, v] of Object.entries(j.returns)) {
          const sym = k.endsWith('.IS') ? k.slice(0, -3) : k;
          returnsMap[sym] = v;
        }
        // BIST_UNIQUE + MOCK_STOCKS birleştir
        const seen = new Set<string>();
        const enriched: EnrichedStock[] = [];
        const consume = (sym: string, name: string, sector: string, price: number, changePct: number) => {
          if (seen.has(sym)) return;
          seen.add(sym);
          const ret = returnsMap[sym] ?? {};
          enriched.push({
            symbol: sym, name, sector,
            price, changePct,
            r1g: changePct,
            r1h: ret['1h'],
            r1a: ret['1a'],
            r3a: ret['3a'],
            r6a: ret['6a'],
            r1y: ret['1y'],
          });
        };
        for (const s of MOCK_STOCKS) consume(s.symbol, s.name, s.sector ?? '', s.price, s.changePct);
        for (const s of BIST_UNIQUE) consume(s.symbol, s.name, s.sector, 0, 0);
        if (alive) {
          setAllStocks(enriched);
          setDatasetsReady((prev) => ({ ...prev, stocks: true }));
        }
      } catch { /* sessizce */ }
    })();
    return () => { alive = false; };
  }, []);

  // Fonlar — TEFAS feed
  useEffect(() => {
    let alive = true;
    loadFundsAsPerformance().then((r) => {
      if (!alive || !r) return;
      setAllFunds(r.funds);
      setDatasetsReady((prev) => ({ ...prev, funds: true }));
    });
    return () => { alive = false; };
  }, []);

  const allReady = datasetsReady.stocks && datasetsReady.funds;

  const submit = async (q?: string) => {
    const userQ = (q ?? query).trim();
    if (!userQ) return;
    setLoading(true);
    setError(null);
    setSpec(null);
    setResultsStocks([]);
    setResultsFunds([]);
    setDatasetUsed(null);
    try {
      const r = await fetchScreenerSpec(userQ);
      if (!r || !r.ok || !r.spec) {
        setError(r?.error ?? 'AI sorgu çözümlemedi.');
        track('screener.fail', { len: userQ.length, error: r?.error ?? 'unknown' });
        return;
      }
      setSpec(r.spec);
      setDatasetUsed(r.spec.dataset);
      let resultCount = 0;
      if (r.spec.dataset === 'stocks') {
        const filtered = applySpec(allStocks as unknown as Record<string, unknown>[], r.spec) as unknown as EnrichedStock[];
        setResultsStocks(filtered);
        resultCount = filtered.length;
      } else {
        const filtered = applySpec(allFunds as unknown as Record<string, unknown>[], r.spec) as unknown as FundPerformance[];
        setResultsFunds(filtered);
        resultCount = filtered.length;
      }
      track('screener.query', { len: userQ.length, dataset: r.spec.dataset, results: resultCount, filters: r.spec.filters.length });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SeoHead title="Akıllı Sorgu" description="Doğal dil ile BIST hisse ve TEFAS fon sorgulaması. AI tabanlı screener — kendi kriterlerinle hisse ve fon bul." path="/sorgu" />

      <PageHeader
        title="Akıllı Sorgu"
        subtitle="Doğal dilde yaz, AI sorguyu filtreye çevirsin, hisse ve fon ara."
      />

      <div className="mb-4 rounded-xl border border-border bg-bg-soft p-3">
        <div className="relative">
          <Sparkles size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-accent" />
          <input
            className="input pl-8 pr-24"
            placeholder='Örn: "son 1 ayda %5+ getirili bankacılık hisseleri"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={loading}
          />
          <button
            onClick={() => submit()}
            disabled={!query.trim() || loading || !allReady}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-bg-card disabled:opacity-40"
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
            Sorgula
          </button>
        </div>

        {!allReady && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-slate-500">
            <RefreshCw size={10} className="animate-spin text-accent" />
            Veri yükleniyor… ({datasetsReady.stocks ? '✓' : '·'} Hisse · {datasetsReady.funds ? '✓' : '·'} Fon)
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Örnek:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => { setQuery(ex); submit(ex); }}
              disabled={loading || !allReady}
              className="rounded-full border border-border bg-bg-card px-2 py-0.5 text-[10px] text-slate-400 transition hover:border-accent/30 hover:text-accent disabled:opacity-40"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" />
          <span className="text-slate-300">{error}</span>
        </div>
      )}

      {spec && (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs">
          <div className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0 text-accent" />
            <div className="flex-1">
              <strong className="text-accent">AI Yorumu:</strong>{' '}
              <span className="text-slate-200">{spec.explanation}</span>
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                <span className="rounded bg-bg-card px-1.5 py-0.5">Set: {spec.dataset === 'stocks' ? 'Hisse' : 'Fon'}</span>
                {spec.filters.map((f, i) => (
                  <span key={i} className="rounded bg-bg-card px-1.5 py-0.5">
                    {f.field} {f.op} {String(Array.isArray(f.value) ? f.value.join(',') : f.value)}
                  </span>
                ))}
                {spec.sort && (
                  <span className="rounded bg-bg-card px-1.5 py-0.5">
                    sırala: {spec.sort.field} {spec.sort.dir === 'asc' ? '↑' : '↓'}
                  </span>
                )}
                <span className="rounded bg-bg-card px-1.5 py-0.5">limit: {spec.limit}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hisse sonuçları */}
      {datasetUsed === 'stocks' && resultsStocks.length > 0 && (
        <>
          <StockSummary rows={resultsStocks} />
          <ScreenerStocksTable
            rows={[...resultsStocks].sort((a, b) => {
              const va = a[stockSortKey];
              const vb = b[stockSortKey];
              const an = typeof va === 'number' && Number.isFinite(va) ? va : -Infinity;
              const bn = typeof vb === 'number' && Number.isFinite(vb) ? vb : -Infinity;
              return stockSortDir === 'asc' ? an - bn : bn - an;
            })}
            sortKey={stockSortKey}
            sortDir={stockSortDir}
            setSort={setStockSort}
          />
        </>
      )}

      {/* Fon sonuçları */}
      {datasetUsed === 'funds' && resultsFunds.length > 0 && (
        <>
          <FundSummary rows={resultsFunds} />
          <ScreenerFundsTable
            rows={[...resultsFunds].sort((a, b) => {
              const va = a[fundSortKey];
              const vb = b[fundSortKey];
              const an = Number.isFinite(va) ? va : -Infinity;
              const bn = Number.isFinite(vb) ? vb : -Infinity;
              return fundSortDir === 'asc' ? an - bn : bn - an;
            })}
            sortKey={fundSortKey}
            sortDir={fundSortDir}
            setSort={setFundSort}
          />
        </>
      )}

      {datasetUsed && (datasetUsed === 'stocks' ? resultsStocks : resultsFunds).length === 0 && !loading && (
        <div className="rounded-xl border border-border bg-bg-soft p-6 text-center">
          <Sparkles size={28} className="mx-auto text-slate-600" />
          <p className="mt-2 text-sm text-slate-300">Bu kriterlere uyan sonuç yok.</p>
          <p className="mt-1 text-[11px] text-slate-500">Filtreyi gevşet veya farklı sorgu dene.</p>
        </div>
      )}

      <p className="mt-4 text-[10px] text-slate-500">
        ⚠️ Bu sayfa AI tabanlı bir araçtır; çıktıları yatırım tavsiyesi değildir. Verilerin doğruluğunu bağımsız teyit et.
      </p>
    </>
  );
}

function ScreenerStocksTable({
  rows, sortKey, sortDir, setSort,
}: {
  rows: EnrichedStock[];
  sortKey: StockSortKey;
  sortDir: 'asc' | 'desc';
  setSort: (k: StockSortKey) => void;
}) {
  if (rows.length === 0) return null;
  const sign = (v: number | undefined) => (v != null && v >= 0 ? '+' : '');
  const tone = (v: number | undefined) =>
    v == null || !Number.isFinite(v) ? 'text-slate-500' : v >= 0 ? 'text-success' : 'text-danger';
  const fmt = (v: number | undefined) => v == null || !Number.isFinite(v) ? '—' : `${sign(v)}${v.toFixed(2)}%`;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
      <table className="w-full min-w-[860px] text-xs">
        <thead className="border-b border-border bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="sticky left-0 z-20 bg-bg-soft px-2 py-2.5 text-left">#</th>
            <th className="sticky left-8 z-20 bg-bg-soft px-2 py-2.5 text-left">Sembol</th>
            <th className="px-2 py-2.5 text-left hidden md:table-cell">Şirket / Sektör</th>
            <SortableHeader label="Fiyat" sortKey="price" activeKey={sortKey} dir={sortDir} onClick={setSort} />
            <SortableHeader label="Gün %" sortKey="r1g" activeKey={sortKey} dir={sortDir} onClick={setSort} />
            <SortableHeader label="1 Hafta %" sortKey="r1h" activeKey={sortKey} dir={sortDir} onClick={setSort} className="hidden lg:table-cell" />
            <SortableHeader label="1 Ay %" sortKey="r1a" activeKey={sortKey} dir={sortDir} onClick={setSort} />
            <SortableHeader label="3 Ay %" sortKey="r3a" activeKey={sortKey} dir={sortDir} onClick={setSort} />
            <SortableHeader label="6 Ay %" sortKey="r6a" activeKey={sortKey} dir={sortDir} onClick={setSort} className="hidden lg:table-cell" />
            <SortableHeader label="1 Yıl %" sortKey="r1y" activeKey={sortKey} dir={sortDir} onClick={setSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.symbol} className="group border-b border-border/60 transition hover:bg-bg-card">
              <td className="sticky left-0 z-10 bg-bg-soft px-2 py-2 text-left text-[11px] text-slate-500 tabular-nums">{i + 1}</td>
              <td className="sticky left-8 z-10 bg-bg-soft px-2 py-2 text-left">
                <Link to={`/stock/${s.symbol}`} className="font-mono text-[13px] font-semibold text-accent hover:underline inline-flex items-center gap-1">
                  {s.symbol}
                  <ChevronRight size={10} className="opacity-0 transition group-hover:opacity-100" />
                </Link>
              </td>
              <td className="px-2 py-2 text-left hidden md:table-cell">
                <div className="truncate max-w-[200px] text-slate-200">{s.name}</div>
                {s.sector && <div className="mt-0.5 text-[9px] text-slate-500">{s.sector}</div>}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-100">{s.price > 0 ? formatMoney(s.price) : '—'}</td>
              <td className={cn('px-2 py-2 text-right tabular-nums font-medium', tone(s.r1g))}>{fmt(s.r1g)}</td>
              <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', tone(s.r1h))}>{fmt(s.r1h)}</td>
              <td className={cn('px-2 py-2 text-right tabular-nums', tone(s.r1a))}>{fmt(s.r1a)}</td>
              <td className={cn('px-2 py-2 text-right tabular-nums', tone(s.r3a))}>{fmt(s.r3a)}</td>
              <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', tone(s.r6a))}>{fmt(s.r6a)}</td>
              <td className={cn('px-2 py-2 text-right tabular-nums font-semibold', tone(s.r1y))}>{fmt(s.r1y)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScreenerFundsTable({
  rows, sortKey, sortDir, setSort,
}: {
  rows: FundPerformance[];
  sortKey: FundSortKey;
  sortDir: 'asc' | 'desc';
  setSort: (k: FundSortKey) => void;
}) {
  if (rows.length === 0) return null;
  const sign = (v: number) => (v >= 0 ? '+' : '');
  const tone = (v: number | undefined) =>
    v == null || !Number.isFinite(v) ? 'text-slate-500' : v >= 0 ? 'text-success' : 'text-danger';
  const fmt = (v: number | undefined) => v == null || !Number.isFinite(v) ? '—' : `${sign(v)}${v.toFixed(2)}%`;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
      <table className="w-full min-w-[860px] text-xs">
        <thead className="border-b border-border bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="sticky left-0 z-20 bg-bg-soft px-2 py-2.5 text-left">#</th>
            <th className="sticky left-8 z-20 bg-bg-soft px-2 py-2.5 text-left">Kod</th>
            <th className="px-2 py-2.5 text-left hidden md:table-cell">Ad / Kategori</th>
            <SortableHeader label="Gün %" sortKey="day" activeKey={sortKey} dir={sortDir} onClick={setSort} />
            <SortableHeader label="1 Hafta %" sortKey="week" activeKey={sortKey} dir={sortDir} onClick={setSort} className="hidden lg:table-cell" />
            <SortableHeader label="1 Ay %" sortKey="month" activeKey={sortKey} dir={sortDir} onClick={setSort} />
            <SortableHeader label="3 Ay %" sortKey="threeMonth" activeKey={sortKey} dir={sortDir} onClick={setSort} />
            <SortableHeader label="6 Ay %" sortKey="sixMonth" activeKey={sortKey} dir={sortDir} onClick={setSort} className="hidden lg:table-cell" />
            <SortableHeader label="1 Yıl %" sortKey="year" activeKey={sortKey} dir={sortDir} onClick={setSort} />
            <th className="px-2 py-2.5 text-center w-24">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f, i) => (
            <tr key={f.code} className="group border-b border-border/60 transition hover:bg-bg-card">
              <td className="sticky left-0 z-10 bg-bg-soft px-2 py-2 text-left text-[11px] text-slate-500 tabular-nums">{i + 1}</td>
              <td className="sticky left-8 z-10 bg-bg-soft px-2 py-2 text-left">
                <Link to={`/fund/${f.code}`} className="font-mono text-[13px] font-semibold text-accent hover:underline">{f.code}</Link>
              </td>
              <td className="px-2 py-2 text-left hidden md:table-cell">
                {f.name && <div className="truncate max-w-[260px] text-slate-200">{f.name}</div>}
                <span className="mt-0.5 inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">{f.category}</span>
              </td>
              <td className={cn('px-2 py-2 text-right tabular-nums', tone(f.day))}>{fmt(f.day)}</td>
              <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', tone(f.week))}>{fmt(f.week)}</td>
              <td className={cn('px-2 py-2 text-right tabular-nums', tone(f.month))}>{fmt(f.month)}</td>
              <td className={cn('px-2 py-2 text-right tabular-nums', tone(f.threeMonth))}>{fmt(f.threeMonth)}</td>
              <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', tone(f.sixMonth))}>{fmt(f.sixMonth)}</td>
              <td className={cn('px-2 py-2 text-right tabular-nums font-semibold', tone(f.year))}>{fmt(f.year)}</td>
              <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                <a
                  href={`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(f.code)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success hover:bg-success/20"
                  title="TEFAS'ta aç"
                >
                  TEFAS <ExternalLink size={8} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Özet performans kartları — Strong Buy / Fund Pool ile aynı pattern ---

function fmtAvg(v: number, count: number): string {
  if (count === 0) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}
function fmtRatio(s: { positives: number; negatives: number; count: number }): string {
  if (s.count === 0) return '—';
  return `${s.positives} ▲ / ${s.negatives} ▼`;
}

function SummaryCard({ label, mainValue, sub, tone }: {
  label: string; mainValue: string; sub: string; tone: 'pos' | 'neg' | 'neutral';
}) {
  const toneClass = tone === 'pos' ? 'text-success' : tone === 'neg' ? 'text-danger' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-border bg-bg-soft p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-base font-bold tabular-nums', toneClass)}>{mainValue}</div>
      <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}

function StockSummary({ rows }: { rows: EnrichedStock[] }) {
  const calc = (key: 'r1g' | 'r1a' | 'r3a' | 'r1y') => {
    let sum = 0, count = 0, positives = 0, negatives = 0;
    for (const r of rows) {
      const v = r[key];
      if (v == null || !Number.isFinite(v)) continue;
      sum += v as number; count += 1;
      if ((v as number) > 0) positives += 1;
      else if ((v as number) < 0) negatives += 1;
    }
    return { avg: count > 0 ? sum / count : 0, count, positives, negatives };
  };
  const day = calc('r1g');
  const r1a = calc('r1a');
  const r3a = calc('r3a');
  const r1y = calc('r1y');
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      <SummaryCard label="Havuzdaki Hisse" mainValue={`${rows.length}`} sub="Sorgu sonucu" tone="neutral" />
      <SummaryCard label="Ortalama Gün %" mainValue={fmtAvg(day.avg, day.count)} sub={fmtRatio(day)} tone={day.avg >= 0 ? 'pos' : 'neg'} />
      <SummaryCard label="Ortalama 1 Ay %" mainValue={fmtAvg(r1a.avg, r1a.count)} sub={fmtRatio(r1a)} tone={r1a.avg >= 0 ? 'pos' : 'neg'} />
      <SummaryCard label="Ortalama 3 Ay %" mainValue={fmtAvg(r3a.avg, r3a.count)} sub={fmtRatio(r3a)} tone={r3a.avg >= 0 ? 'pos' : 'neg'} />
      <SummaryCard label="Ortalama 1 Yıl %" mainValue={fmtAvg(r1y.avg, r1y.count)} sub={fmtRatio(r1y)} tone={r1y.avg >= 0 ? 'pos' : 'neg'} />
    </div>
  );
}

function FundSummary({ rows }: { rows: FundPerformance[] }) {
  const calc = (key: 'day' | 'week' | 'month' | 'year') => {
    let sum = 0, count = 0, positives = 0, negatives = 0;
    for (const r of rows) {
      const v = r[key];
      if (!Number.isFinite(v)) continue;
      sum += v as number; count += 1;
      if ((v as number) > 0) positives += 1;
      else if ((v as number) < 0) negatives += 1;
    }
    return { avg: count > 0 ? sum / count : 0, count, positives, negatives };
  };
  const day = calc('day');
  const week = calc('week');
  const month = calc('month');
  const year = calc('year');
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      <SummaryCard label="Havuzdaki Fon" mainValue={`${rows.length}`} sub="Sorgu sonucu" tone="neutral" />
      <SummaryCard label="Ortalama Gün %" mainValue={fmtAvg(day.avg, day.count)} sub={fmtRatio(day)} tone={day.avg >= 0 ? 'pos' : 'neg'} />
      <SummaryCard label="Ortalama 1 Hafta %" mainValue={fmtAvg(week.avg, week.count)} sub={fmtRatio(week)} tone={week.avg >= 0 ? 'pos' : 'neg'} />
      <SummaryCard label="Ortalama 1 Ay %" mainValue={fmtAvg(month.avg, month.count)} sub={fmtRatio(month)} tone={month.avg >= 0 ? 'pos' : 'neg'} />
      <SummaryCard label="Ortalama 1 Yıl %" mainValue={fmtAvg(year.avg, year.count)} sub={fmtRatio(year)} tone={year.avg >= 0 ? 'pos' : 'neg'} />
    </div>
  );
}
