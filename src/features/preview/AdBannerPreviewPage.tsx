import { useEffect, useState } from 'react';
import { Youtube, Info, Copy, Check, Play, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { HaneModAdBanner } from '@/components/domain/HaneModAdBanner';
import { cn } from '@/lib/utils';

/**
 * Reklam banner önizleme sayfası. Yalnızca tasarım kontrolü için.
 * Üretimde sidebar'a bağlandıktan sonra silmeye veya admin-only yapmaya gerek yok —
 * geliştirme aracı olarak kalsın.
 */

// Geçici örnek video ID'leri (Hane Mod Studio kanalına ait DEĞİLDİR, sadece tasarımı görmek için).
// Gerçek video ID'leri bana iletildiğinde HaneModAdBanner.tsx içindeki FEATURED_VIDEOS dizisine ekleyeceğim.
const DEMO_VIDEOS = [
  { id: 'jfKfPfyJRdk', title: 'Skyrim — Sırlı Büyücü Kulesi Modu', hook: 'YENİ: Skyrim büyücü kalesi' },
  { id: 'M7lc1UVf-VE', title: 'Witcher 3 — Gece Yarısı Avı', hook: 'Mod tanıtım: Yeni canavar' },
  { id: 'aqz-KE-bpKQ', title: 'Cyberpunk 2077 — Night City Karanlık Modu', hook: 'Atmosfer overhaul' },
];

export function AdBannerPreviewPage() {
  const [copied, setCopied] = useState(false);

  const copyExample = () => {
    navigator.clipboard.writeText(`export const FEATURED_VIDEOS: FeaturedVideo[] = [
  { id: 'XXXXXXXXXXX', title: 'Video başlığı', hook: 'Kısa açıklama' },
];`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <PageHeader
        title="Reklam Banner Önizleme"
        subtitle="Hane Mod Studio YouTube banner'ı — sidebar'a entegre edilmeden önce buradan onayla."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs text-warning">
            <Info size={12} /> Geliştirme aracı
          </span>
        }
      />

      <div className="card mb-5 border-accent/30 bg-accent/5 p-4 text-xs leading-relaxed text-slate-300">
        <p className="font-semibold text-accent">Nasıl çalışıyor?</p>
        <ul className="mt-2 list-disc pl-5 space-y-1 text-slate-400">
          <li>Banner, YouTube'un public thumbnail CDN'inden gerçek video kapaklarını çeker — API key gerekmez.</li>
          <li>Her video için sadece 11 karakterlik <strong>video ID</strong>'si yeterli (URL'deki <code>?v=</code> sonrası).</li>
          <li>Birden fazla video varsa banner 7 saniyede bir döner.</li>
          <li>Tıklama → o videoya gider; videosuz fallback → kanal sayfasına gider.</li>
        </ul>
        <p className="mt-3 text-[11px] text-slate-500">
          <strong className="text-warning">Aşağıda gördüklerin:</strong> Hane Mod Studio'ya ait DEĞİL — sadece tasarımı görmek için 3 örnek YouTube video ID'siyle hazırlandı.
          Gerçek video ID'lerini bana ver ya da{' '}
          <code className="rounded bg-bg-card px-1 font-mono">src/components/domain/HaneModAdBanner.tsx</code> içindeki{' '}
          <code className="rounded bg-bg-card px-1 font-mono">FEATURED_VIDEOS</code> dizisine yapıştır.
        </p>
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">Sidebar Kompakt (gerçek konumu)</h2>
      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <div className="mb-2 text-[11px] text-slate-500">Durum: Hiç video tanımlanmamış (fallback)</div>
          <div className="rounded-lg bg-bg-soft/85 p-3" style={{ maxWidth: 240 }}>
            <HaneModAdBanner variant="compact" />
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] text-slate-500">Durum: 1 video (örnek)</div>
          <div className="rounded-lg bg-bg-soft/85 p-3" style={{ maxWidth: 240 }}>
            <InlinePreview videos={[DEMO_VIDEOS[0]]} variant="compact" />
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] text-slate-500">Durum: 3 video, 7sn'de bir rotasyon</div>
          <div className="rounded-lg bg-bg-soft/85 p-3" style={{ maxWidth: 240 }}>
            <InlinePreview videos={DEMO_VIDEOS} variant="compact" />
          </div>
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">Wide (mobil veya alt-sayfa için)</h2>
      <div className="space-y-3">
        <InlinePreview videos={DEMO_VIDEOS} variant="wide" />
        <InlinePreview videos={[]} variant="wide" />
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">Konfigürasyon Örneği</h2>
      <div className="card relative p-4">
        <button
          onClick={copyExample}
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-bg-card px-2 py-1 text-[10px] text-slate-400 hover:text-accent"
        >
          {copied ? <><Check size={11} /> Kopyalandı</> : <><Copy size={11} /> Kopyala</>}
        </button>
        <pre className="overflow-x-auto text-[11px] leading-relaxed text-slate-300">
{`// src/components/domain/HaneModAdBanner.tsx içinde:
export const FEATURED_VIDEOS: FeaturedVideo[] = [
  { id: 'abc123XYZ_8', title: 'Mod tanıtım videomuz', hook: 'YENİ: Skyrim büyücü' },
  { id: 'def456UVW_2', title: 'Witcher 3 mod paketi', hook: 'Top 10 mod' },
];`}
        </pre>
        <p className="mt-3 text-[11px] text-slate-500">
          <strong>Video ID nasıl bulunur:</strong> YouTube videosunu aç → URL'deki{' '}
          <code className="rounded bg-bg-card px-1 font-mono">?v=XXXXXXXXXXX</code> kısmı.
          Örn. <code className="rounded bg-bg-card px-1 font-mono">youtu.be/dQw4w9WgXcQ</code> → ID: <code className="rounded bg-bg-card px-1 font-mono">dQw4w9WgXcQ</code>.
        </p>
      </div>

      <div className="mt-6 card border-success/30 bg-success/5 p-4 text-xs text-slate-300">
        <p className="flex items-center gap-2 font-semibold text-success">
          <Youtube size={14} /> Onaylarsan entegrasyon
        </p>
        <p className="mt-1 text-slate-400">
          Tasarımı beğenirsen sidebar reklam slotunu sponsor banner'ı yerine bu banner'la değiştiririm (Layout.tsx'deki AdBanner). Bana "tamam ekle" de.
        </p>
      </div>
    </>
  );
}

