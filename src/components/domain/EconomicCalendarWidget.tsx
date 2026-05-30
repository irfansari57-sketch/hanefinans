/**
 * Ekonomik Takvim Widget — TradingView ücretsiz embed.
 *
 * Importance filter "1" (high) — sadece önemli olayları gösterir.
 * Sticky right column'da kullanılır (Layout veya Panel sağ kolonu).
 *
 * TradingView script dış kaynaktan yüklenir. iframe-content ile sandbox edilir.
 *
 * KULLANIM:
 *   <EconomicCalendarWidget compact />   // dar/sticky variant
 *   <EconomicCalendarWidget />            // full variant
 */

import { useEffect, useRef } from 'react';
import { CalendarClock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Sticky/dar kolon için kompakt. */
  compact?: boolean;
  /** Default 480 (full), compact mode 360. */
  height?: number;
  /** TradingView importance: '-1' düşük, '0' orta, '1' yüksek (default = '0,1'). */
  importance?: '-1' | '0' | '1' | '0,1' | '-1,0,1';
  /** Country code'lar: TR (default + ana AB ekonomileri + ABD). */
  countries?: string;
  className?: string;
}

export function EconomicCalendarWidget({
  compact = false,
  height,
  importance = '0,1',
  countries = 'tr,us,eu,de,gb',
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const finalHeight = height ?? (compact ? 360 : 480);

  useEffect(() => {
    if (!containerRef.current) return;
    // Önceki widget temizle
    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
    script.async = true;
    script.type = 'text/javascript';
    script.innerHTML = JSON.stringify({
      colorTheme: 'dark',
      isTransparent: true,
      width: '100%',
      height: finalHeight,
      locale: 'tr',
      importanceFilter: importance,
      countryFilter: countries,
    });
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [finalHeight, importance, countries]);

  return (
    <div className={cn('rounded-xl border border-border bg-bg-soft overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-bg-card/50">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <CalendarClock size={13} className="text-warning" />
          Ekonomik Takvim
        </div>
        <a
          href="https://tr.tradingview.com/economic-calendar/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-accent"
          title="TradingView'da aç"
        >
          Detay <ExternalLink size={8} />
        </a>
      </div>
      <div ref={containerRef} className="tradingview-widget-container" style={{ minHeight: finalHeight }} />
    </div>
  );
}
