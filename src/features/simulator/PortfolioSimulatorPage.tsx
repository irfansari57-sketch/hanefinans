/**
 * Portföy Simülatörü — geçmiş verilerle portföy backtest.
 *
 * FVT'nin "Fon Portföy Simulasyonu"na paralel + üzerinde 8 ekstra özellik:
 *  1) Multi-asset (fon + hisse aynı portföyde)
 *  2) Benchmark overlay chart (BIST 100 / USD / Altın / TÜFE)
 *  3) Reel getiri (TÜFE-adjusted)
 *  4) Risk metrikleri (Max DD, Volatilite, Sharpe)
 *  5) Stopaj + Net hesabı (ücretsiz — FVT paywall)
 *  6) Rebalans simülasyonu (Yok / Aylık / 3-Aylık)
 *  7) Preset portföyler (tek tık: Konservatif/Dengeli/Agresif/Katılım)
 *  8) Fon-bazlı katkı analizi
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calculator, Search, Trash2, TrendingUp, TrendingDown, Landmark,
  BarChart3, Wallet, Percent, Sparkles, Info, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import { fetchTefasFeed, type TefasFundData } from '@/data/api/tefasGithub';
import { fetchHistoricalYahoo } from '@/data/api/yahoo';
import { BIST_UNIQUE } from '@/data/bistAll';
import {
  simulate, PORTFOLIO_PRESETS,
  type AssetInput, type AssetType, type Rebalance, type PricePoint, type SimulationResult,
} from './simulatorEngine';
import { EquityCurveChart, type Series as ChartSeries } from './EquityCurveChart';

// ---- Benchmark katalogu ----

interface BenchmarkDef {
  id: string;
  label: string;
  yahooSymbol?: string;
  color: string;
  /** TUFE gibi statik — Yahoo yerine sabit YoY oran uygulanir */
  staticYoYPct?: number;
  description: string;
}

const BENCHMARKS: BenchmarkDef[] = [
  { id: 'BIST100', label: 'BIST 100', yahooSymbol: '^XU100', color: '#22c55e', description: 'BIST 100 endeksi' },
  { id: 'USD', label: 'USD/TRY', yahooSymbol: 'USDTRY=X', color: '#3b82f6', description: 'Dolar/TL' },
  { id: 'GOLD', label: 'Altın (Ons)', yahooSymbol: 'GC=F', color: '#eab308', description: 'Ons Altın (USD)' },
  { id: 'TUFE', label: 'TÜFE', color: '#f97316', staticYoYPct: 40, description: 'TÜİK enflasyon (yıllık ~%40 baz)' },
];

// ---- Local storage ----
const LS_KEY = 'iq.simulator.state.v1';

interface PersistedState {
  initialCapital: number;
  startDate: string;
  endDate: string;
  rebalance: Rebalance;
  assets: Array<{ code: string; name: string; type: AssetType; allocationPct: number }>;
  activeBench: string[];
}

function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch { return null; }
}

function saveState(s: PersistedState): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

// ---- Yardimci ----
function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}
function yearAgoYmd(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}
function fmtMoney(n: number, decimals = 2): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPct(n: number, decimals = 2): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}
function toneClass(n: number): string {
  return n > 0 ? 'text-success' : n < 0 ? 'text-danger' : 'text-slate-300';
}

/** Yahoo closes[] → PricePoint[] */
function yahooToPricePoints(closes: Array<{ date: number; close: number }>): PricePoint[] {
  return closes.map((c) => ({
    date: new Date(c.date).toISOString().slice(0, 10),
    price: c.close,
  }));
}

/**
 * TÜFE statik sürekli büyüme — yıllık oran ile günlük compound.
 * Genis aralikta uretilir (start'tan 2 yil once - bugun) ki engine effective range'e
 * ayarlanirsa TÜFE datası hala kesişecek.
 */
function synthesizeTufeSeries(start: string, end: string, yoyPct: number, initial = 100): PricePoint[] {
  const dailyRate = Math.pow(1 + yoyPct / 100, 1 / 365) - 1;
  // Genişlet: start'tan 2 yıl önce başla, end sonrası 1 ay ekle
  const startD = new Date(start + 'T00:00:00Z');
  startD.setFullYear(startD.getFullYear() - 2);
  const endD = new Date(end + 'T00:00:00Z');
  endD.setMonth(endD.getMonth() + 1);
  const s = startD.getTime();
  const e = Math.min(endD.getTime(), Date.now());
  const out: PricePoint[] = [];
  let val = initial;
  for (let t = s; t <= e; t += 24 * 60 * 60 * 1000) {
    out.push({ date: new Date(t).toISOString().slice(0, 10), price: val });
    val *= 1 + dailyRate;
  }
  return out;
}

