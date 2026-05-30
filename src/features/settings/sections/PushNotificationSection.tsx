import { useEffect, useState, type ReactNode } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/store/auth';
import {
  checkSupport,
  askPermission,
  getPermission,
  isPushBackendConfigured,
  subscribeAndRegister,
  unsubscribeAll,
  sendTestPushFromServer,
  getExistingSubscription,
} from '@/lib/pushNotifications';
import { getPushPref, setPushPref } from '@/lib/notificationPrefs';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

/**
 * Service Worker tabanlı push bildirim ayarları.
 * Sekme arka plandayken bile fiyat alarmları/önemli haberler için bildirim gönderir.
 */
export function PushNotificationSection() {
  const user = useAuth((s) => s.user);
  const userId = user?.id ?? 'anon';
  const [support, setSupport] = useState(checkSupport());
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(getPermission());
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [prefAlerts, setPrefAlerts] = useState<boolean>(true);
  const [prefNews, setPrefNews] = useState<boolean>(false);
  const [backendReady] = useState(isPushBackendConfigured());
  const [serverSubscribed, setServerSubscribed] = useState(false);

  useEffect(() => {
    setSupport(checkSupport());
    setPerm(getPermission());
    setPrefAlerts(getPushPref('alerts', userId));
    setPrefNews(getPushPref('news', userId));
    // Mevcut subscription var mı kontrol et
    getExistingSubscription()
      .then((sub) => setServerSubscribed(!!sub))
      .catch(() => setServerSubscribed(false));
  }, [userId]);

  const toggleAlerts = () => {
    const next = !prefAlerts;
    setPrefAlerts(next);
    setPushPref('alerts', userId, next);
  };
  const toggleNews = () => {
    const next = !prefNews;
    setPrefNews(next);
    setPushPref('news', userId, next);
  };

  const supported = support === 'supported';
  const granted = perm === 'granted';

  const enable = async () => {
    setBusy(true);
    try {
      const next = await askPermission();
      setPerm(next);
      if (next !== 'granted') return;

      // İzin verildi — backend'e subscription'ı kaydet
      if (!user) {
        toast.error('Önce giriş yap', 'Push bildirimleri için hesap gerekli.');
        return;
      }
      if (!backendReady) {
        toast.error('Backend hazır değil', 'VAPID public key tanımlı değil. Cloudflare Pages env\'lerini kontrol et.');
        return;
      }
      const r = await subscribeAndRegister();
      if (r.ok) {
        setServerSubscribed(true);
        toast.success('Bildirimler aktif', 'Test bildirimi göndererek doğrulayabilirsin.');
      } else {
        toast.error('Subscription kaydedilemedi', r.error ?? 'Bilinmeyen hata');
      }
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await unsubscribeAll();
      setServerSubscribed(false);
      toast.success('Bildirimler kapatıldı');
    } finally {
      setBusy(false);
    }
  };

  const testNotification = async () => {
    setTesting(true);
    try {
      const r = await sendTestPushFromServer();
      if (r.ok && (r.sent ?? 0) > 0) {
        toast.success(
          'Test bildirimi gönderildi',
          `${r.sent} cihaz/tarayıcıya yollandı. Birkaç saniye içinde bildirim görmelisin.`,
        );
      } else if (r.expired && r.expired > 0) {
        setServerSubscribed(false);
        toast.error(
          'Subscription geçersiz',
          'Tarayıcı subscription\'ı silmiş — tekrar "Bildirimleri Aç"a bas.',
        );
      } else {
        toast.error(
          'Test gönderilemedi',
          r.error ?? `Gönderim başarısız (${r.failed ?? 0} hata)`,
        );
      }
    } finally {
      setTesting(false);
    }
  };

  let statusBadge: ReactNode;
  if (!supported) {
    statusBadge = (
      <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-300">
        desteklenmiyor
      </span>
    );
  } else if (granted) {
    statusBadge = (
      <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
        aktif
      </span>
    );
  } else if (perm === 'denied') {
    statusBadge = (
      <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-danger">
        engellendi
      </span>
    );
  } else {
    statusBadge = (
      <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">
        kapalı
      </span>
    );
  }

  return (
    <>
      <div className="mb-1 flex items-center gap-2">{statusBadge}</div>
      <p className="text-xs leading-relaxed text-slate-400">
        Tarayıcı bildirim sisteminin üstünde Service Worker tabanlı push.
        Sekme arka plandayken bile fiyat alarmlarının görünür.
        İzin verirsen alarm tetiklendiğinde bildirim alırsın.
      </p>

      {!supported && (
        <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-[11px] text-warning">
          Tarayıcın push bildirimini desteklemiyor. iOS Safari'de bunun çalışması için
          siteyi "Ana Ekrana Ekle" ile yüklemen gerekir.
        </p>
      )}

      {supported && perm === 'denied' && (
        <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-[11px] text-danger">
          Bildirim iznini reddetmişsin. Tarayıcı ayarlarından izni elle açman gerek
          (adres çubuğundaki kilit ikonu → site izinleri).
        </p>
      )}

      {supported && backendReady === false && (
        <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-[11px] text-warning">
          Push backend yapılandırılmamış (VAPID public key eksik). Yöneticiyle iletişime geç.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {supported && !granted && perm !== 'denied' && (
          <button onClick={enable} disabled={busy || !user} className="btn-primary text-xs">
            <Bell size={12} /> {busy ? 'Açılıyor...' : 'Bildirimleri Aç'}
          </button>
        )}
        {supported && granted && !serverSubscribed && (
          <button onClick={enable} disabled={busy || !user || !backendReady} className="btn-primary text-xs">
            <Bell size={12} /> {busy ? 'Bağlanıyor...' : 'Sunucuya Bağla'}
          </button>
        )}
        {supported && granted && serverSubscribed && (
          <>
            <button onClick={testNotification} disabled={testing} className="btn-secondary text-xs">
              <Bell size={12} /> {testing ? 'Gönderiliyor...' : 'Test Bildirimi Gönder'}
            </button>
            <button onClick={disable} disabled={busy} className="btn-ghost text-xs">
              Bildirimleri Kapat
            </button>
          </>
        )}
        {supported && granted && !user && (
          <p className="text-[11px] text-warning">Push bildirimleri için önce giriş yap.</p>
        )}
      </div>

      {supported && granted && (
        <div className="mt-4 space-y-2 border-t border-border/50 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Hangi olaylar için bildirim?
          </p>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-bg-card/40 px-3 py-2 transition hover:bg-bg-card/70">
            <div>
              <div className="text-xs font-medium text-slate-200">Fiyat alarmları</div>
              <div className="text-[10px] text-slate-500">Eklediğin hisse/fon alarmı tetiklendiğinde</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefAlerts}
              onClick={toggleAlerts}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 rounded-full transition',
                prefAlerts ? 'bg-success/70' : 'bg-slate-600',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                  prefAlerts ? 'left-4' : 'left-0.5',
                )}
              />
            </button>
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-bg-card/40 px-3 py-2 transition hover:bg-bg-card/70">
            <div>
              <div className="text-xs font-medium text-slate-200">Son dakika haberleri</div>
              <div className="text-[10px] text-slate-500">Önemi yüksek (≥7) breaking news geldikçe</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefNews}
              onClick={toggleNews}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 rounded-full transition',
                prefNews ? 'bg-success/70' : 'bg-slate-600',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                  prefNews ? 'left-4' : 'left-0.5',
                )}
              />
            </button>
          </label>
        </div>
      )}
    </>
  );
}
