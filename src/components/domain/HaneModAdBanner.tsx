import { useEffect, useRef, useState, useCallback } from 'react';
import { Youtube, ExternalLink, Volume2, VolumeX, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Hane Mod Studio YouTube reklam banner'ı.
 *
 * Rotation stratejisi (yeniden yazıldı):
 *  - Mount edildiğinde YT IFrame API yüklenir, **boş bir <div>** üzerine
 *    new YT.Player({ videoId, ... }) ile player oluşturulur.
 *  - ENDED event'inde player.loadVideoById(next) ile sıradaki video aynı player
 *    içinde oynatılır. İframe remount edilmediği için event handler kaybolmaz.
 *  - State (idx, muted) progress noktaları ve ses ikonu için tutulur.
 *  - Tek video varsa yine de player API ile loop=1 davranışı kurulur.
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
 * ENDED event'inde sıradaki ID loadVideoById ile aynı player'da oynatılır.
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
    // Already loaded
    if (window.YT && window.YT.Player) resolve();
  });
  return ytApiPromise;
}

export function HaneModAdBanner({ variant = 'compact', className }: Props) {
  const [idx, setIdx] = useState(0);
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const idxRef = useRef(0);

  const hasVideos = FEATURED_VIDEOS.length > 0;
  const video = hasVideos ? FEATURED_VIDEOS[idx] : null;

  // idx değişimini ref ile takip et — closure dependency kirletmeden
  useEffect(() => { idxRef.current = idx; }, [idx]);

  // Player'ı tek seferde mount et
  useEffect(() => {
    if (!hasVideos || !containerRef.current) return;
    let cancelled = false;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      try {
        playerRef.current = new window.YT.Player(containerRef.current, {
          videoId: FEATURED_VIDEOS[0].id,
          playerVars: {
            autoplay: 1,
            mute: 1,           // ilk video sessiz başlasın (autoplay policy)
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            disablekb: 1,
            iv_load_policy: 3,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: any) => {
              try {
                if (muted) e.target.mute(); else e.target.unMute();
                e.target.playVideo?.();
              } catch { /* ignore */ }
            },
            onStateChange: (e: any) => {
              // YT.PlayerState.ENDED === 0
              if (e?.data === 0) {
                const cur = idxRef.current;
                const next = (cur + 1) % FEATURED_VIDEOS.length;
                setIdx(next);
                try {
                  e.target.loadVideoById(FEATURED_VIDEOS[next].id);
                } catch { /* ignore */ }
              }
            },
          },
        });
      } catch {
        /* ignore */
      }
    });

    return () => {
      cancelled = true;
      try { playerRef.current?.destroy?.(); } catch { /* ignore */ }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVideos]);

  // Mute toggle — player API
  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMuted((m) => {
      const next = !m;
      try {
        if (next) playerRef.current?.mute?.();
        else playerRef.current?.unMute?.();
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Belirli bir videoya atla — tıklanabilir noktalar ve oklar için
  const jumpTo = useCallback((nextIdx: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!hasVideos) return;
    const wrapped = ((nextIdx % FEATURED_VIDEOS.length) + FEATURED_VIDEOS.length) % FEATURED_VIDEOS.length;
    if (wrapped === idxRef.current) return;
    setIdx(wrapped);
    try {
      playerRef.current?.loadVideoById?.(FEATURED_VIDEOS[wrapped].id);
    } catch { /* ignore */ }
  }, [hasVideos]);

  const goPrev = useCallback((e: React.MouseEvent) => jumpTo(idxRef.current - 1, e), [jumpTo]);
  const goNext = useCallback((e: React.MouseEvent) => jumpTo(idxRef.current + 1, e), [jumpTo]);

  const targetUrl = CHANNEL_URL;

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'group relative overflow-hidden rounded-lg border border-red-500/40 bg-gradient-to-br from-red-950 via-rose-950 to-black shadow-md transition hover:border-red-400 hover:shadow-lg hover:shadow-red-500/20',
          className,
        )}
      >
        {hasVideos && (
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            {/* YT player buraya iframe enjekte eder */}
            <div ref={containerRef} className="absolute inset-0 h-full w-full" />
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener sponsored"
              aria-label={`${video?.title ?? CHANNEL_NAME} — YouTube'da aç`}
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
              onClick={toggleMute}
              aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
              className="absolute bottom-1.5 right-1.5 z-20 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white/90 backdrop-blur-sm transition hover:bg-black/90 hover:text-white"
            >
              {muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
            </button>
            {FEATURED_VIDEOS.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Önceki video"
                  className="absolute left-1.5 top-1/2 z-20 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm opacity-0 transition group-hover:opacity-100 hover:bg-black/85 hover:text-white"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Sonraki video"
                  className="absolute right-1.5 top-1/2 z-20 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm opacity-0 transition group-hover:opacity-100 hover:bg-black/85 hover:text-white"
                >
                  <ChevronRight size={14} />
                </button>
              </>
            )}
          </div>
        )}

        <a
          href={targetUrl}
          target="_blank"
          rel="noopener sponsored"
          className="block p-2.5"
        >
          {!hasVideos && (
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
              {!hasVideos && (
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
          <div className="flex justify-center gap-1.5 pb-2">
            {FEATURED_VIDEOS.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={(e) => jumpTo(i, e)}
                aria-label={`${i + 1}. video: ${v.title}`}
                title={v.title}
                className={cn(
                  'h-1.5 rounded-full transition-all hover:bg-red-300',
                  i === idx ? 'w-5 bg-red-400' : 'w-1.5 bg-red-900',
                )}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Wide variant
  return (
    <div
      className={cn(
        'group relative flex overflow-hidden rounded-xl border border-red-500/40 bg-gradient-to-r from-red-950 via-rose-950 to-black shadow-md transition hover:border-red-400 hover:shadow-lg hover:shadow-red-500/20',
        className,
      )}
    >
      {hasVideos && (
        <div className="relative aspect-video w-40 shrink-0 overflow-hidden bg-black sm:w-56">
          <div ref={containerRef} className="absolute inset-0 h-full w-full" />
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener sponsored"
            aria-label={`${video?.title ?? CHANNEL_NAME} — YouTube'da aç`}
            className="absolute inset-0 z-10"
          />
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
            className="absolute bottom-2 right-2 z-20 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white/90 backdrop-blur-sm transition hover:bg-black/90 hover:text-white"
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          {FEATURED_VIDEOS.length > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label="Önceki video"
                className="absolute left-2 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm opacity-0 transition group-hover:opacity-100 hover:bg-black/85 hover:text-white"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Sonraki video"
                className="absolute right-2 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm opacity-0 transition group-hover:opacity-100 hover:bg-black/85 hover:text-white"
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}
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