/**
 * Yahoo range karar — kullanicinin BAŞLANGIÇ tarihinden bugüne kadar olan
 * süreye göre secilir. Yahoo range="Xy" son X yildan bugüne kadar döner, o yüzden
 * kullanicinin start tarihi 3 yıl önce ise 5y gerekir.
 */
function pickYahooRange(startYmd: string, _endYmd: string): '1y' | '2y' | '5y' {
  const s = new Date(startYmd + 'T00:00:00Z').getTime();
  const now = Date.now();
  const yrsBack = (now - s) / (365.25 * 24 * 60 * 60 * 1000);
  if (yrsBack <= 1) return '1y';
  if (yrsBack <= 2) return '2y';
  return '5y';
}

// ---- Component ----

export function PortfolioSimulatorPage() {
  const initial = loadState();

  const [initialCapital, setInitialCapital] = useState<number>(initial?.initialCapital ?? 1_000_000);
  const [startDate, setStartDate] = useState<string>(initial?.startDate ?? yearAgoYmd());
  const [endDate, setEndDate] = useState<string>(initial?.endDate ?? todayYmd());
  const [rebalance, setRebalance] = useState<Rebalance>(initial?.rebalance ?? 'none');
  const [assets, setAssets] = useState<Array<{ code: string; name: string; type: AssetType; allocationPct: number }>>(
    initial?.assets ?? [],
  );
  const [activeBench, setActiveBench] = useState<string[]>(initial?.activeBench ?? ['BIST100', 'TUFE']);

  // TEFAS feed — fon arama icin
  const [tefasFeed, setTefasFeed] = useState<TefasFundData[] | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    fetchTefasFeed()
      .then((f) => setTefasFeed(f?.funds ?? []))
      .catch(() => setFeedError('TEFAS feed yüklenemedi'));
  }, []);

  // State persist
  useEffect(() => {
    saveState({ initialCapital, startDate, endDate, rebalance, assets, activeBench });
  }, [initialCapital, startDate, endDate, rebalance, assets, activeBench]);

  // Search
  const [search, setSearch] = useState('');
  const searchResults = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (q.length < 1) return [];
    const results: Array<{ code: string; name: string; type: AssetType }> = [];
    // Fonlar (TEFAS feed)
    if (tefasFeed) {
      for (const f of tefasFeed) {
        if (results.length >= 8) break;
        if (f.code.toUpperCase().startsWith(q) || (f.name ?? '').toUpperCase().includes(q)) {
          results.push({ code: f.code, name: f.name, type: 'fund' });
        }
      }
    }
    // Hisseler (BIST kapsamlı listesi)
    for (const s of BIST_UNIQUE) {
      if (results.length >= 12) break;
      if (s.symbol.toUpperCase().startsWith(q) || s.name.toUpperCase().includes(q)) {
        results.push({ code: s.symbol, name: s.name, type: 'stock' });
      }
    }
    return results;
  }, [search, tefasFeed]);

  function addAsset(a: { code: string; name: string; type: AssetType }) {
    if (assets.some((x) => x.code === a.code && x.type === a.type)) {
      setSearch('');
      return;
    }
    // Yeni asset icin varsayilan agirlik: eşit dağıtım
    const remaining = 100 - assets.reduce((s, x) => s + x.allocationPct, 0);
    const suggested = remaining > 0 ? Math.min(remaining, 100 / (assets.length + 1)) : 10;
    setAssets([...assets, { ...a, allocationPct: Math.round(suggested) }]);
    setSearch('');
  }
  function removeAsset(idx: number) {
    setAssets(assets.filter((_, i) => i !== idx));
  }
  function setAssetPct(idx: number, pct: number) {
    setAssets(assets.map((a, i) => (i === idx ? { ...a, allocationPct: Math.max(0, Math.min(100, pct)) } : a)));
  }
  function normalizeWeights() {
    const total = assets.reduce((s, a) => s + a.allocationPct, 0);
    if (total === 0 || assets.length === 0) return;
    setAssets(assets.map((a) => ({ ...a, allocationPct: (a.allocationPct / total) * 100 })));
  }
  function equalizeWeights() {
    if (assets.length === 0) return;
    const each = 100 / assets.length;
    setAssets(assets.map((a) => ({ ...a, allocationPct: each })));
  }
  function loadPreset(id: string) {
    const p = PORTFOLIO_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setAssets(p.assets.map((a) => ({ ...a })));
  }

  const totalPct = assets.reduce((s, a) => s + a.allocationPct, 0);
  const spent = (totalPct / 100) * initialCapital;
  const cashLeft = initialCapital - spent;

  // Simule et
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const runToken = useRef(0);

  async function runSimulation() {
    if (assets.length === 0) {
      setRunError('En az bir varlık ekleyin.');
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setRunError('Bitiş tarihi başlangıçtan sonra olmalı.');
      return;
    }
    setRunError(null);
    setRunning(true);
    const myToken = ++runToken.current;

    try {
      const range = pickYahooRange(startDate, endDate);
      // 1) Assets history
      const assetInputs: AssetInput[] = [];
      for (const a of assets) {
        let history: PricePoint[] = [];
        if (a.type === 'fund') {
          const fund = tefasFeed?.find((f) => f.code === a.code);
          history = (fund?.history ?? []).map((h) => ({ date: h.date, price: h.price }));
        } else {
          const hs = await fetchHistoricalYahoo(a.code, range, '1d', { bistSuffix: true });
          history = hs?.closes ? yahooToPricePoints(hs.closes) : [];
        }
        assetInputs.push({ ...a, history });
      }
      // 2) Benchmarks
      const benchmarksData: Record<string, PricePoint[]> = {};
      for (const bId of activeBench) {
        const bDef = BENCHMARKS.find((b) => b.id === bId);
        if (!bDef) continue;
        if (bDef.staticYoYPct != null) {
          benchmarksData[bId] = synthesizeTufeSeries(startDate, endDate, bDef.staticYoYPct);
        } else if (bDef.yahooSymbol) {
          const hs = await fetchHistoricalYahoo(bDef.yahooSymbol, range, '1d', { bistSuffix: false });
          benchmarksData[bId] = hs?.closes ? yahooToPricePoints(hs.closes) : [];
        }
      }

      if (myToken !== runToken.current) return; // eski çağrı iptal
      const res = simulate({
        initialCapital,
        startDate, endDate,
        assets: assetInputs,
        rebalance,
        benchmarks: benchmarksData,
      });
      setResult(res);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Simülasyon hatası');
    } finally {
      if (myToken === runToken.current) setRunning(false);
    }
  }

  // Chart series (portföy + aktif benchmarks)
  const chartSeries: ChartSeries[] = useMemo(() => {
    if (!result) return [];
    const out: ChartSeries[] = [
      {
        id: 'PORTFOLIO',
        label: 'Portföyünüz',
        color: '#a78bfa',
        points: result.equityCurve,
        isPortfolio: true,
      },
    ];
    for (const b of result.benchmarks) {
      const def = BENCHMARKS.find((x) => x.id === b.id);
      if (!def) continue;
      out.push({
        id: b.id,
        label: def.label,
        color: def.color,
        points: b.equityCurve,
      });
    }
    return out;
  }, [result]);

  return (
    <>
      <PageHeader
        title="Portföy Simülatörü"
        subtitle="Geçmiş verilerle portföy backtesti — fon + hisse birlikte, benchmark karşılaştırmalı, vergi dahil"
      />

      {/* ---- Konfigürasyon paneli ---- */}
      <div className="card mb-4 p-4">
        {/* Ust satir: tutar + tarih */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <Wallet className="mr-1 inline" size={12} /> Yatırım Tutarı
            </label>
            <div className="flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-1.5 text-sm">
              <span className="text-slate-500">₺</span>
              <input
                type="number"
                min={1000}
                step={10000}
                value={initialCapital}
                onChange={(e) => setInitialCapital(Math.max(1000, Number(e.target.value) || 0))}
                className="flex-1 bg-transparent tabular-nums text-slate-100 outline-none"
              />
            </div>
            <div className="mt-1 flex gap-1">
              {[100_000, 500_000, 1_000_000, 10_000_000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setInitialCapital(v)}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px]',
                    initialCapital === v
                      ? 'bg-accent/20 text-accent'
                      : 'bg-bg-soft text-slate-400 hover:bg-bg-card',
                  )}
                >
                  {v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1_000}K`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Başlangıç Tarihi
            </label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border border-border bg-bg-soft px-2 py-1.5 text-sm text-slate-100 outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Bitiş Tarihi
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayYmd()}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border border-border bg-bg-soft px-2 py-1.5 text-sm text-slate-100 outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <RefreshCw className="mr-1 inline" size={12} /> Rebalans
            </label>
            <div className="flex gap-1">
              {(['none', 'monthly', 'quarterly'] as Rebalance[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRebalance(r)}
                  className={cn(
                    'flex-1 rounded-md border px-2 py-1.5 text-xs',
                    rebalance === r
                      ? 'border-accent/50 bg-accent/15 text-accent'
                      : 'border-border bg-bg-soft text-slate-300 hover:border-accent/30',
                  )}
                >
                  {r === 'none' ? 'Yok' : r === 'monthly' ? 'Aylık' : '3-Aylık'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preset chip'leri + benchmark chip'leri */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Sparkles className="mr-1 inline" size={12} /> Preset:
          </span>
          {PORTFOLIO_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => loadPreset(p.id)}
              className="rounded-md border border-border bg-bg-soft px-2 py-1 text-[11px] text-slate-300 hover:border-accent/30 hover:text-accent"
              title={p.description}
            >
              {p.label}
            </button>
          ))}
          <span className="mx-2 text-slate-600">·</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <BarChart3 className="mr-1 inline" size={12} /> Karşılaştır:
          </span>
          {BENCHMARKS.map((b) => {
            const on = activeBench.includes(b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBench(on ? activeBench.filter((x) => x !== b.id) : [...activeBench, b.id])}
                className={cn(
                  'flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition',
                  on
                    ? 'border-border bg-bg-card text-slate-100'
                    : 'border-border/40 bg-transparent text-slate-500',
                )}
                title={b.description}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: on ? b.color : '#666' }} />
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Varlik ekleme + tablo ---- */}
      <div className="card mb-4 p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Landmark size={14} /> Portföy Oluştur
        </h2>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-md border border-border bg-bg-soft px-3 py-2">
            <Search size={14} className="text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Fon kodu, adı veya hisse sembolü ara (AFT, THYAO, ...)"
              className="flex-1 bg-transparent text-sm text-slate-100 outline-none"
            />
            {feedError && <span className="text-[10px] text-warning">{feedError}</span>}
          </div>
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-bg-card shadow-lg">
              {searchResults.map((r) => (
                <button
                  key={`${r.type}-${r.code}`}
                  type="button"
                  onClick={() => addAsset(r)}
                  className="flex w-full items-center justify-between gap-2 border-b border-border/50 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-bg-soft"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-100">{r.code}</span>
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[9px] uppercase',
                        r.type === 'fund' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300',
                      )}>
                        {r.type === 'fund' ? 'FON' : 'HİSSE'}
                      </span>
                    </div>
                    <div className="truncate text-slate-400">{r.name}</div>
                  </div>
                  <span className="text-accent">+ Ekle</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {assets.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-[1fr_100px_140px_120px_32px] gap-2 border-b border-border bg-bg-soft/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Varlık</span>
              <span className="text-right">Ağırlık %</span>
              <span className="text-right">Tutar ₺</span>
              <span className="text-right">Tip</span>
              <span />
            </div>
            {assets.map((a, i) => (
              <div key={`${a.type}-${a.code}`} className="grid grid-cols-[1fr_100px_140px_120px_32px] items-center gap-2 border-b border-border/50 px-3 py-2 text-xs last:border-b-0">
                <div className="min-w-0">
                  <span className="font-mono font-semibold text-slate-100">{a.code}</span>
                  <div className="truncate text-[10px] text-slate-500">{a.name}</div>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={a.allocationPct}
                    onChange={(e) => setAssetPct(i, Number(e.target.value))}
                    className="w-full rounded border border-border bg-bg-soft px-1.5 py-1 text-right tabular-nums text-slate-100 outline-none"
                  />
                  <span className="text-slate-500">%</span>
                </div>
                <span className="text-right tabular-nums text-slate-300">
                  {fmtMoney((a.allocationPct / 100) * initialCapital, 0)} ₺
                </span>
                <span className="text-right">
                  <span className={cn(
                    'rounded px-1.5 py-0.5 text-[9px] uppercase',
                    a.type === 'fund' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300',
                  )}>
                    {a.type === 'fund' ? 'FON' : 'HİSSE'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAsset(i)}
                  className="text-slate-500 hover:text-danger"
                  aria-label="Sil"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-500">
              Toplam:{' '}
              <span className={cn('font-semibold tabular-nums', Math.abs(totalPct - 100) < 0.01 ? 'text-success' : 'text-warning')}>
                {totalPct.toFixed(1)}%
              </span>
            </span>
            <span className="text-slate-500">
              Harcanan:{' '}
              <span className="tabular-nums text-slate-200">{fmtMoney(spent, 0)} ₺</span>
            </span>
            <span className="text-slate-500">
              Kalan:{' '}
              <span className={cn('tabular-nums', cashLeft < 0 ? 'text-danger' : 'text-slate-200')}>
                {fmtMoney(cashLeft, 0)} ₺
              </span>
            </span>
          </div>
          <div className="flex gap-2">
            {assets.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={equalizeWeights}
                  className="rounded-md border border-border bg-bg-soft px-2 py-1 text-[11px] text-slate-300 hover:border-accent/30"
                >
                  Eşit Dağıt
                </button>
                <button
                  type="button"
                  onClick={normalizeWeights}
                  className="rounded-md border border-border bg-bg-soft px-2 py-1 text-[11px] text-slate-300 hover:border-accent/30"
                  title="Toplam 100 olacak şekilde normalize et"
                >
                  %100'e Getir
                </button>
                <button
                  type="button"
                  onClick={() => setAssets([])}
                  className="rounded-md border border-border bg-bg-soft px-2 py-1 text-[11px] text-slate-400 hover:text-danger"
                >
                  Sıfırla
                </button>
              </>
            )}
            <button
              type="button"
              onClick={runSimulation}
              disabled={running || assets.length === 0}
              className="btn-primary disabled:opacity-40"
            >
              <Calculator size={14} />
              {running ? 'Hesaplanıyor…' : 'Simüle Et'}
            </button>
          </div>
        </div>
        {runError && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger">
            <AlertTriangle size={12} /> {runError}
          </div>
        )}
      </div>

      {/* ---- Sonuç panelleri ---- */}
      {result && (
        <>
          {/* Metrik kartlari */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Final Değer"
              value={`${fmtMoney(result.finalValue, 0)} ₺`}
              sub={`Başlangıç: ${fmtMoney(result.initialCapital, 0)} ₺`}
              accent="neutral"
            />
            <MetricCard
              label="Toplam Getiri"
              value={fmtPct(result.totalReturnPct)}
              sub={result.totalReturnPct >= 0
                ? `Kar: ${fmtMoney(result.finalValue - result.initialCapital, 0)} ₺`
                : `Zarar: ${fmtMoney(result.initialCapital - result.finalValue, 0)} ₺`}
              accent={result.totalReturnPct >= 0 ? 'up' : 'down'}
            />
            <MetricCard
              label="Yıllık (CAGR)"
              value={fmtPct(result.cagr)}
              sub="Bileşik yıllık getiri"
              accent={result.cagr >= 0 ? 'up' : 'down'}
            />
            <MetricCard
              label="Reel Getiri"
              value={result.realReturnPct != null ? fmtPct(result.realReturnPct) : '—'}
              sub="Enflasyondan arındırılmış"
              accent={result.realReturnPct == null ? 'neutral' : result.realReturnPct >= 0 ? 'up' : 'down'}
              hint={result.realReturnPct == null ? 'TÜFE benchmarkı seçin' : undefined}
            />
            <MetricCard
              label="Max Drawdown"
              value={`-${result.maxDrawdownPct.toFixed(2)}%`}
              sub="En büyük tepe→dip düşüş"
              accent="down"
            />
            <MetricCard
              label="Volatilite (Yıllık)"
              value={`${result.volatilityAnnualPct.toFixed(1)}%`}
              sub="Fiyat dalgalanma ölçüsü"
              accent="neutral"
            />
            <MetricCard
              label="Sharpe Oranı"
              value={result.sharpe.toFixed(2)}
              sub={result.sharpe > 1 ? 'İyi risk-ödül' : result.sharpe > 0 ? 'Orta' : 'Zayıf'}
              accent={result.sharpe > 0 ? 'up' : 'down'}
            />
            <MetricCard
              label="Net Kar (Stopaj sonrası)"
              value={`${fmtMoney(result.taxes.netFinalValue, 0)} ₺`}
              sub={`Stopaj: -${fmtMoney(result.taxes.stopajAmount, 0)} ₺ (%${(result.taxes.effectiveRate * 100).toFixed(1)})`}
              accent="up"
            />
          </div>

          {/* Auto-adjust bilgi banneri */}
          {result.rangeAdjusted && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[11px]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              <div className="flex-1">
                <div className="font-semibold text-warning">
                  Tarih aralığı otomatik ayarlandı
                </div>
                <div className="mt-0.5 text-slate-300 leading-relaxed">
                  Talep: <span className="tabular-nums">{startDate} → {endDate}</span>
                  {' · '}
                  Uygulanan: <span className="tabular-nums font-semibold">{result.effectiveStartDate} → {result.effectiveEndDate}</span>
                  <br />
                  Bazı varlıkların history verisi kısıtlıydı — simulasyon tüm varlıkların ortak veri aralığında yapıldı.
                </div>
              </div>
            </div>
          )}

          {/* Uyarilar (rangeAdjusted disi) */}
          {result.warnings.length > 0 && !result.rangeAdjusted && (
            <div className="mb-3 rounded-lg border border-warning/30 bg-warning/5 p-2 text-[11px] text-warning">
              {result.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <Info size={10} className="mt-0.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Equity curve */}
          <div className="card mb-4 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-200">
                <BarChart3 className="mr-1 inline" size={14} />
                Equity Curve
                <span className="ml-2 text-[10px] font-normal text-slate-500">
                  {result.effectiveStartDate} → {result.effectiveEndDate}
                </span>
              </h2>
            </div>
            <EquityCurveChart
              series={chartSeries}
              initialCapital={result.initialCapital}
              height={340}
            />
          </div>

          {/* Fon katki tablosu */}
          <div className="card mb-4 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">
              <TrendingUp className="mr-1 inline" size={14} />
              Varlık Katkı Analizi
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-2 py-1.5 text-left">Varlık</th>
                    <th className="px-2 py-1.5 text-right">Ağırlık</th>
                    <th className="px-2 py-1.5 text-right">Başlangıç</th>
                    <th className="px-2 py-1.5 text-right">Bitiş</th>
                    <th className="px-2 py-1.5 text-right">Getiri %</th>
                    <th className="px-2 py-1.5 text-right">Katkı (₺)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.perAsset.map((a) => (
                    <tr key={`${a.type}-${a.code}`} className="border-b border-border/40 last:border-b-0">
                      <td className="px-2 py-2">
                        <span className="font-mono font-semibold text-slate-100">{a.code}</span>
                        <div className="truncate text-[10px] text-slate-500">{a.name}</div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-300">
                        {a.allocationPct.toFixed(1)}%
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                        {a.startPrice.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                        {a.endPrice.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                      </td>
                      <td className={cn('px-2 py-2 text-right tabular-nums font-semibold', toneClass(a.returnPct))}>
                        {fmtPct(a.returnPct)}
                      </td>
                      <td className={cn('px-2 py-2 text-right tabular-nums font-semibold', toneClass(a.contributionTL))}>
                        {a.contributionTL >= 0 ? '+' : ''}{fmtMoney(a.contributionTL, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {result.benchmarks.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border text-[10px] uppercase tracking-wider text-slate-500">
                      <td colSpan={6} className="px-2 pt-2">Karşılaştırma:</td>
                    </tr>
                    {result.benchmarks.map((b) => {
                      const def = BENCHMARKS.find((x) => x.id === b.id);
                      return (
                        <tr key={`b-${b.id}`} className="border-b border-border/20 text-xs last:border-b-0">
                          <td className="px-2 py-1.5">
                            <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: def?.color }} />
                            <span className="text-slate-300">{def?.label ?? b.id}</span>
                          </td>
                          <td colSpan={3} />
                          <td className={cn('px-2 py-1.5 text-right tabular-nums', toneClass(b.returnPct))}>
                            {fmtPct(b.returnPct)}
                          </td>
                          <td className={cn('px-2 py-1.5 text-right tabular-nums', toneClass(b.endValue - b.startValue))}>
                            {b.endValue - b.startValue >= 0 ? '+' : ''}{fmtMoney(b.endValue - b.startValue, 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Vergi detayi */}
          <div className="card mb-4 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">
              <Percent className="mr-1 inline" size={14} />
              Vergi (Stopaj) Detayı
            </h2>
            <div className="grid gap-2 text-xs sm:grid-cols-4">
              <div>
                <div className="text-[10px] uppercase text-slate-500">Brüt Kar</div>
                <div className="mt-0.5 tabular-nums text-slate-200">{fmtMoney(result.taxes.grossProfit, 0)} ₺</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Efektif Stopaj Oranı</div>
                <div className="mt-0.5 tabular-nums text-slate-200">
                  %{(result.taxes.effectiveRate * 100).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Stopaj Tutarı</div>
                <div className="mt-0.5 tabular-nums text-danger">
                  -{fmtMoney(result.taxes.stopajAmount, 0)} ₺
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Net Kar</div>
                <div className="mt-0.5 tabular-nums text-success">
                  {fmtMoney(result.taxes.netProfit, 0)} ₺
                </div>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
              Stopaj oranları: fonlar için %17.5 (2026 mevcut mevzuat), BIST hisseleri için %10. Ağırlıklı ortalama alınır.
              Menkul kıymet yatırım fonlarında stopaj kaynakta kesildiğinden ek beyan gerekmez.
              KVKK/SPK kapsamındaki muafiyetler burada modellenmez.
            </p>
          </div>

          {result.bestDay && result.worstDay && (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              <div className="card p-3 text-xs">
                <span className="text-[10px] uppercase text-slate-500">
                  <TrendingUp size={10} className="mr-1 inline text-success" /> En İyi Gün
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="tabular-nums text-slate-300">{result.bestDay.date}</span>
                  <span className={cn('tabular-nums font-semibold', toneClass(result.bestDay.pct))}>
                    {fmtPct(result.bestDay.pct)}
                  </span>
                </div>
              </div>
              <div className="card p-3 text-xs">
                <span className="text-[10px] uppercase text-slate-500">
                  <TrendingDown size={10} className="mr-1 inline text-danger" /> En Kötü Gün
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="tabular-nums text-slate-300">{result.worstDay.date}</span>
                  <span className={cn('tabular-nums font-semibold', toneClass(result.worstDay.pct))}>
                    {fmtPct(result.worstDay.pct)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <p className="text-center text-[10px] leading-relaxed text-slate-500">
            Bu simulasyon geçmiş verilere dayanır ve gelecek getiriyi garanti etmez. Bilgi amaçlıdır, yatırım tavsiyesi değildir.
            <br />
            Fon verileri TEFAS feed'inden; hisse ve benchmark verileri Yahoo Finance'ten alınır.
          </p>
        </>
      )}

      {!result && !running && assets.length === 0 && (
        <div className="card p-12 text-center">
          <Calculator className="mx-auto mb-3 text-slate-600" size={40} />
          <h3 className="text-sm font-semibold text-slate-300">Portföyünüzü kurun</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Yukarıdan bir preset seçin (Konservatif / Dengeli / Agresif / Katılım) veya kendi varlıklarınızı arayıp ekleyin.
            Ardından <strong className="text-accent">Simüle Et</strong> butonuna basın — geçmiş verilerle portföyünüzün nasıl performans göstereceğini görün.
          </p>
        </div>
      )}
    </>
  );
}

// ---- MetricCard ----

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  accent: 'up' | 'down' | 'neutral';
  hint?: string;
}

function MetricCard({ label, value, sub, accent, hint }: MetricCardProps) {
  const accentClass =
    accent === 'up' ? 'text-success' :
    accent === 'down' ? 'text-danger' :
    'text-slate-100';

  return (
    <div className="card p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        {hint && (
          <span className="text-[9px] text-slate-500" title={hint}>
            <Info size={10} />
          </span>
        )}
      </div>
      <div className={cn('mt-1 text-lg font-bold tabular-nums', accentClass)}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

