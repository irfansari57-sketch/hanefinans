import { useEffect, useRef } from 'react';
import { loadNews } from '@/data/services';
import { showSwNotification } from '@/lib/pushNotifications';
import { isPushPrefEnabled } from '@/lib/notificationPrefs';

/**
 * Arka planda yüksek önemli (>=7) son dakika haberlerini izleyen bileşen.
 * Root Layout'a 1 kez mount edilir.
 *
 * Akış:
 *  - Her CHECK_INTERVAL'da loadNews ile canlı haberleri çek
 *  - Önem skoru >= MIN_IMPORTANCE + son 6 saatte yayımlanmış olanları al
 *  - Daha önce push'lanmış ID'leri localStorage'da tut → tekrar gösterme
 *  - Her bildirim için showSwNotification çağır (push pref açıksa)
 *
 * Push tercihi kapalıysa hiçbir şey yapmaz.
 */

const CHECK_INTERVAL_MS = 90_000; // 1.5 dakika
const MIN_IMPORTANCE = 7;
const MAX_AGE_HOURS = 6;
const SHOWN_IDS_KEY = 'fa.push.news.shownIds';
const SHOWN_IDS_MAX = 200; // localStorage şişmesin

function loadShownIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOWN_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveShownIds(ids: Set<string>): void {
  try {
    // Son N tanesini tut
    const arr = Array.from(ids).slice(-SHOWN_IDS_MAX);
    localStorage.setItem(SHOWN_IDS_KEY, JSON.stringify(arr));
  } catch { /* */ }
}

export function NewsWatcher() {
  const shownRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  const lastCheckRef = useRef(0);

  // Mount: localStorage'dan geçmiş ID'leri yükle
  useEffect(() => {
    shownRef.current = loadShownIds();
  }, []);

  useEffect(() => {
    const check = async () => {
      if (inFlightRef.current) return;
      if (Date.now() - lastCheckRef.current < CHECK_INTERVAL_MS - 1000) return;

      // Tercih kapalıysa hiç çek bile yapma — quota tasarruf
      if (!isPushPrefEnabled('news')) return;

      inFlightRef.current = true;
      lastCheckRef.current = Date.now();

      try {
        const r = await loadNews({ max: 20 });
        // Sadece canlı kaynaktan kabul et — mock'tan push gönderme
        if (r.source !== 'live' || r.data.length === 0) return;

        const cutoff = Date.now() - MAX_AGE_HOURS * 3_600_000;
        // Sıralanır: önem büyükten küçüğe, eş skorda en taze önce
        const candidates = r.data
          .filter((n) => n.importance >= MIN_IMPORTANCE)
          .filter((n) => {
            const t = Date.parse(n.publishedAt);
            return Number.isFinite(t) ? t >= cutoff : true;
          })
          .filter((n) => !shownRef.current.has(n.id))
          .sort((a, b) => {
            if (b.importance !== a.importance) return b.importance - a.importance;
            return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
          });

        if (candidates.length === 0) return;

        // İlk batch için en fazla 3 bildirim gönder (spam'ı önle)
        const batch = candidates.slice(0, 3);

        for (const n of batch) {
          // Tag: aynı haber kimliği → eski bildirimi günceller
          const symList = n.symbols.length > 0 ? ` · ${n.symbols.slice(0, 3).join(', ')}` : '';
          const tone = n.importance >= 9 ? '🔴 SON DAKİKA' : n.importance >= 8 ? '🟠 ÖNEMLİ' : '🟡 GÜNDEM';
          const title = `${tone}${symList}`;
          const body = n.title;
          const url = n.symbols[0]
            ? `/stock/${n.symbols[0]}`
            : '/news';

          // SW push ile göster
          showSwNotification({ title, body, url, tag: `news-${n.id}` }).catch(() => { /* */ });

          shownRef.current.add(n.id);
        }
        saveShownIds(shownRef.current);
      } finally {
        inFlightRef.current = false;
      }
    };

    // İlk check 8sn sonra (Layout mount + diğer fetch'lerle yarışmasın)
    const t0 = setTimeout(check, 8000);
    const id = setInterval(check, CHECK_INTERVAL_MS);

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
  }, []);

  return null;
}
