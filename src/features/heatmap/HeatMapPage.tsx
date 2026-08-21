import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Grid3x3, RefreshCw, ChevronRight, Lock, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { loadStocks, clearServiceCaches } from '@/data/services';
import { MOCK_STOCKS } from '@/data/mock';
import type { Stock } from '@/data/types';
import { useAuth, isPro } from '@/store/auth';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';
import { IndexHeatGrid } from '@/components/domain/IndexHeatGrid';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';

const AUTO_REFRESH_MS = 60_000;

// Module-level memo cache — sayfa değişimlerinde yeniden fetch'i önler
const HEATMAP_MEMO_TTL_MS = 60_000;
interface HeatMapMemo {
  fetchedAt: number;
  stocks: Stock[];
  updatedAt: number;
}
let heatMapMemo: HeatMapMemo | null = null;

export function HeatMapPage() {
  const user = useAuth((s) => s.user);
  const proUser = isPro(user);

  const [stocks, setStocks] = useState<Stock[]>(() => heatMapMemo?.stocks ?? MOCK_STOCKS);
  const [loading, setLoading] = useState(() => !heatMapMemo);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(() => heatMapMemo?.updatedAt);
  const [sortBy, setSortBy] = useState<'change' | 'size' | 'alpha'>('change');

  const allSymbols = useMemo(() => MOCK_STOCKS.map((s) => s.symbol), []);

  const refresh = async (force = false) => {
    if (force) clearServiceCaches();
    setLoading(true);
    try {
      const r = await loadStocks(allSymbols);
      setStocks(r.data);
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  // Memo cache sync
  useEffect(() => {
    if (stocks.length > 0 && stocks !== MOCK_STOCKS && updatedAt) {
      heatMapMemo = {
        fetchedAt: Date.now(),
        stocks,
        updatedAt,
      };
    }
  }, [stocks, updatedAt]);

  useEffect(() => {
    if (!proUser) return;
    const memoAge = heatMapMemo ? Date.now() - heatMapMemo.fetchedAt : Infinity;
    if (memoAge >= HEATMAP_MEMO_TTL_MS) refresh(true);
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proUser]);

  // Visibility-aware polling — tab arka planda API+CPU israfını durdur
  useVisibleInterval(() => {
    if (proUser) void refresh(true);
  }, AUTO_REFRESH_MS);

  // Sektörlere göre grupla
  const sectorGroups = useMemo(() => {
    const map = new Map<string, Stock[]>();
    for (const s of stocks) {
      const sec = s.sector || 'Diğer';
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(s);
    }
    // Her sektörü sırala
    for (const [, arr] of map) {
      if (sortBy === 'change') arr.sort((a, b) => b.changePct - a.changePct);
      else if (sortBy === 'alpha') arr.sort((a, b) => a.symbol.localeCompare(b.symbol));
      else if (sortBy === 'size') arr.sort((a, b) => b.price - a.price);
    }
    return Array.from(map.entries()).sort(([a, _aArr], [b, _bArr]) => a.localeCompare(b));
  }, [stocks, sortBy]);

  // Genel piyasa istatistikleri
  const stats = useMemo(() => {
    const valid = stocks.filter((s) => Number.isFinite(s.changePct));
    const up = valid.filter((s) => s.changePct > 0).length;
    const down = valid.filter((s) => s.changePct < 0).length;
    const flat = valid.filter((s) => s.changePct === 0).length;
    const avg = valid.reduce((sum, s) => sum + s.changePct, 0) / Math.max(1, valid.length);
    return { up, down, flat, avg, total: valid.length };
  }, [stocks]);

  // PRO gating — sadece PRO/ELITE üyelere açık
  if (!proUser) {
    return (
      <>
      <SeoHead title="BIST Heat Map" description="BIST hisseleri sektör bazlı ısı haritası — günlük performansı tek bakışta gör." path="/heatmap" />

        <PageHeader
          title="Heat Map"
          subtitle="BIST tüm sektörler tek bakışta — renkli sıcaklık haritası."
        />
        <div className="glass-card relative overflow-hidden p-8 text-center">
          <div className="pointer-events-none absolute inset-0 opacity-30">
            {/* Bulanık preview */}
            <div className="grid h-full gap-1 p-4 grid-cols-6 blur-sm">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded"
                  style={{
                    background: i % 3 === 0 ? 'rgba(34,197,94,0.4)' : i % 3 === 1 ? 'rgba(239,68,68,0.4)' : 'rgba(100,116,139,0.2)',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="relative">
            <span className="inline-flex items-center justify-center rounded-full bg-warning/15 p-4 text-warning">
              <Lock size={28} />
            </span>
            <h2 className="mt-4 text-xl font-bold text-slate-100">Heat Map PRO Üyelere Özel</h2>
            <p className="mt-2 max-w-md mx-auto text-sm text-slate-400">
              BIST 50+ hisseyi sektör bazlı, canlı renkli sıcaklık haritasıyla tek bakışta gör. Piyasanın nabzını saniyeler içinde anla.
            </p>
            <Link
              to="/uyelik"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 shadow-lg shadow-accent/30"
            >
              <Sparkles size={14} /> Ücretsiz Üye Ol
            </Link>
            <p className="mt-3 text-[11px] text-slate-500">
              PRO ile ek olarak: 4H + Günlük trend analizi, AI hisse analizi, AI portföy raporu, reklamsız deneyim.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Heat Map"
        subtitle="BIST tüm sektörler tek bakışta — renkli sıcaklık haritası. Yeşil yoğun = güçlü yükseliş, kırmızı yoğun = sert düşüş."
        actions={<LiveBadge updatedAt={updatedAt} refreshing={loading} />}
      />

      {/* Piyasa genel görünüm */}
      <section className="glass-card mb-4 p-4">
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-5">
          <StatBox label="Toplam Hisse" value={stats.total.toString()} />
          <StatBox label="Yükselen" value={stats.up.toString()} tone="success" />
          <StatBox label="Düşen" value={stats.down.toString()} tone="danger" />
          <StatBox label="Yatay" value={stats.flat.toString()} tone="slate" />
          <StatBox
            label="Ortalama"
            value={`${stats.avg >= 0 ? '+' : ''}${stats.avg.toFixed(2)}%`}
            tone={stats.avg >= 0 ? 'success' : 'danger'}
          />
        </div>
      </section>

      {/* Sıralama seçenekleri */}
      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className="text-slate-400">Sıralama:</span>
        <SortBtn active={sortBy === 'change'} onClick={() => setSortBy('change')}>Değişim %</SortBtn>
        <SortBtn active={sortBy === 'size'} onClick={() => setSortBy('size')}>Fiyat</SortBtn>
        <SortBtn active={sortBy === 'alpha'} onClick={() => setSortBy('alpha')}>A-Z</SortBtn>
      </div>

      {/* Endeks Heat Map — ana + sektor endeksleri */}
      <div className="mb-6">
        <IndexHeatGrid />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-200">Sektorel Performans (Hisse bazli ortalamalar)</h2>
      {loading && stocks.length === MOCK_STOCKS.length ? (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} variant="rect" height={90} />)}
        </div>
      ) : (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {sectorGroups.map(([sector, list]) => (
            <SectorBlock key={sector} sector={sector} stocks={list} />
          ))}
        </div>
      )}
    </>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' | 'slate' }) {
  const toneClass = tone === 'success' ? 'text-success'
    : tone === 'danger' ? 'text-danger'
    : tone === 'slate' ? 'text-slate-400'
    : 'text-slate-100';
  return (
    <div className="rounded-lg border border-border bg-bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-lg font-bold tabular-nums', toneClass)}>{value}</div>
    </div>
  );
}

function SortBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-1 transition',
        active ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border bg-bg-soft text-slate-300 hover:text-slate-100',
      )}
    >
      {children}
    </button>
  );
}

