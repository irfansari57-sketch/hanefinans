import { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, CheckCircle2 } from 'lucide-react';
import { getPwaInstallState, subscribePwaInstall, tryInstall, type PwaInstallState } from '@/lib/pwaInstall';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

/**
 * PWA "Uygulamayı Yükle" — Ayarlar sayfasında manuel install kontrolü.
 *
 * Chrome'un beforeinstallprompt event'i bazen geç fırlar veya hiç fırlamaz
 * (engagement heuristic). Bu bölümle kullanıcı istediği zaman tetikleyebilir.
 *
 * 3 durum:
 *   - canInstallNative=true → "Hemen Yükle" butonu (native diyalog açar)
 *   - isIos=true            → adım adım Safari talimatı
 *   - isStandalone=true     → "Zaten yüklü" mesajı
 *   - hiçbiri               → "Tarayıcının kendi yükle ikonu" yönlendirmesi
 */
export function PwaInstallSection() {
  const [state, setState] = useState<PwaInstallState>(getPwaInstallState());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = subscribePwaInstall(setState);
    return unsub;
  }, []);

  const onInstall = async () => {
    setBusy(true);
    try {
      const result = await tryInstall();
      if (result === 'accepted') toast.success('Uygulama yüklendi 🎉');
      else if (result === 'dismissed') toast.info('Yükleme iptal edildi');
      else toast.info('Tarayıcı şu an native diyalog açamadı — adres çubuğundaki "yükle" ikonunu dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-xs leading-relaxed text-slate-400">
        InvestliQ'ı bilgisayar/telefon ana ekranına ekle. Tarayıcı çubuğu olmaz,
        tam ekran çalışır, ileride push bildirim için temel altyapı kurulur.
      </p>

      {state.isStandalone ? (
        <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success">
          <CheckCircle2 size={14} /> Uygulama zaten yüklü ve çalışıyor.
        </div>
      ) : state.isIos ? (
        <div className="mt-3 rounded-md border border-border bg-bg-card/40 p-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            iOS Safari için adımlar
          </div>
          <ol className="space-y-1 text-[11px] text-slate-300">
            <li className="flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-bg-soft text-[9px] font-bold text-accent">1</span>
              Safari'de alt menüden
              <Share size={12} className="text-accent" />
              <strong>Paylaş</strong>'a dokun
            </li>
            <li className="flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-bg-soft text-[9px] font-bold text-accent">2</span>
              <PlusSquare size={12} className="text-accent" />
              <strong>"Ana Ekrana Ekle"</strong>
            </li>
            <li className="flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-bg-soft text-[9px] font-bold text-accent">3</span>
              Sağ üstte <strong>"Ekle"</strong>
            </li>
          </ol>
        </div>
      ) : state.canInstallNative ? (
        <button
          type="button"
          onClick={onInstall}
          disabled={busy}
          className={cn(
            'mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-bg-card transition hover:bg-accent/90',
            busy && 'opacity-60',
          )}
        >
          <Download size={14} /> {busy ? 'Açılıyor…' : 'Hemen Yükle'}
        </button>
      ) : (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-[11px] text-slate-300">
          <strong className="text-warning">Tarayıcı henüz yükle diyaloğunu hazırlamadı.</strong>
          <p className="mt-1 text-slate-400">
            Chrome / Edge: adres çubuğunun sağında <strong>küçük yükle ikonu</strong> (bilgisayar + ok)
            veya <strong>3 nokta menüsünde "Uygulamayı Yükle..."</strong> seçeneğini dene.
            Bazen site içinde 30+ saniye gezilince aktifleşir.
          </p>
        </div>
      )}
    </>
  );
}
