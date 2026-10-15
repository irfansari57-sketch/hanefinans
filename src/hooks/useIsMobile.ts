import { useEffect, useState } from 'react';

/** <768px (Tailwind md altı) — Design 03 mobil davranışları için. */
export function useIsMobile(query = '(max-width: 767px)'): boolean {
  const [m, setM] = useState<boolean>(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener('change', on);
    setM(mq.matches);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}
