import { useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Paylasilacak URL - varsayilan: window.location.href */
  url?: string;
  /** Paylasim basligi (whatsapp/twitter'da alt satir olarak gorunur) */
  title?: string;
  /** Paylasim aciklamasi (bazi apps kullanir) */
  text?: string;
  /** Buton stili */
  variant?: 'icon' | 'button';
  /** Ekstra className */
  className?: string;
}

/**
 * ShareButton — Web Share API kullanir (mobil native share sheet).
 * Desteklemeyen browserlarda (masaustu Chrome/Firefox eski) link kopyalar.
 */
export function ShareButton({
  url,
  title = 'InvestliQ — Yatırımcılar İçin Akıllı Veri Platformu',
  text = 'BIST, TEFAS, kripto, döviz ve makro göstergeler için canlı fiyat ve günlük yorum.',
  variant = 'icon',
  className,
}: Props) {
  const [copied, setCopied] = useState(false);
  const shareUrl = url ?? (typeof window !== 'undefined' ? window.location.href : 'https://investliq.com');

  const handleShare = async () => {
    // Web Share API varsa (mobil + masaustu Chrome/Edge)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch (e) {
        // Kullanici iptal etti veya API basarisiz - fallback'e dus
        if ((e as Error).name === 'AbortError') return;
      }
    }
    // Fallback: link kopyala
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard yoksa prompt goster
      window.prompt('Bu linki kopyala:', shareUrl);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleShare}
        title="Paylaş"
        aria-label="Paylaş"
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg-card text-slate-400 transition',
          'hover:border-accent/40 hover:bg-accent/10 hover:text-accent',
          className,
        )}
      >
        {copied ? <Check size={15} /> : <Share2 size={15} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-card px-3 py-1.5 text-xs font-medium text-slate-300 transition',
        'hover:border-accent/40 hover:bg-accent/10 hover:text-accent',
        className,
      )}
    >
      {copied ? (
        <>
          <Check size={13} /> Kopyalandı
        </>
      ) : (
        <>
          <Share2 size={13} /> Paylaş
        </>
      )}
    </button>
  );
}
