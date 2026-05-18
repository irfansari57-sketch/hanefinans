import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { alertsRepo } from '@/data/repositories';
import { loadStocks } from '@/data/services';
import { toast } from '@/components/ui/Toast';
import { notifyPriceAlert, getTelegramChatId } from '@/lib/telegram';

/**
 * Arka planda fiyat alarmlarını izleyen görünmez bileşen.
 * Root Layout'a 1 kez mount edilir.
 *
 * Akış:
 *  - useLiveQuery ile enabled === 1 olan tüm alertları izle
 *  - Her CHECK_INTERVAL'da bu sembollerin canlı fiyatını çek (loadStocks)
 *  - Threshold geçen alarmları:
 *      1. markTriggered (DB) → enabled = 0
 *      2. toast (in-app)
 *      3. Telegram'a notifyPriceAlert (chat_id ayarlıysa)
 *      4. Browser Notification API (izin verildiyse)
 *      5. activity log: alert-triggered
 *
 * Browser arka plandayken çalışır, ama sekme tamamen kapalıyken durur
 * — gerçek "kapalı sekme push" için ayrı server-side cron daemon gerekir.
 */

const CHECK_INTERVAL_MS = 60_000; // 1 dakika
const NOTIF_PERMISSION_ASKED_KEY = 'fa.notif.permissionAsked';

export function AlertWatcher() {
  const activeAlerts = useLiveQuery(
    async () => (await alertsRepo.list()).filter((a) => a.enabled === 1),
    [],
  ) ?? [];

  const lastCheckRef = useRef<number>(0);
  const inFlightRef = useRef(false);

  // İlk kez aktif alarm görülünce notification izni iste
  useEffect(() => {
    if (activeAlerts.length === 0) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(NOTIF_PERMISSION_ASKED_KEY)) return;
    localStorage.setItem(NOTIF_PERMISSION_ASKED_KEY, '1');
    Notification.requestPermission().catch(() => { /* ignore */ });
  }, [activeAlerts.length]);

  useEffect(() => {
    if (activeAlerts.length === 0) return;

    const check = async () => {
      if (inFlightRef.current) return;
      if (Date.now() - lastCheckRef.current < CHECK_INTERVAL_MS - 1000) return;
      inFlightRef.current = true;
      lastCheckRef.current = Date.now();
      try {
        const symbols = Array.from(new Set(activeAlerts.map((a) => a.symbol)));
        const { data } = await loadStocks(symbols);
        const priceMap = new Map(data.map((s) => [s.symbol, s.price]));

        for (const alert of activeAlerts) {
          const price = priceMap.get(alert.symbol);
          if (price == null || price <= 0) continue;
          const triggered =
            alert.direction === 'above' ? price >= alert.threshold : price <= alert.threshold;
          if (!triggered) continue;

          // Eşik geçildi → tetikle
          if (alert.id != null) {
            await alertsRepo.markTriggered(alert.id);
          }

          const title = `${alert.symbol} alarm tetiklendi`;
          const body = `${alert.direction === 'above' ? '≥' : '≤'} ${alert.threshold}₺ • Mevcut: ${price.toFixed(2)}₺`;

          // 1) In-app toast
          toast.success(title, body);

          // 2) Browser Notification (izin verildiyse, sekme arka plandayken faydalı)
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              const n = new Notification(title, {
                body,
                icon: '/icon.svg',
                tag: `alert-${alert.id}`,
                requireInteraction: false,
              });
              n.onclick = () => {
                window.focus();
                window.location.href = `/stock/${alert.symbol}`;
                n.close();
              };
            } catch { /* permission revoked vs. */ }
          }

          // 3) Telegram (chat_id ayarlıysa)
          if (getTelegramChatId()) {
            notifyPriceAlert(alert.symbol, alert.direction, alert.threshold, price).catch(() => {
              /* sessiz fail — toast zaten gösterildi */
            });
          }
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    // İlk check 5sn sonra (Layout mount + diğer fetch'lerle yarışmasın)
    const t0 = setTimeout(check, 5000);
    const id = setInterval(check, CHECK_INTERVAL_MS);

    // Sekme tekrar görünür olduğunda hemen check yap (kullanıcı dönüp baktığında bilsin)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        lastCheckRef.current = 0; // force
        check();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(t0);
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeAlerts]);

  return null;
}
