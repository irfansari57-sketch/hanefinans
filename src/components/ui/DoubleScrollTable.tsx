/**
 * DoubleScrollTable — üstte ve altta 2 yatay scroll bar gösterir.
 *
 * Genis tablolar (Hisseler, Fonlar, Karsilastir) mobil/kucuk ekranda saga
 * kaydirilmali; ama scroll bar sadece altta oldugunda kullanici sayfanin
 * ustunde saga kaydiramiyor — asagi indip kaydirip yukari cikmak zorunda.
 *
 * Bu wrapper:
 *  - Ustte ince bir scroll strip (bosdur, sadece scrollbar gorunsun diye)
 *  - Icerik alt scroll container'da
 *  - Iki scroll pozisyonu iki yonlu senkron
 *
 * Kullanim: <DoubleScrollTable>...tablo veya wide grid...</DoubleScrollTable>
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  className?: string;
}

export function DoubleScrollTable({ children, className }: Props) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [innerWidth, setInnerWidth] = useState(0);
  const syncingRef = useRef(false);

  // Icerik boyutunu takip et — resize / content change'de yeniden olc
  useEffect(() => {
    if (!bottomRef.current) return;
    const el = bottomRef.current;
    const measure = () => {
      const scrollW = el.scrollWidth;
      const clientW = el.clientWidth;
      setInnerWidth(scrollW > clientW ? scrollW : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [children]);

  const onTopScroll = () => {
    if (syncingRef.current || !bottomRef.current || !topRef.current) return;
    syncingRef.current = true;
    bottomRef.current.scrollLeft = topRef.current.scrollLeft;
    requestAnimationFrame(() => { syncingRef.current = false; });
  };
  const onBottomScroll = () => {
    if (syncingRef.current || !bottomRef.current || !topRef.current) return;
    syncingRef.current = true;
    topRef.current.scrollLeft = bottomRef.current.scrollLeft;
    requestAnimationFrame(() => { syncingRef.current = false; });
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Ust scroll strip — sadece icerik tasiyorsa render et */}
      {innerWidth > 0 && (
        <div
          ref={topRef}
          onScroll={onTopScroll}
          className="overflow-x-auto overflow-y-hidden"
          style={{ height: 14 }}
          aria-hidden="true"
        >
          <div style={{ width: innerWidth, height: 1 }} />
        </div>
      )}
      <div
        ref={bottomRef}
        onScroll={onBottomScroll}
        className="overflow-x-auto"
      >
        {children}
      </div>
    </div>
  );
}
