/**
 * PanelHero — Panel sayfasi ust hero bileseni (Varyant B: Panel-Komenter).
 *
 * Yapı:
 *  1) Ust ticker seridi — pill chip'ler (BIST 100, USD, GRAM, BTC vs.)
 *  2) Buyuk hero — BIST 100 buyuk sayi + zaman sekmeleri (1H/1A/3A/YTD)
 *     + area chart (SVG, gunluk close serisi)
 *  3) Alt AI komenter — Q ikonlu, bugunun piyasa yorumu (bize ozgu ayirt edici)
 *
 * FVT tarzi kompakt, ama Q logosu emerald tonuyla + AI komenter InvestliQ imzasi.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { MacroIndicator } from '@/data/types';
import { macroKeyToRoute } from '@/lib/macroRoutes';
import { fetchHistoricalYahoo } from '@/data/api/yahoo';

type Period = '1H' | '1A' | '3A' | 'YTD';

interface Props {
  macro: MacroIndicator[];
  /** Ana grafik icin gosterilecek sembol (default: BIST 100). Ileride tiklanarak degistirilebilir. */
  primarySymbol?: string;
}

const TICKER_KEYS = [
  'BIST 100', 'BIST 30', 'USD/TRY', 'EUR/TRY',
  'Gram Altın', 'Ons Altın', 'BTC/USD', 'ETH/USD',
];

