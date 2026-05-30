import { useSiteSettings } from '@/store/siteSettings';
import { cn } from '@/lib/utils';

/**
 * Admin-only — Reklam (sponsor) banner'ını ücretsiz üyeler için açıp kapatır.
 * PRO/ELITE üyeler bu toggle'dan etkilenmez (kendi tier kontrolleri var).
 */
export function SiteVisibilitySection() {
  const adBannerEnabled = useSiteSettings((s) => s.adBannerEnabled);
  const setAdBannerEnabled = useSiteSettings((s) => s.setAdBannerEnabled);
  const adVideoEnabled = useSiteSettings((s) => s.adVideoEnabled);
  const setAdVideoEnabled = useSiteSettings((s) => s.setAdVideoEnabled);

  return (
    <>
      <p className="text-xs leading-relaxed text-slate-400">
        Reklam banner'ı ve tanıtım videosu görünürlüğünü buradan açıp kapatabilirsin.
        PRO/ELITE üyeler banner'dan etkilenmez. YouTube sponsoru ve diğer içerikler
        bu anahtarlardan etkilenmez.
      </p>

      <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-md bg-bg-card/40 px-3 py-2 transition hover:bg-bg-card/70">
        <div>
          <div className="text-xs font-medium text-slate-200">Reklam banner'ı (Sponsor)</div>
          <div className="text-[10px] text-slate-500">
            {adBannerEnabled ? 'Şu an açık — ücretsiz üyeler görüyor' : 'Şu an kapalı — kimseye gösterilmiyor'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={adBannerEnabled}
          onClick={() => setAdBannerEnabled(!adBannerEnabled)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full transition',
            adBannerEnabled ? 'bg-success/70' : 'bg-slate-600',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
              adBannerEnabled ? 'left-4' : 'left-0.5',
            )}
          />
        </button>
      </label>

      <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-md bg-bg-card/40 px-3 py-2 transition hover:bg-bg-card/70">
        <div>
          <div className="text-xs font-medium text-slate-200">HaneFinans tanıtım videosu</div>
          <div className="text-[10px] text-slate-500">
            {adVideoEnabled ? 'Şu an açık — sağ üstte görünüyor' : 'Şu an kapalı — kimseye gösterilmiyor'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={adVideoEnabled}
          onClick={() => setAdVideoEnabled(!adVideoEnabled)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full transition',
            adVideoEnabled ? 'bg-success/70' : 'bg-slate-600',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
              adVideoEnabled ? 'left-4' : 'left-0.5',
            )}
          />
        </button>
      </label>
    </>
  );
}
