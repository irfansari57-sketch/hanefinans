/**
 * PanelStyleChart — Panel Hero'da kullanilan MiniAreaChart stilinin
 * bagimsiz versiyonu. Hisse/emtia/kripto detay sayfalarinda ayni
 * emerald area chart + Y/X-axis labellari + period switcher.
 *
 * Kaynak: fetchHistoricalYahoo (birincil) + fetchIsYatirimChart (BIST fallback).
 * TradingView lightweight-charts yerine hafif kendi SVG'imiz — sayfa daha kompakt,
 * ana sayfayla tutarli gorsel.
 */

import { useEffect, useMemo, useState, useRef } from 'react';
import { fetchHistoricalYahoo } from '@/data/api/yahoo';
import { cn } from '@/lib/utils';
import type { ChartEvent } from '@/lib/chartEvents';

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
  /** Fiyat donusumu (emtia gram cevirme vs.) */
  priceTransform?: (p: number) => number;
  /** Grafik üzerinde numaralı olay işaretleri (KAP, temettü, kritik…) */
  events?: ChartEvent[];
  /** 'line' = dolgusuz çizgi (Design 03) */
  variant?: 'area' | 'line';
  /** Günlük değişim işareti — verilirse çizgi rengi buna göre (dönem işaretine değil) */
  dailyPositive?: boolean;
}

export function PanelStyleChart({
  symbol,
  isBist = true,
  defaultPeriod = '1Y',
  formatValue,
  hideHeader = false,
  priceTransform,
  events,
  variant = 'line',
  dailyPositive,
}: Props) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  // ONEMLI: rawSeries HER ZAMAN ham fiyat (ONS USD gibi). priceTransform
  // ayri bir useMemo'da uygulanir — boylece unit değiştiğinde (Ons/Gram)
  // chart ANINDA yeni değerle re-render olur, tekrar fetch gerekmez.
  // Eskiden transform fetch icinde uygulanıyor ve useEffect deps'e dahil
  // olmadığı için Gram'a geçince grafik Ons değerinde kalıyordu.
  const [rawSeries, setRawSeries] = useState<Array<{ date: number; close: number }>>([]);
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
          if (alive) setRawSeries(pairs);
          return;
        }
        // 2) BIST icin Is Yatirim fallback
        if (isBist) {
          const cleanSym = symbol.replace(/\.IS$/i, '');
          const raw = await fetchIsYatirimChart(cleanSym, PERIOD_IS[period]);
          if (raw && raw.length >= 2 && alive) {
            setRawSeries(raw);
            return;
          }
        }
        if (alive) setRawSeries([]);
      } catch {
        if (alive) setRawSeries([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [symbol, period, isBist]);

  // Transform her render'da uygulanır — priceTransform değişince (örn: Ons → Gram
  // TL toggle) chart ANINDA yeni değerle görünür.
  const series = useMemo(() => {
    if (!priceTransform) return rawSeries;
    return rawSeries.map((p) => ({ date: p.date, close: priceTransform(p.close) }));
  }, [rawSeries, priceTransform]);

  const changePct = useMemo(() => {
    if (series.length < 2) return 0;
    const first = series[0].close;
    const last = series[series.length - 1].close;
    return first > 0 ? ((last - first) / first) * 100 : 0;
  }, [series]);
  const positive = changePct >= 0;
  // Çizgi rengi: günlük işaret verilmişse o, yoksa dönem işareti
  const lineTone = dailyPositive ?? positive;

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
        <MiniAreaChart data={series} positive={lineTone} formatValue={formatValue} events={events} variant={variant} />
      ) : (
        <div className="grid h-40 place-items-center text-xs text-slate-500">Grafik verisi yok</div>
      )}
    </div>
  );
}

