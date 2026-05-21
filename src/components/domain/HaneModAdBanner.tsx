import { useEffect, useState } from 'react';
import { Youtube, ExternalLink, Volume2, VolumeX } from 'lucide-react';
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
 * 2+ video varsa 30sn'de bir döner; 1 video varsa statik gösterilir.
 *
 * Sıra önemli — listede yukarıdan aşağıya sırayla rotate eder.
 * Title (iframe accessibility) ve hook (banner alt metni) düzeltmek istersen
 * her video için ayrı string verebilirsin.
 */
export const FEATURED_VIDEOS: FeaturedVideo[] = [
  { id: '3oE3b4Oz148', title: 'FiveM Map | Auto Shop',     hook: 'YENİ: FiveM Auto Shop haritası' },
  { id: 'fmtish7HUzI', title: 'Hane Mod Studio — Showcase', hook: 'Yeni içerik: FiveM showcase' },
  { id: 'rgKf-Nkv5zQ', title: 'Hane Mod Studio — Showcase', hook: 'Yeni içerik: FiveM önizleme' },
  { id: '6qKlk5L-VII', title: 'Hane Mod Studio — Showcase', hook: 'Yeni içerik: FiveM tanıtım' },
  { id: 'ANqnwDKNI_s', title: 'Hane Mod Studio — Showcase', hook: 'Yeni içerik: FiveM güncel' },
  { id: 'E5l7_WwDtdc', title: 'Hane Mod Studio — Showcase', hook: 'Yeni içerik: FiveM içerik' },
];

interface Props {
  variant?: 'compact' | 'wide';
  className?: string;
}

/** YouTube iframe embed URL — autoplay + mute + loop. mute=1 zorunlu (Chrome/Safari autoplay policy). */
function embedUrl(videoId: string, muted: boolean) {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: muted ? '1' : '0',
    loop: '1',
    playlist: videoId, // tek video loop için zorunlu
    controls: '0',
    modestbranding: '1',
    rel: '0',
    playsinline: '1',
    disablekb: '1',
    iv_load_policy: '3',
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function HaneModAdBanner({ variant = 'compact', className }: Props) {
  const [idx, setIdx] = useState(0);
  // Muted başla — tarayıcı autoplay policy'si sesli otomatik oynatmayı bloklar.
  // Kullanıcı sağ alt 🔊 ikonu ile sesi açabilir.
  const [muted, setMuted] = useState(true);
  const hasVideos = FEATURED_VIDEOS.length > 0;
  const video = hasVideos ? FEATURED_VIDEOS[idx] : null;

  useEffect(() => {
    if (FEATURED_VIDEOS.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % FEATURED_VIDEOS.length), 30000);
    return () => clearInterval(id);
  }, []);

  // Tıklama her zaman kanal sayfasına (spesifik video URL'i yerine)
  const targetUrl = CHANNEL_URL;

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'group relative overflow-hidden rounded-lg border border-red-500/40 bg-gradient-to-br from-red-950 via-rose-950 to-black shadow-md transition hover:border-red-400 hover:shadow-lg hover:shadow-red-500/20',
          className,
        )}
      >
        {/* Video — autoplay + mute + loop */}
        {video && (
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            <iframe
              key={video.id}
              src={embedUrl(video.id, muted)}
              title={video.title}
              loading="lazy"
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full"
              frameBorder={0}
            />
            {/* Tıklama yakalayıcı — iframe üstüne şeffaf katman, video tıklanınca YouTube'a açar */}
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener sponsored"
              aria-label={`${video.title} — YouTube'da aç`}
              className="absolute inset-0 z-10"
              style={{ pointerEvents: 'auto' }}
            />
            {/* YouTube + Sponsor rozetleri */}
            <span className="pointer-events-none absolute left-1.5 top-1.5 z-20 inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-md">
              <Youtube size={9} /> YouTube
            </span>
            <span className="pointer-events-none absolute right-1.5 top-1.5 z-20 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">
              Sponsor
            </span>
            {/* Mute toggle — sağ alt köşe */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
              aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
              className="absolute bottom-1.5 right-1.5 z-20 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white/90 backdrop-blur-sm transition hover:bg-black/90 hover:text-white"
            >
              {muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
            </button>
          </div>
        )}

        {/* Alt metin */}
        <a
          href={targetUrl}
          target="_blank"
          rel="noopener sponsored"
          className="block p-2.5"
        >
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
        </a>

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
      </div>
    );
  }

  // Wide variant — yatay
  return (
    <div
      className={cn(
        'group relative flex overflow-hidden rounded-xl border border-red-500/40 bg-gradient-to-r from-red-950 via-rose-950 to-black shadow-md transition hover:border-red-400 hover:shadow-lg hover:shadow-red-500/20',
        className,
      )}
    >
      {video && (
        <div className="relative aspect-video w-40 shrink-0 overflow-hidden bg-black sm:w-56">
          <iframe
            key={video.id}
            src={embedUrl(video.id, muted)}
            title={video.title}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full"
            frameBorder={0}
          />
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener sponsored"
            aria-label={`${video.title} — YouTube'da aç`}
            className="absolute inset-0 z-10"
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
            aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
            className="absolute bottom-2 right-2 z-20 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white/90 backdrop-blur-sm transition hover:bg-black/90 hover:text-white"
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        </div>
      )}

      <a
        href={targetUrl}
        target="_blank"
        rel="noopener sponsored"
        className="flex flex-1 flex-col justify-center p-4"
      >
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
      </a>

      <span className="pointer-events-none absolute right-2 top-2 z-20 rounded bg-black/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/80 backdrop-blur-sm">
        @hanemodstudio
      </span>
    </div>
  );
}
