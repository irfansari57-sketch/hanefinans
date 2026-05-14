import { useEffect, useRef } from 'react';

interface TradingViewChartProps {
  /** TradingView sembolü, ör. "BIST:THYAO". BIST: ön eki otomatik eklenir. */
  symbol: string;
  height?: number;
  interval?: 'D' | 'W' | 'M' | '60' | '15';
  hideTopToolbar?: boolean;
}

function normalizeSymbol(symbol: string): string {
  if (symbol.includes(':')) return symbol;
  return `BIST:${symbol.toUpperCase()}`;
}

const EMBED_SCRIPT_URL = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

/**
 * Resmi TradingView "advanced-chart" embed widget'ı. BIST sembolleri ücretsiz çalışır.
 * Her yeniden mount'ta tek seferlik <script> oluşturulur; config script'in textContent'i olur.
 */
export function TradingViewChart({
  symbol,
  height = 480,
  interval = 'D',
  hideTopToolbar = false,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // İçeriği temizle
    container.innerHTML = '';

    // Widget'ın yerleştirileceği iç div
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = '100%';
    widgetDiv.style.width = '100%';
    container.appendChild(widgetDiv);

    // Embed script — TradingView config'i bu script'in textContent'i olarak okur
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = EMBED_SCRIPT_URL;
    script.async = true;
    script.text = JSON.stringify({
      autosize: true,
      symbol: normalizeSymbol(symbol),
      interval,
      timezone: 'Europe/Istanbul',
      theme: 'dark',
      style: '1',
      locale: 'tr',
      enable_publishing: false,
      allow_symbol_change: true,
      calendar: false,
      hide_top_toolbar: hideTopToolbar,
      hide_legend: false,
      withdateranges: true,
      studies: ['Volume@tv-basicstudies'],
      support_host: 'https://www.tradingview.com',
      backgroundColor: 'rgba(15, 23, 42, 1)',
      gridColor: 'rgba(31, 42, 68, 0.5)',
    });
    container.appendChild(script);

    return () => {
      if (container) container.innerHTML = '';
    };
  }, [symbol, interval, hideTopToolbar]);

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-bg-soft"
      style={{ height }}
    >
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  );
}
