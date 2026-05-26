import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX, Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdVideoProps {
  className?: string;
}

const VIDEO_SRC = '/HaneFinans_FinancialIntelligence.mp4';

/**
 * HaneFinans reklam videosu — autoplay muted + tikla unmute.
 * Genislet butonu modal pop-up'ta buyuk versiyonu acar (React Portal
 * ile body'ye render edilir, ata containing block sorunlari onlenir).
 */
export function AdVideo({ className }: AdVideoProps) {
  const inlineRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [open, setOpen] = useState(false);

  const toggleMute = () => {
    const v = inlineRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    if (!next) {
      v.play().catch(() => { /* sessizce */ });
    }
    setMuted(next);
  };

  const openModal = () => {
    inlineRef.current?.pause();
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    inlineRef.current?.play().catch(() => { /* sessizce */ });
  };

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
      <div
        className={cn(
          'relative aspect-video min-h-[180px] w-full overflow-hidden rounded-lg border border-border bg-black',
          className,
        )}
      >
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
          onClick={toggleMute}
        />

        <button
          type="button"
          onClick={toggleMute}
          className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition hover:bg-black/85 active:scale-95"
          aria-label={muted ? 'Sesi ac' : 'Sesi kapat'}
          title={muted ? 'Sesi ac' : 'Sesi kapat'}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        <button
          type="button"
          onClick={openModal}
          className="absolute bottom-2 right-12 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition hover:bg-black/85 active:scale-95"
          aria-label="Tam ekran ac"
          title="Buyut"
        >
          <Maximize2 size={15} />
        </button>

        {muted && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            Tikla sesi ac
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
