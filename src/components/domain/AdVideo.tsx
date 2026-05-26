import { useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdVideoProps {
  className?: string;
}

/**
 * HaneFinans reklam videosu — autoplay muted + tikla unmute.
 * Hem desktop (RightNewsTicker) hem mobile (PanelPage) icin kullanilir.
 * Mobile uyumu: aspect-video + min-height ile zero-height collapse engellenir.
 */
export function AdVideo({ className }: AdVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    if (!next) {
      v.play().catch(() => { /* sessizce */ });
    }
    setMuted(next);
  };

  return (
    <div
      className={cn(
        'relative aspect-video min-h-[180px] w-full overflow-hidden rounded-lg border border-border bg-black',
        className,
      )}
    >
      <video
        ref={videoRef}
        src="/HaneFinans_FinancialIntelligence.mp4"
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
      {muted && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          Tikla sesi ac
        </div>
      )}
    </div>
  );
}