function SectorBlock({ sector, stocks }: { sector: string; stocks: Stock[] }) {
  const sectorAvg = stocks.reduce((s, x) => s + (Number.isFinite(x.changePct) ? x.changePct : 0), 0) / Math.max(1, stocks.length);
  const up = stocks.filter((s) => Number.isFinite(s.changePct) && s.changePct > 0).length;
  const down = stocks.filter((s) => Number.isFinite(s.changePct) && s.changePct < 0).length;
  const best = stocks.reduce((b, x) => (x.changePct > (b?.changePct ?? -Infinity) ? x : b), stocks[0]);
  const worst = stocks.reduce((w, x) => (x.changePct < (w?.changePct ?? Infinity) ? x : w), stocks[0]);
  const intensity = Math.min(Math.abs(sectorAvg) / 3, 1);
  const bg = sectorAvg > 0
    ? `rgba(34, 197, 94, ${0.08 + intensity * 0.25})`
    : sectorAvg < 0
    ? `rgba(239, 68, 68, ${0.08 + intensity * 0.25})`
    : 'rgba(100, 116, 139, 0.1)';
  const border = sectorAvg > 0
    ? `rgba(34, 197, 94, ${0.3 + intensity * 0.3})`
    : sectorAvg < 0
    ? `rgba(239, 68, 68, ${0.3 + intensity * 0.3})`
    : 'rgba(100, 116, 139, 0.25)';
  const avgTone = sectorAvg >= 0 ? 'text-success' : 'text-danger';
  return (
    <section
      className="rounded-lg p-3 transition-all hover:scale-[1.01]"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div className="flex items-start justify-between mb-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-100">
          <Grid3x3 size={12} className="text-accent" />
          {sector}
        </h3>
        <span className="text-[10px] text-slate-400">{stocks.length} hisse</span>
      </div>
      <div className={cn('text-2xl font-bold tabular-nums mb-1', avgTone)}>
        {sectorAvg >= 0 ? '+' : ''}{sectorAvg.toFixed(2)}%
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
        <span className="text-success">{up} arti</span>
        <span className="text-danger">{down} eksi</span>
      </div>
      {best && worst && best.symbol !== worst.symbol && (
        <div className="flex items-center justify-between gap-1 text-[10px] mt-1 pt-1.5 border-t border-slate-700/40">
          <Link to={`/stock/${best.symbol}`} className="font-mono text-success hover:underline truncate">
            {best.symbol} +{best.changePct.toFixed(1)}%
          </Link>
          <Link to={`/stock/${worst.symbol}`} className="font-mono text-danger hover:underline truncate">
            {worst.symbol} {worst.changePct.toFixed(1)}%
          </Link>
        </div>
      )}
    </section>
  );
}