function formatValue(m: MacroIndicator): string {
  const key = m.key;
  if (key === 'BIST 100' || key === 'BIST 30') {
    return m.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  }
  if (key === 'USD/TRY' || key === 'EUR/TRY') return m.value.toFixed(2);
  if (key === 'Gram Altın') return m.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  if (key === 'Ons Altın') return m.value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (m.value < 10) return m.value.toFixed(2);
  if (m.value < 1000) return m.value.toFixed(0);
  // BTC vs. — kısaltma (79.4K)
  if (m.value >= 1000) return (m.value / 1000).toFixed(1) + 'K';
  return m.value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Yahoo sembol eslesmesi — ana grafik icin. */
function toYahooSymbol(key: string): string {
  if (key === 'BIST 100') return 'XU100.IS';
  if (key === 'BIST 30') return 'XU030.IS';
  if (key === 'USD/TRY') return 'USDTRY=X';
  if (key === 'EUR/TRY') return 'EURTRY=X';
  if (key === 'Gram Altın') return 'GC=F';
  if (key === 'BTC/USD') return 'BTC-USD';
  return 'XU100.IS';
}

type YahooRange = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'ytd';
const PERIOD_RANGE: Record<Period, YahooRange> = {
  '1H': '5d',
  '1A': '1mo',
  '3A': '3mo',
  YTD: 'ytd',
};

export function PanelHero({ macro, primarySymbol = 'BIST 100' }: Props) {
  const [period, setPeriod] = useState<Period>('1A');
  const [series, setSeries] = useState<number[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);

  const primary = useMemo(() => macro.find((m) => m.key === primarySymbol), [macro, primarySymbol]);

  useEffect(() => {
    let alive = true;
    setSeriesLoading(true);
    const ysym = toYahooSymbol(primarySymbol);
    fetchHistoricalYahoo(ysym, PERIOD_RANGE[period], '1d')
      .then((data) => {
        if (!alive) return;
        // fetchHistoricalYahoo dönüşü `{ closes: number[], ...} | null`.
        // closes yoksa cluster'i bos birak — mock/skeleton icin.
        const closes = (data as { closes?: number[] } | null)?.closes ?? [];
        setSeries(closes.filter((v) => Number.isFinite(v) && v > 0));
      })
      .catch(() => setSeries([]))
      .finally(() => alive && setSeriesLoading(false));
    return () => { alive = false; };
  }, [primarySymbol, period]);

  const tickers = TICKER_KEYS
    .map((k) => macro.find((m) => m.key === k))
    .filter((m): m is MacroIndicator => !!m);

  return (
    <div className="rounded-xl border border-accent/25 bg-bg-card/40 p-4">
      {/* Ust ticker chip seridi */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tickers.map((m) => (
          <TickerPill key={m.key} m={m} isPrimary={m.key === primarySymbol} />
        ))}
      </div>

      {/* Hero baslik + sayi + tab sekmeleri */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{primarySymbol}</span>
          <span className="text-3xl font-bold tabular-nums text-slate-100 sm:text-4xl">
            {primary ? formatValue(primary) : '—'}
          </span>
          {primary?.changePct != null && Number.isFinite(primary.changePct) && (
            <span className={cn(
              'text-sm font-semibold tabular-nums',
              primary.changePct >= 0 ? 'text-success' : 'text-danger',
            )}>
              {primary.changePct >= 0 ? '↗ +' : '↘ '}
              {primary.changePct.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {(['1H', '1A', '3A', 'YTD'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-semibold transition',
                period === p
                  ? 'bg-bg-soft text-slate-100'
                  : 'text-slate-400 hover:bg-bg-soft/50 hover:text-slate-200',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="mb-4">
        {seriesLoading && series.length === 0 ? (
          <div className="h-32 animate-pulse rounded bg-bg-soft/40" />
        ) : series.length >= 2 ? (
          <MiniAreaChart values={series} positive={(primary?.changePct ?? 0) >= 0} />
        ) : (
          <div className="grid h-32 place-items-center rounded bg-bg-soft/20 text-[11px] text-slate-500">
            Grafik verisi yok
          </div>
        )}
      </div>

      {/* AI Komenter satiri — bize ozgu */}
      <AiComment primary={primary} allMacro={macro} />
    </div>
  );
}

function TickerPill({ m, isPrimary }: { m: MacroIndicator; isPrimary: boolean }) {
  const route = macroKeyToRoute(m.key);
  const cp = m.changePct;
  const finite = cp != null && Number.isFinite(cp);
  const isUp = finite && (cp as number) > 0;
  const isDown = finite && (cp as number) < 0;
  const content = (
    <div className={cn(
      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] transition',
      isPrimary
        ? 'border-accent/50 bg-accent/10'
        : 'border-border bg-bg-card hover:border-accent/30',
    )}>
      {isPrimary && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      <span className="font-semibold text-slate-400">{m.label}</span>
      <span className="font-bold tabular-nums text-slate-100">{formatValue(m)}</span>
      {finite && (
        <span className={cn(
          'font-semibold tabular-nums',
          isUp && 'text-success',
          isDown && 'text-danger',
        )}>
          {isUp ? '+' : ''}{(cp as number).toFixed(2)}%
        </span>
      )}
    </div>
  );
  return route ? <Link to={route}>{content}</Link> : content;
}

/**
 * Kompakt SVG area chart — kapanis serisi. Zeros filter'a girmis fresh data.
 * View-fit: viewBox scale + preserveAspectRatio='none' — width %100 responsive.
 */
function MiniAreaChart({ values, positive }: { values: number[]; positive: boolean }) {
  const W = 620;
  const H = 120;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = W / Math.max(1, values.length - 1);
  const points = values.map((v, i) => ({
    x: i * xStep,
    y: PAD_TOP + (1 - (v - min) / range) * (H - PAD_TOP - PAD_BOTTOM),
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${H} L 0 ${H} Z`;
  const stroke = positive ? '#22c55e' : '#ef4444';
  const fillId = positive ? 'panelHeroGradPos' : 'panelHeroGradNeg';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-32 w-full">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${fillId})`} />
      <path d={line} stroke={stroke} strokeWidth="2" fill="none" />
    </svg>
  );
}

/**
 * AI Komenter — kural tabanli (LLM cagirmadan) hizli özet.
 * Piyasa hareket buyüklügü + yönü + hangi sinif liderlik ediyor.
 * Ileride /api/ai/panel-comment gibi bir endpoint'e taşınabilir.
 */
function AiComment({ primary, allMacro }: { primary: MacroIndicator | undefined; allMacro: MacroIndicator[] }) {
  const text = useMemo(() => buildComment(primary, allMacro), [primary, allMacro]);
  return (
    <div className="flex items-start gap-3 rounded-lg border-l-2 border-accent bg-gradient-to-r from-accent/10 to-transparent px-3 py-2.5">
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-300 via-emerald-500 to-emerald-700 text-[10px] font-bold text-emerald-950">
        Q
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-slate-100">Bugünün yorumu</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-slate-300">{text}</div>
      </div>
    </div>
  );
}

function buildComment(primary: MacroIndicator | undefined, all: MacroIndicator[]): string {
  const bist = primary ?? all.find((m) => m.key === 'BIST 100');
  const usd = all.find((m) => m.key === 'USD/TRY');
  const gram = all.find((m) => m.key === 'Gram Altın');
  const btc = all.find((m) => m.key === 'BTC/USD');

  const parts: string[] = [];

  if (bist?.changePct != null && Number.isFinite(bist.changePct)) {
    const p = bist.changePct;
    if (Math.abs(p) < 0.15) parts.push('BIST 100 yatay seyir gösteriyor, hacim düşük.');
    else if (p >= 1.5) parts.push(`BIST 100 %${p.toFixed(2)} güçlü yükselişte — alım baskısı belirgin.`);
    else if (p >= 0.5) parts.push(`BIST 100 %${p.toFixed(2)} pozitif ivmede.`);
    else if (p >= 0) parts.push(`BIST 100 %${p.toFixed(2)} sınırlı artışta.`);
    else if (p >= -0.5) parts.push(`BIST 100 %${Math.abs(p).toFixed(2)} hafif geri çekilme.`);
    else if (p >= -1.5) parts.push(`BIST 100 %${Math.abs(p).toFixed(2)} satış baskısında.`);
    else parts.push(`BIST 100 %${Math.abs(p).toFixed(2)} sert düşüşte — risk-off gün.`);
  }

  if (usd?.changePct != null && Number.isFinite(usd.changePct)) {
    const p = usd.changePct;
    if (p >= 0.5) parts.push(`Dolar %${p.toFixed(2)} yukarı, TL üzerinde baskı sürüyor.`);
    else if (p <= -0.5) parts.push(`Dolar %${Math.abs(p).toFixed(2)} geri çekildi, TL nefes aldı.`);
  }

  if (gram?.changePct != null && Number.isFinite(gram.changePct) && gram.changePct >= 1) {
    parts.push(`Gram altın %${gram.changePct.toFixed(2)} artışla güvenli liman talebini yansıtıyor.`);
  } else if (gram?.changePct != null && Number.isFinite(gram.changePct) && gram.changePct <= -1) {
    parts.push(`Gram altın %${Math.abs(gram.changePct).toFixed(2)} geri çekildi.`);
  }

  if (btc?.changePct != null && Number.isFinite(btc.changePct) && Math.abs(btc.changePct) >= 2) {
    const p = btc.changePct;
    parts.push(`Bitcoin ${p >= 0 ? '+' : ''}${p.toFixed(2)}% ile ${p >= 0 ? 'risk iştahı' : 'satış'} sinyali veriyor.`);
  }

  if (parts.length === 0) return 'Piyasa açılış öncesi veri henüz seyrekt. Güncel değerler oluşana kadar yorumu bekleyin.';
  return parts.slice(0, 3).join(' ');
}
