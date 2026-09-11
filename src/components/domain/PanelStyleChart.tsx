/**
 * PanelStyleChart — Panel Hero'da kullanilan MiniAreaChart stilinin
 * bagimsiz versiyonu. Hisse/emtia/kripto detay sayfalarinda ayni
 * emerald area chart + Y/X-axis labellari + period switcher.
 *
 * Kaynak: fetchHistoricalYahoo (birincil) + fetchIsYatirimChart (BIST fallback).
 * TradingView lightweight-charts yerine hafif kendi SVG'imiz — sayfa daha kompakt,
 * ana sayfayla tutarli gorsel.
 */

import { useEffect, useMemo, useState } from 'react';
import { fetchHistoricalYahoo } from '@/data/api/yahoo';
import { cn } from '@/lib/utils';

type Period = '1H' | '1A' | '3A' | 'YTD' | '1Y';

const PERIOD_RANGE: Record<Period, '5d' | '1mo' | '3mo' | 'ytd' | '1y'> = {
  '1H': '5d',
  '1A': '1mo',
  '3A': '3mo',
  YTD: 'ytd',
  '1Y': '1y',
};

const PERIOD_IS: Record<Period, '1mo' | '3mo' | '6mo' | '1y' | 'ytd'> = {
  '1H': '1mo',
  '1A': '1mo',
  '3A': '3mo',
  YTD: 'ytd',
  '1Y': '1y',
};

async function fetchIsYatirimChart(sym: string, range: string) {
  try {
    const r = await fetch(`/api/isyatirim/chart?symbol=${sym}&range=${range}`);
    if (!r.ok) return null;
    const j = await r.json() as { ok?: boolean; bars?: Array<{ date: number; close: number }> };
    if (!j.ok || !Array.isArray(j.bars) || j.bars.length === 0) return null;
    return j.bars;
  } catch { return null; }
}

interface Props {
  /** Yahoo/BIST sembolu (ornek: THYAO.IS, AAPL, BTC-USD) */
  symbol: string;
  /** BIST hissesi mi? Fallback Is Yatirim'a duser */
  isBist?: boolean;
  /** Baslangic period */
  defaultPeriod?: Period;
  /** Fiyat formatlayici (opsiyonel) */
  formatValue?: (v: number) => string;
  /** Ust baslik gizle (embedded kullanim icin) */
  hideHeader?: boolean;
}

export function PanelStyleChart({
  symbol,
  isBist = true,
  defaultPeriod = '1Y',
  formatValue,
  hideHeader = false,
}: Props) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [series, setSeries] = useState<Array<{ date: number; close: number }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        // 1) Yahoo birincil — BIST icin .IS otomatik eklenir
        const data = await fetchHistoricalYahoo(symbol, PERIOD_RANGE[period], '1d', { bistSuffix: isBist });
        const pairs = (data?.closes ?? []).filter((c) => Number.isFinite(c.close) && c.close > 0);
        if (pairs.length >= 2) {
          if (alive) setSeries(pairs);
          return;
        }
        // 2) BIST icin Is Yatirim fallback
        if (isBist) {
          const cleanSym = symbol.replace(/\.IS$/i, '');
          const bars = await fetchIsYatirimChart(cleanSym, PERIOD_IS[period]);
          if (bars && bars.length >= 2 && alive) {
            setSeries(bars);
            return;
          }
        }
        if (alive) setSeries([]);
      } catch {
        if (alive) setSeries([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [symbol, period, isBist]);

  const changePct = useMemo(() => {
    if (series.length < 2) return 0;
    const first = series[0].close;
    const last = series[series.length - 1].close;
    return first > 0 ? ((last - first) / first) * 100 : 0;
  }, [series]);
  const positive = changePct >= 0;

  return (
    <div>
      {!hideHeader && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className={cn(
              'text-xs font-semibold tabular-nums',
              positive ? 'text-success' : 'text-danger',
            )}>
              {positive ? '+' : ''}{changePct.toFixed(2)}%
            </span>
            <span className="text-[10px] text-slate-500">{period}</span>
          </div>
          <div className="flex gap-1">
            {(['1H', '1A', '3A', 'YTD', '1Y'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition',
                  period === p
                    ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                    : 'text-slate-400 hover:bg-bg-soft hover:text-slate-200',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
      {loading && series.length === 0 ? (
        <div className="grid h-40 place-items-center text-xs text-slate-500">Grafik yükleniyor…</div>
      ) : series.length >= 2 ? (
        <MiniAreaChart data={series} positive={positive} formatValue={formatValue} />
      ) : (
        <div className="grid h-40 place-items-center text-xs text-slate-500">Grafik verisi yok</div>
      )}
    </div>
  );
}

// Panel Hero'daki MiniAreaChart ile bire bir ayni — emerald/red area chart,
// Y-axis 3 seviye (min/mid/max), X-axis 5 tarih tick.
function MiniAreaChart({ data, positive, formatValue }: {
  data: Array<{ date: number; close: number }>;
  positive: boolean;
  formatValue?: (v: number) => string;
}) {
  const values = data.map((d) => d.close);
  const W = 620;
  const H = 200;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 22;
  const PAD_RIGHT = 50;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;
  const range = max - min || 1;
  const chartW = W - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const xStep = chartW / Math.max(1, values.length - 1);
  const points = values.map((v, i) => ({
    x: i * xStep,
    y: PAD_TOP + (1 - (v - min) / range) * chartH,
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const bottom = PAD_TOP + chartH;
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${bottom} L 0 ${bottom} Z`;
  const stroke = positive ? '#22c55e' : '#ef4444';
  const fillId = positive ? 'psc-grad-pos' : 'psc-grad-neg';
  const fmt = formatValue ?? ((v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }));

  const yLevels = [
    { v: max, y: PAD_TOP },
    { v: mid, y: PAD_TOP + chartH / 2 },
    { v: min, y: bottom },
  ];

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => {
    const i = Math.min(data.length - 1, Math.round(r * (data.length - 1)));
    return { i, x: i * xStep };
  });
  const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-52 w-full sm:h-64">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yLevels.map((lv) => (
        <line
          key={lv.y}
          x1="0" x2={chartW}
          y1={lv.y} y2={lv.y}
          stroke="rgba(148,163,184,0.15)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      ))}
      <path d={area} fill={`url(#${fillId})`} />
      <path d={line} stroke={stroke} strokeWidth="2" fill="none" />
      {yLevels.map((lv) => (
        <text
          key={`y-${lv.y}`}
          x={W - 4}
          y={lv.y + 3}
          fill="rgba(148,163,184,0.75)"
          fontSize="11"
          fontWeight="500"
          textAnchor="end"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {fmt(lv.v)}
        </text>
      ))}
      {xTicks.map((t) => {
        const d = data[t.i];
        if (!d) return null;
        const anchor = t.i === 0 ? 'start' : t.i === data.length - 1 ? 'end' : 'middle';
        return (
          <text
            key={`x-${t.i}`}
            x={t.x}
            y={H - 6}
            fill="rgba(148,163,184,0.75)"
            fontSize="11"
            fontWeight="500"
            textAnchor={anchor}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {fmtDate(d.date)}
          </text>
        );
      })}
    </svg>
  );
}
