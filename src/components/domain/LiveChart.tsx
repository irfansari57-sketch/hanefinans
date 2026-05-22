import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { fetchHistoricalYahoo } from '@/data/api/yahoo';
import { cn } from '@/lib/utils';

type ChartType = 'candles' | 'line' | 'area';
type Range = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '5y';

interface LiveChartProps {
  symbol: string;
  height?: number;
  /** TradingView dış link için kullanılır */
  tradingViewSymbol?: string;
  /** BIST `.IS` suffix uygulanmasın (ABD hisseleri, kripto, emtia için false) */
  bistSuffix?: boolean;
}

const RANGES: Array<{ key: Range; label: string; interval: '5m' | '15m' | '60m' | '1d' | '1wk' }> = [
  { key: '1d',  label: '1G',  interval: '5m' },
  { key: '5d',  label: '5G',  interval: '15m' },
  { key: '1mo', label: '1A',  interval: '1d' },
  { key: '3mo', label: '3A',  interval: '1d' },
  { key: '6mo', label: '6A',  interval: '1d' },
  { key: '1y',  label: '1Y',  interval: '1d' },
  { key: '5y',  label: '5Y',  interval: '1wk' },
];

export function LiveChart({ symbol, height = 480, tradingViewSymbol, bistSuffix = true }: LiveChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Default: 1 yıllık alan grafik (kullanıcı tercihi)
  const [range, setRange] = useState<Range>('1y');
  const [chartType, setChartType] = useState<ChartType>('area');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ first?: number; last?: number; change?: number } | null>(null);

  // Chart oluştur (mount edilince)
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'rgba(15, 23, 42, 1)' },
        textColor: '#94a3b8',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(31, 42, 68, 0.5)' },
        horzLines: { color: 'rgba(31, 42, 68, 0.5)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1f2a44' },
      timeScale: {
        borderColor: '#1f2a44',
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    // Volume panel
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: 'rgba(34, 211, 238, 0.4)',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      lineSeriesRef.current = null;
      areaSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Chart type değişince series'i yeniden kur
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Mevcut ana series'i kaldır
    if (candleSeriesRef.current) { chart.removeSeries(candleSeriesRef.current); candleSeriesRef.current = null; }
    if (lineSeriesRef.current)   { chart.removeSeries(lineSeriesRef.current);   lineSeriesRef.current = null; }
    if (areaSeriesRef.current)   { chart.removeSeries(areaSeriesRef.current);   areaSeriesRef.current = null; }

    if (chartType === 'candles') {
      candleSeriesRef.current = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });
    } else if (chartType === 'line') {
      lineSeriesRef.current = chart.addLineSeries({
        color: '#22d3ee',
        lineWidth: 2,
      });
    } else {
      areaSeriesRef.current = chart.addAreaSeries({
        lineColor: '#22d3ee',
        topColor: 'rgba(34, 211, 238, 0.4)',
        bottomColor: 'rgba(34, 211, 238, 0.02)',
        lineWidth: 2,
      });
    }
  }, [chartType]);

  // Veriyi yükle
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    const rangeConfig = RANGES.find((r) => r.key === range)!;
    fetchHistoricalYahoo(symbol, rangeConfig.key, rangeConfig.interval, { bistSuffix }).then((series) => {
      if (!alive) return;
      setLoading(false);
      if (!series || series.bars.length === 0) {
        setError(`${symbol} için tarihsel veri bulunamadı.`);
        return;
      }

      const bars = series.bars;
      const firstBar = bars[0];
      const lastBar = bars[bars.length - 1];
      setStats({
        first: firstBar.close,
        last: lastBar.close,
        change: ((lastBar.close - firstBar.close) / firstBar.close) * 100,
      });

      // Ana series'i doldur
      if (chartType === 'candles' && candleSeriesRef.current) {
        candleSeriesRef.current.setData(
          bars.map((b) => ({
            time: b.time as Time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          })),
        );
      } else if (chartType === 'line' && lineSeriesRef.current) {
        lineSeriesRef.current.setData(
          bars.map((b) => ({ time: b.time as Time, value: b.close })),
        );
      } else if (chartType === 'area' && areaSeriesRef.current) {
        areaSeriesRef.current.setData(
          bars.map((b) => ({ time: b.time as Time, value: b.close })),
        );
      }

      // Volume
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(
          bars.map((b) => ({
            time: b.time as Time,
            value: b.volume,
            color: b.close >= b.open ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
          })),
        );
      }

      chartRef.current?.timeScale().fitContent();
    });

    return () => { alive = false; };
  }, [symbol, range, chartType, bistSuffix]);

  const tvHref = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tradingViewSymbol ?? `BIST:${symbol}`)}`;

  return (
    <div className="rounded-lg border border-border bg-bg-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="inline-flex rounded-md border border-border bg-bg-card p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition',
                range === r.key ? 'bg-accent/15 text-accent' : 'text-slate-400 hover:text-slate-100',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-bg-card p-0.5">
            {(['candles', 'line', 'area'] as ChartType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setChartType(t)}
                className={cn(
                  'rounded px-2.5 py-1 text-[11px] transition',
                  chartType === t ? 'bg-accent/15 text-accent' : 'text-slate-400 hover:text-slate-100',
                )}
              >
                {t === 'candles' ? 'Mum' : t === 'line' ? 'Çizgi' : 'Alan'}
              </button>
            ))}
          </div>
          {stats?.change != null && (
            <span className={cn('text-xs tabular-nums', stats.change >= 0 ? 'text-success' : 'text-danger')}>
              {stats.change >= 0 ? '+' : ''}{stats.change.toFixed(2)}%
            </span>
          )}
          <a
            href={tvHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[11px] text-slate-300 hover:text-accent"
            title="TradingView.com'da aç"
          >
            <ExternalLink size={11} /> TradingView'de aç
          </a>
        </div>
      </div>
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-soft/60">
            <RefreshCw size={20} className="animate-spin text-slate-400" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-danger">
            {error}
          </div>
        )}
        <div ref={containerRef} style={{ height, width: '100%' }} />
      </div>
    </div>
  );
}
