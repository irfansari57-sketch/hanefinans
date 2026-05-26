import { useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdVideoProps {
  className?: string;
}

/**
 * HaneFinans reklam videosu — autoplay muted + tıklayınca unmute.
 * Hem desktop (RightNewsTicker) hem mobile (PanelPage) için kullanılır.
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
    <div className={cn('relative overflow-hidden rounded-lg border border-border bg-bg-card/40', className)}>
      <video
        ref={videoRef}
        src="/HaneFinans_FinancialIntelligence.mp4"
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className="block w-full cursor-pointer"
        aria-label="HaneFinans reklam videosu"
        onClick={toggleMute}
      />
      <button
        type="button"
        onClick={toggleMute}
        className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 hover:scale-110"
        aria-label={muted ? 'Sesi ac' : 'Sesi kapat'}
        title={muted ? 'Sesi ac' : 'Sesi kapat'}
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      {muted && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          Tikla sesi ac
        </div>
      )}
    </div>
  );
}
