import { useEffect, useRef, useState } from 'react';
import { Youtube, ExternalLink, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Hane Mod Studio YouTube reklam banner'ı.
 *
 * Rotation: 2+ video varsa YouTube IFrame Player API kullanılır → her video
 * doğal süresi (sonuna kadar) oynar, ENDED event'inde sıradaki videoya geçer.
 * Tek video varsa loop=1 ile sonsuz tekrar.
 *
 * Yapı: i.ytimg.com kullanılmıyor, embed iframe doğrudan kullanılıyor.
 * Her video için 11 karakterlik video ID'sini FEATURED_VIDEOS dizisine ekle.
 */

const CHANNEL_URL = 'https://www.youtube.com/@hanemodstudio';
const CHANNEL_NAME = 'Hane Mod Studio';

interface FeaturedVideo {
  id: string;
  title: string;
  hook?: string;
}

/**
 * Öne çıkan videolar — sıra önemli, listede yukarıdan aşağıya rotate eder.
 * Çoklu video → her biri kendi süresi kadar oynar (YT API ENDED event'i).
 * Tek video → loop=1 ile sürekli döner.
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

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;

/** YouTube IFrame Player API'sini lazy load et. Bir kez yüklenir. */
function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector('script[data-yt-iframe-api]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.ytIframeApi = '1';
      document.head.appendChild(script);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    // API daha önce yüklenmişse direkt resolve
    if (window.YT && window.YT.Player) resolve();
  });
  return ytApiPromise;
}

/** YouTube iframe embed URL — multi-video modunda loop kaldırılır, API enable edilir. */
function embedUrl(videoId: string, muted: boolean, singleLoop: boolean) {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: muted ? '1' : '0',
    controls: '0',
    modestbranding: '1',
    rel: '0',
    playsinline: '1',
    disablekb: '1',
    iv_load_policy: '3',
  });
  if (singleLoop) {
    params.set('loop', '1');
    params.set('playlist', videoId);
  } else {
    params.set('enablejsapi', '1');
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Player'ı iframe'e bağla, ENDED event'inde onEnded callback'ini çağır.
 * useEffect içinden çağrılır, return ettiği cleanup destroy yapar.
 */
function attachYouTubePlayer(
  iframe: HTMLIFrameElement,
  onEnded: () => void,
): () => void {
  let player: any = null;
  let cancelled = false;

  loadYouTubeApi().then(() => {
    if (cancelled) return;
    try {
      player = new window.YT.Player(iframe, {
        events: {
          onStateChange: (e: any) => {
            // YT.PlayerState.ENDED === 0
            if (e?.data === 0) onEnded();
          },
        },
      });
    } catch {
      // API hata verirse sessizce devam (rotation o video için skip edilebilir)
    }
  });

  return () => {
    cancelled = true;
    try {
      player?.destroy?.();
    } catch {
      /* ignore */
    }
  };
}

export function HaneModAdBanner({ variant = 'compact', className }: Props) {
  const [idx, setIdx] = useState(0);
  // Muted başla — tarayıcı autoplay policy'si sesli otomatik oynatmayı bloklar.
  const [muted, setMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hasVideos = FEATURED_VIDEOS.length > 0;
  const video = hasVideos ? FEATURED_VIDEOS[idx] : null;
  const isMulti = FEATURED_VIDEOS.length > 1;

  // Çoklu video → YT API onStateChange ENDED → sıradaki video
  useEffect(() => {
    if (!isMulti || !iframeRef.current) return;
    const cleanup = attachYouTubePlayer(iframeRef.current, () => {
      setIdx((i) => (i + 1) % FEATURED_VIDEOS.length);
    });
    return cleanup;
  }, [idx, isMulti]);

  // Tıklama her zaman kanal sayfasına
  const targetUrl = CHANNEL_URL;

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'group relative overflow-hidden rounded-lg border border-red-500/40 bg-gradient-to-br from-red-950 via-rose-950 to-black shadow-md transition hover:border-red-400 hover:shadow-lg hover:shadow-red-500/20',
          className,
        )}
      >
        {video && (
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            <iframe
              ref={iframeRef}
              key={video.id}
              src={embedUrl(video.id, muted, !isMulti)}
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
              style={{ pointerEvents: 'auto' }}
            />
            <span className="pointer-events-none absolute left-1.5 top-1.5 z-20 inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-md">
              <Youtube size={9} /> YouTube
            </span>
            <span className="pointer-events-none absolute right-1.5 top-1.5 z-20 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">
              Sponsor
            </span>
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
            ref={iframeRef}
            key={video.id}
            src={embedUrl(video.id, muted, !isMulti)}
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
