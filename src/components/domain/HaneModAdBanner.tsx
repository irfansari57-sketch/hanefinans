import { useEffect, useState } from 'react';
import { Youtube, Play, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Hane Mod Studio YouTube reklam banner'ı.
 *
 * Yapı: YouTube'un public thumbnail CDN'i (i.ytimg.com) kullanılır — API key gerekmez.
 * Her video için 11 karakterlik video ID'sini FEATURED_VIDEOS dizisine ekle.
 * Video ID'si: youtube.com/watch?v=XXXXXXXXXXX URL'indeki v= parametresi.
 *
 * Thumbnail URL formatı:
 *   https://i.ytimg.com/vi/{VIDEO_ID}/hqdefault.jpg     (480x360)
 *   https://i.ytimg.com/vi/{VIDEO_ID}/maxresdefault.jpg (1280x720, varsa)
 */

const CHANNEL_URL = 'https://www.youtube.com/@hanemodstudio';
const CHANNEL_NAME = 'Hane Mod Studio';

interface FeaturedVideo {
  id: string;         // 11 karakter YouTube video ID
  title: string;
  /** Kısa açıklama — banner üstünde 1 satır olarak çıkar */
  hook?: string;
}

/**
 * Öne çıkan videolar — gerçek video ID'lerini buraya yapıştır.
 * Boş bırakılırsa banner kanal logosu + jenerik mesaj gösterir.
 * 2+ video varsa 7sn'de bir döner; 1 video varsa statik gösterilir.
 */
export const FEATURED_VIDEOS: FeaturedVideo[] = [
  { id: '3oE3b4Oz148', title: 'FiveM Map | Auto Shop', hook: 'YENİ: FiveM Auto Shop haritası' },
];

interface Props {
  variant?: 'compact' | 'wide';
  className?: string;
}

export function HaneModAdBanner({ variant = 'compact', className }: Props) {
  const [idx, setIdx] = useState(0);
  const hasVideos = FEATURED_VIDEOS.length > 0;
  const video = hasVideos ? FEATURED_VIDEOS[idx] : null;

  useEffect(() => {
    if (FEATURED_VIDEOS.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % FEATURED_VIDEOS.length), 7000);
    return () => clearInterval(id);
  }, []);

  const targetUrl = video
    ? `https://www.youtube.com/watch?v=${video.id}`
    : CHANNEL_URL;

  if (variant === 'compact') {
    return (
      <a
        href={targetUrl}
        target="_blank"
        rel="noopener sponsored"
        className={cn(
          'group relative block overflow-hidden rounded-lg border border-red-500/40 bg-gradient-to-br from-red-950 via-rose-950 to-black shadow-md transition hover:border-red-400 hover:shadow-lg hover:shadow-red-500/20',
          className,
        )}
      >
        {/* Thumbnail */}
        {video && (
          <div className="relative aspect-video w-full overflow-hidden">
            <img
              src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
              alt={video.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
            {/* Play overlay */}
            <div className="absolute inset-0 grid place-items-center bg-black/30 transition group-hover:bg-black/20">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-red-600/95 shadow-lg ring-2 ring-white/30 transition group-hover:scale-110">
                <Play size={16} className="ml-0.5 fill-white text-white" />
              </span>
            </div>
            {/* YouTube badge */}
            <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              <Youtube size={9} /> YouTube
            </span>
            <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">
              Sponsor
            </span>
          </div>
        )}

        {/* Alt metin */}
        <div className="p-2.5">
          {!video && (
            <div className="mb-1.5 inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              <Youtube size={9} /> YouTube
            </div>
          )}
          <div className="flex items-center justify-between gap-1.5">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-bold text-white">{CHANNEL_NAME}</div>
              {video?.hook && (
                <div className="mt-0.5 truncate text-[10px] text-red-200/90">{video.hook}</div>
              )}
              {!video && (
                <div className="mt-0.5 text-[10px] text-red-200/90">Hane Finans'ın resmi YouTube kanalı</div>
              )}
            </div>
            <ExternalLink size={11} className="shrink-0 text-red-300 transition group-hover:translate-x-0.5 group-hover:text-white" />
          </div>
          <div className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded bg-red-600 py-1 text-[10px] font-bold uppercase tracking-wider text-white transition group-hover:bg-red-500">
            <Youtube size={10} /> Abone Ol
          </div>
        </div>

        {/* Indicator dots */}
        {FEATURED_VIDEOS.length > 1 && (
          <div className="flex justify-center gap-1 pb-1.5">
            {FEATURED_VIDEOS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1 rounded-full transition-all',
                  i === idx ? 'w-4 bg-red-400' : 'w-1 bg-red-900',
                )}
              />
            ))}
          </div>
        )}
      </a>
    );
  }

  // Wide variant — yatay
  return (
    <a
      href={targetUrl}
      target="_blank"
      rel="noopener sponsored"
      className={cn(
        'group relative flex overflow-hidden rounded-xl border border-red-500/40 bg-gradient-to-r from-red-950 via-rose-950 to-black shadow-md transition hover:border-red-400 hover:shadow-lg hover:shadow-red-500/20',
        className,
      )}
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
          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/80 backdrop-blur-sm">
            Sponsor
          </span>
        </div>
        <h3 className="mt-1.5 text-base font-bold text-white sm:text-lg">{CHANNEL_NAME}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs text-red-200/90 sm:text-sm">
          {video?.title ?? video?.hook ?? 'Hane Finans\'ın resmi YouTube kanalı — yeni içerikler için takipte kal.'}
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