function HeatCell({ stock }: { stock: Stock }) {
  const change = Number.isFinite(stock.changePct) ? stock.changePct : 0;
  // Renk yoğunluğu — değişime göre
  const intensity = Math.min(Math.abs(change) / 5, 1); // %5+ tam yoğunluk
  const baseColor = change >= 0
    ? `rgba(34, 197, 94, ${0.1 + intensity * 0.4})` // yeşil
    : change < 0
    ? `rgba(239, 68, 68, ${0.1 + intensity * 0.4})` // kırmızı
    : 'rgba(100, 116, 139, 0.15)'; // gri
  const borderColor = change >= 0
    ? `rgba(34, 197, 94, ${0.3 + intensity * 0.3})`
    : change < 0
    ? `rgba(239, 68, 68, ${0.3 + intensity * 0.3})`
    : 'rgba(100, 116, 139, 0.3)';
  const textColor = change >= 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-slate-400';

  return (
    <Link
      to={`/stock/${stock.symbol}`}
      className="group block rounded p-2 transition-all hover:scale-105 hover:shadow-lg"
      style={{ background: baseColor, border: `1px solid ${borderColor}` }}
      title={`${stock.symbol} — ${stock.name}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold text-slate-100">{stock.symbol}</span>
        <ChevronRight size={9} className="text-slate-500 opacity-0 transition group-hover:opacity-100" />
      </div>
      <div className={cn('mt-0.5 text-sm font-bold tabular-nums', textColor)}>
        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </div>
      <div className="text-[10px] text-slate-400 tabular-nums">
        {stock.price.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}₺
      </div>
    </Link>
  );
}
