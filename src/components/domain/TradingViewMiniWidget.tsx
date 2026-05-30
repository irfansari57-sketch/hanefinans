import { useEffect, useRef } from 'react';

/**
 * TradingView Mini Symbol Overview widget — ücretsiz, no-key.
 * Yahoo Finance'ta olmayan TradingView'a özgü semboller için (örn. XU030D1!
 * continuous futures, BIST vadeli kontratlar) tek yol.
 */

interface Props {
  /** TradingView formatı: "BIST:XU030D1!", "NASDAQ:AAPL", "CRYPTO:BTCUSD" vb. */
  symbol: string;
  height?: number;
  /** Chart üzerinde başlangıç aralığı */
  dateRange?: '1D' | '1M' | '3M' | '12M' | '60M' | 'ALL';
  className?: string;
}

export function TradingViewMiniWidget({
  symbol,
  height = 180,
  dateRange = '12M',
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // Mevcut script'leri temizle (sembol değiştiğinde re-render için)
    containerRef.current.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = '100%';
    widgetDiv.style.width = '100%';
    containerRef.current.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
    script.async = true;
    script.type = 'text/javascript';
    script.innerHTML = JSON.stringify({
      symbol,
      width: '100%',
      height: '100%',
      locale: 'tr',
      dateRange,
      colorTheme: 'dark',
      isTransparent: true,
      autosize: true,
      largeChartUrl: '',
      noTimeScale: false,
      chartOnly: false,
      trendLineColor: 'rgba(34, 211, 238, 1)',
      underLineColor: 'rgba(34, 211, 238, 0.15)',
      underLineBottomColor: 'rgba(34, 211, 238, 0)',
    });
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [symbol, dateRange]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height, width: '100%' }}
    />
  );
}
