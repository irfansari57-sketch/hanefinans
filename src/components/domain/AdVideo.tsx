import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX, Maximize2, X, Play, Pause, ChevronDown, Film } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdVideoProps {
  className?: string;
}

const VIDEO_SRC = '/HaneFinans_FinancialIntelligence.mp4';
const COLLAPSE_KEY = 'fa.adVideo.collapsed';

/**
 * HaneFinans reklam videosu — autoplay muted + tikla unmute.
 * Akordeon basligi (tikla kapat / tikla ac) + oynat/durdur + sesli/sessiz +
 * tam ekran modali (React Portal ile body'ye render edilir).
 *
 * Akordeon durumu localStorage'da: bir kere kapatan kullanici icin kapali kalir.
 */
export function AdVideo({ className }: AdVideoProps) {
  const inlineRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* sessizce */
    }
    // Kapatildiginda videoyu durdur, acildiginda devam ettir
    const v = inlineRef.current;
    if (!v) return;
    if (next) {
      v.pause();
      setPlaying(false);
    } else {
      v.play().then(() => setPlaying(true)).catch(() => { /* sessizce */ });
    }
  };

  const toggleMute = () => {
    const v = inlineRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    if (!next) {
      v.play().then(() => setPlaying(true)).catch(() => { /* sessizce */ });
    }
    setMuted(next);
  };

  const togglePlay = () => {
    const v = inlineRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setPlaying(true)).catch(() => { /* sessizce */ });
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const openModal = () => {
    inlineRef.current?.pause();
    setPlaying(false);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    // Modal kapaninca akordeon aciksa devam ettir; kapaliysa dokunma
    if (!collapsed) {
      inlineRef.current?.play().then(() => setPlaying(true)).catch(() => { /* sessizce */ });
    }
  };

  // Video element'inin gerçek play/pause state'i ile UI'i senkron tut
  useEffect(() => {
    const v = inlineRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <div className={cn('overflow-hidden rounded-lg border border-border bg-bg-card/40', className)}>
        {/* Akordeon basligi — Gundem & Haberler stiliyle uyumlu */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex w-full items-center justify-between border-b border-border px-3 py-2 transition hover:bg-bg-card/60"
          aria-expanded={!collapsed}
          aria-controls="ad-video-content"
        >
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-accent/15 text-accent">
              <Film size={12} />
            </span>
            <div className="text-left">
              <div className="text-[11px] font-semibold text-slate-100">Hane Finans tanitim</div>
              <div className="text-[9px] text-slate-500">
                {collapsed ? 'Acmak icin tikla' : 'Kapatmak icin tikla'}
              </div>
            </div>
          </div>
          <ChevronDown
            size={14}
            className={cn(
              'shrink-0 text-slate-400 transition-transform',
              collapsed ? '-rotate-90' : 'rotate-0',
            )}
          />
        </button>

        {!collapsed && (
          <div id="ad-video-content" className="relative aspect-video min-h-[180px] w-full overflow-hidden bg-black">
            <video
              ref={inlineRef}
              src={VIDEO_SRC}
              autoPlay
              muted={muted}
              loop
              playsInline
              preload="auto"
              className="absolute inset-0 h-full w-full cursor-pointer object-cover"
              aria-label="HaneFinans reklam videosu"
              onClick={togglePlay}
            />

            {/* Sag alt buton seridi: oynat/durdur, ses, tam ekran */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={togglePlay}
                className="grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition hover:bg-black/85 active:scale-95"
                aria-label={playing ? 'Durdur' : 'Oynat'}
                title={playing ? 'Durdur' : 'Oynat'}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>

              <button
                type="button"
                onClick={toggleMute}
                className="grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition hover:bg-black/85 active:scale-95"
                aria-label={muted ? 'Sesi ac' : 'Sesi kapat'}
                title={muted ? 'Sesi ac' : 'Sesi kapat'}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>

              <button
                type="button"
                onClick={openModal}
                className="grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition hover:bg-black/85 active:scale-95"
                aria-label="Tam ekran ac"
                title="Buyut"
              >
                <Maximize2 size={15} />
              </button>
            </div>

            {muted && playing && (
              <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                Tikla sesi ac
              </div>
            )}
          </div>
        )}
      </div>

      {open && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4 sm:p-8"
            onClick={closeModal}
            role="dialog"
            aria-modal="true"
            aria-label="HaneFinans reklam videosu — buyuk goruntu"
          >
            <div
              className="relative w-full max-w-5xl"
              onClick={(e) => e.stopPropagation()}
            >
              <video
                src={VIDEO_SRC}
                autoPlay
                controls
                loop
                playsInline
                preload="auto"
                className="block w-full rounded-lg bg-black shadow-2xl"
                aria-label="HaneFinans reklam videosu — buyuk"
              />
              <button
                type="button"
                onClick={closeModal}
                className="absolute -top-3 -right-3 grid h-11 w-11 place-items-center rounded-full bg-white text-black shadow-lg transition hover:scale-110 active:scale-95 sm:-top-5 sm:-right-5"
                aria-label="Kapat"
                title="Kapat (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