/**
 * Önizleme için inline render — modül-seviyesi FEATURED_VIDEOS'tan bağımsız,
 * farklı video listeleriyle görsel test için.
 */
function InlinePreview({
  videos,
  variant,
}: {
  videos: Array<{ id: string; title: string; hook?: string }>;
  variant: 'compact' | 'wide';
}) {
  const [idx, setIdx] = useState(0);
  const hasVideos = videos.length > 0;
  const video = hasVideos ? videos[idx] : null;

  useEffect(() => {
    if (videos.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % videos.length), 7000);
    return () => clearInterval(id);
  }, [videos.length]);

  const CHANNEL_URL = 'https://www.youtube.com/@hanemodstudio';
  const targetUrl = video ? `https://www.youtube.com/watch?v=${video.id}` : CHANNEL_URL;

  if (variant === 'compact') {
    return (
      <a
        href={targetUrl}
        target="_blank"
        rel="noopener sponsored noreferrer"
        className="group relative block overflow-hidden rounded-lg border border-red-500/40 bg-gradient-to-br from-red-950 via-rose-950 to-black shadow-md transition hover:border-red-400 hover:shadow-lg hover:shadow-red-500/20"
      >
        {video && (
          <div className="relative aspect-video w-full overflow-hidden">
            <img
              src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
              alt={video.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
            <div className="absolute inset-0 grid place-items-center bg-black/30 transition group-hover:bg-black/20">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-red-600/95 shadow-lg ring-2 ring-white/30 transition group-hover:scale-110">
                <Play size={16} className="ml-0.5 fill-white text-white" />
              </span>
            </div>
            <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              <Youtube size={9} /> YouTube
            </span>
            <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">
              Sponsor
            </span>
          </div>
        )}
        <div className="p-2.5">
          {!video && (
            <div className="mb-1.5 inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              <Youtube size={9} /> YouTube
            </div>
          )}
          <div className="flex items-center justify-between gap-1.5">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-bold text-white">Hane Mod Studio</div>
              {video?.hook && <div className="mt-0.5 truncate text-[10px] text-red-200/90">{video.hook}</div>}
              {!video && <div className="mt-0.5 text-[10px] text-red-200/90">InvestliQ'ın resmi YouTube kanalı</div>}
            </div>
            <ExternalLink size={11} className="shrink-0 text-red-300 transition group-hover:translate-x-0.5 group-hover:text-white" />
          </div>
          <div className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded bg-red-600 py-1 text-[10px] font-bold uppercase tracking-wider text-white transition group-hover:bg-red-500">
            <Youtube size={10} /> Abone Ol
          </div>
        </div>
        {videos.length > 1 && (
          <div className="flex justify-center gap-1 pb-1.5">
            {videos.map((_, i) => (
              <span key={i} className={cn('h-1 rounded-full transition-all', i === idx ? 'w-4 bg-red-400' : 'w-1 bg-red-900')} />
            ))}
          </div>
        )}
      </a>
    );
  }

  return (
    <a
      href={targetUrl}
      target="_blank"
      rel="noopener sponsored noreferrer"
      className="group relative flex overflow-hidden rounded-xl border border-red-500/40 bg-gradient-to-r from-red-950 via-rose-950 to-black shadow-md transition hover:border-red-400 hover:shadow-lg hover:shadow-red-500/20"
    >
      {video && (
        <div className="relative aspect-video w-40 shrink-0 overflow-hidden sm:w-56">
          <img
            src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
            alt={video.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
          <div className="absolute inset-0 grid place-items-center bg-black/25">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-red-600/95 shadow-lg ring-2 ring-white/30 transition group-hover:scale-110">
              <Play size={18} className="ml-0.5 fill-white text-white" />
            </span>
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col justify-center p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <Youtube size={10} /> YouTube
          </span>
          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/80 backdrop-blur-sm">Sponsor</span>
        </div>
        <h3 className="mt-1.5 text-base font-bold text-white sm:text-lg">Hane Mod Studio</h3>
        <p className="mt-0.5 line-clamp-2 text-xs text-red-200/90 sm:text-sm">
          {video?.title ?? 'InvestliQ\'ın resmi YouTube kanalı — yeni içerikler için takipte kal.'}
        </p>
        <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white transition group-hover:bg-red-500">
          <Youtube size={12} /> Abone Ol
        </span>
      </div>
      <span className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/80 backdrop-blur-sm">
        @hanemodstudio
      </span>
    </a>
  );
}
