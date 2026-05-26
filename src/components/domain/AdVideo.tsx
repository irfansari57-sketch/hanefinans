import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdVideoProps {
  className?: string;
}

const VIDEO_SRC = '/HaneFinans_FinancialIntelligence.mp4';

/**
 * HaneFinans reklam videosu — autoplay muted + tikla unmute.
 * Genislet butonu modal pop-up'ta buyuk versiyonu acar.
 */
export function AdVideo({ className }: AdVideoProps) {
  const inlineRef = useRef<HTMLVideoElement>(null);
  const modalRef = useRef<HTMLVideoElement>(null);
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
    // Inline videoyu pause et — modal'da kendi videosu calisacak
    inlineRef.current?.pause();
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    // Modal kapaninca inline'i tekrar baslat
    inlineRef.current?.play().catch(() => { /* sessizce */ });
  };

  // Modal aciksa Escape ile kapat + body scroll kilitle
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

        {/* Sesi ac/kapat */}
        <button
          type="button"
          onClick={toggleMute}
          className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition hover:bg-black/85 active:scale-95"
          aria-label={muted ? 'Sesi ac' : 'Sesi kapat'}
          title={muted ? 'Sesi ac' : 'Sesi kapat'}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        {/* Buyut / pop-up'ta ac */}
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

      {/* Modal pop-up — buyuk video */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 sm:p-6"
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
              ref={modalRef}
              src={VIDEO_SRC}
              autoPlay
              controls
              loop
              playsInline
              preload="auto"
              className="block w-full rounded-lg shadow-2xl"
              aria-label="HaneFinans reklam videosu — buyuk"
            />
            <button
              type="button"
              onClick={closeModal}
              className="absolute -top-3 -right-3 grid h-10 w-10 place-items-center rounded-full bg-white text-black shadow-lg transition hover:scale-110 active:scale-95 sm:-top-4 sm:-right-4"
              aria-label="Kapat"
              title="Kapat (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
