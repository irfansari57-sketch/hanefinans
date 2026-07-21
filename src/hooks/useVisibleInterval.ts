import { useEffect, useRef } from 'react';

/**
 * setInterval + visibility guard hook — tarayıcı sekmesi gizliyken polling durur,
 * görünür olduğunda tekrar başlar. CF Workers request budget'i korur.
 *
 * Kullanım:
 *   useVisibleInterval(() => refresh(), 3 * 60_000);
 *   useVisibleInterval(refresh, 2 * 60_000, { fireOnVisible: false });
 *
 * @param callback   Her tick'te çağrılacak fonksiyon (closure over state OK, ref ile sabitlenir).
 * @param delay      ms cinsinden aralık. null veya 0 verilirse interval kurulmaz.
 * @param options.fireOnVisible  Sekme visible olduğunda hemen bir kere fire et (default true).
 */
export function useVisibleInterval(
  callback: () => void,
  delay: number | null,
  options?: { fireOnVisible?: boolean },
): void {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  const fireOnVisible = options?.fireOnVisible !== false;

  useEffect(() => {
    if (!delay || delay <= 0) return;

    let timerId: number | null = null;

    const tick = () => savedCallback.current();

    const start = () => {
      if (timerId !== null) return;
      timerId = window.setInterval(tick, delay);
    };

    const stop = () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (fireOnVisible) tick();
        start();
      } else {
        stop();
      }
    };

    // İlk mount'ta visible ise başlat
    if (document.visibilityState === 'visible') {
      start();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [delay, fireOnVisible]);
}