// Panel Hero + StockDetail + FundDetail'in tumu ayni gorsel — emerald/red area chart,
// Y-axis 3 seviye (min/mid/max), X-axis 5 tarih tick, HOVER TOOLTIP (FVT tarzi).
// Export edildi - StockDetail chart fetch ederken, FundDetail anchor points ile
// direkt cizim yapabilir.
export function MiniAreaChart({ data, positive, formatValue, variant = 'area', events }: {
  data: Array<{ date: number; close: number }>;
  positive: boolean;
  formatValue?: (v: number) => string;
  /** 'line' = Design 03: dolgu yok, nötr teal çizgi (yön rengi yalnız % rozetinde) */
  variant?: 'area' | 'line';
  /** Numaralı olay işaretleri — tarihe en yakın (≤) bara oturur */
  events?: ChartEvent[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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
  // 15 Eki 2026 (kullanıcı kararı): çizgi rengi GÜNLÜK değişimin işareti — artı yeşil, eksi kırmızı; dolgu yok.
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
  const fmtDateLong = (ms: number) => {
    const d = new Date(ms);
    return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  // Hover — SVG koordinatlarindan en yakin data index'i bul
  const moveToClientX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xInSvg = ((clientX - rect.left) / rect.width) * W;
    const rawIdx = Math.round(xInSvg / xStep);
    const idx = Math.max(0, Math.min(data.length - 1, rawIdx));
    setHoverIdx(idx);
  };
  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => moveToClientX(e.clientX);
  // Mobil (Design 03 Faz 3): parmakla sürükleme — dikey kaydırmayı bozmamak için
  // yalnız yatay hareket yakalanır (touch-action: pan-y).
  const handleTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    const t = e.touches[0];
    if (t) moveToClientX(t.clientX);
  };
  const handleLeave = () => setHoverIdx(null);

  const hover = hoverIdx != null ? { p: points[hoverIdx], d: data[hoverIdx] } : null;
  // Tooltip pozisyonu — kenardan taşmayı önle
  const tooltipW = 100;
  const tooltipH = 42;
  const tooltipX = hover
    ? Math.min(Math.max(hover.p.x - tooltipW / 2, 0), chartW - tooltipW)
    : 0;
  const tooltipY = hover
    ? Math.max(hover.p.y - tooltipH - 8, 4)
    : 0;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-52 w-full sm:h-64 cursor-crosshair [touch-action:pan-y]"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onTouchStart={handleTouch}
      onTouchMove={handleTouch}
      onTouchEnd={handleLeave}
    >
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
      {variant === 'area' && <path d={area} fill={`url(#${fillId})`} />}
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
      {/* Olay işaretleri — numaralı daire, bar noktasının üstünde */}
      {events && events.length > 0 && (() => {
        const placed: Array<{ x: number; y: number; n: number; label: string; title: string }> = [];
        for (const ev of events) {
          let idx = -1;
          for (let i = data.length - 1; i >= 0; i--) { if (data[i].date <= ev.date + 12 * 3_600_000) { idx = i; break; } }
          if (idx < 0) continue;
          const p = points[idx];
          // Aynı noktada üst üste binmesin: önceki işaretle 14px'ten yakınsa yukarı kaydır
          let y = Math.max(PAD_TOP + 10, p.y - 16);
          for (const q of placed) if (Math.abs(q.x - p.x) < 14 && Math.abs(q.y - y) < 16) y = q.y - 16;
          placed.push({ x: p.x, y, n: ev.n, label: ev.label, title: ev.title });
        }
        return placed.map((m) => (
          <g key={`ev-${m.n}`} transform={`translate(${m.x.toFixed(1)}, ${m.y.toFixed(1)})`} style={{ pointerEvents: 'none' }}>
            <title>{`${m.n}. ${m.label} — ${m.title}`}</title>
            <circle r="7" fill="#151A21" stroke="#2DD4BF" strokeWidth="1.3" />
            <text y="3" textAnchor="middle" fill="#2DD4BF" fontSize="9" fontWeight="700" fontFamily="JetBrains Mono, monospace">{m.n}</text>
          </g>
        ));
      })()}
      {/* Hover crosshair + nokta + tooltip */}
      {hover && (
        <>
          <line
            x1={hover.p.x} x2={hover.p.x}
            y1={PAD_TOP} y2={bottom}
            stroke={stroke}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <circle
            cx={hover.p.x} cy={hover.p.y}
            r="4"
            fill={stroke}
            stroke="#0a0f14"
            strokeWidth="2"
          />
          <g transform={`translate(${tooltipX},${tooltipY})`}>
            <rect
              width={tooltipW}
              height={tooltipH}
              rx="4"
              fill="#0f172a"
              stroke={stroke}
              strokeOpacity="0.4"
              strokeWidth="1"
            />
            <text
              x={tooltipW / 2}
              y="16"
              fill="rgba(203,213,225,0.9)"
              fontSize="10"
              fontWeight="500"
              textAnchor="middle"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {fmtDateLong(hover.d.date)}
            </text>
            <text
              x={tooltipW / 2}
              y="32"
              fill={stroke}
              fontSize="12"
              fontWeight="700"
              textAnchor="middle"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {fmt(hover.d.close)}
            </text>
          </g>
        </>
      )}
    </svg>
  );
}
