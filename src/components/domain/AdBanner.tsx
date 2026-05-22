import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdItem {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  url: string;
  gradient: string; // tailwind gradient classes
  badge?: string;   // sol üstte küçük rozet
  textTone?: string; // ana metin rengi
}

/**
 * Sıralı reklam banner'ı — 8 sn'de bir döner.
 * Şu an placeholder içerikler; gerçek affiliate linkleri için ADS dizisini güncelle.
 */
const ADS: AdItem[] = [
  {
    id: 'midas',
    title: 'BIST\'e Sıfır Komisyon',
    subtitle: 'Midas ile hisse al-sat — yıllık üyelik ücreti yok, tek tıkla başla',
    cta: 'Hesap Aç',
    url: 'https://midas.com.tr',
    gradient: 'from-emerald-600 via-teal-600 to-cyan-700',
    badge: 'ARACI KURUM',
  },
  {
    id: 'garanti-yatirim',
    title: 'Garanti BBVA Yatırım',
    subtitle: 'Banka entegrasyonu, BIST + döviz + altın tek hesapta',
    cta: 'İncele',
    url: 'https://www.garantibbvayatirim.com.tr',
    gradient: 'from-green-700 via-emerald-700 to-green-800',
    badge: 'BANKA',
  },
  {
    id: 'kuveyt-portfoy',
    title: 'Yerli + Yabancı Hisse Fonları',
    subtitle: 'Kuveyt Türk Portföy — global fırsatlara TL ile eriş',
    cta: 'Hemen İncele',
    url: 'https://www.kuveytturkportfoy.com.tr',
    gradient: 'from-teal-700 via-cyan-700 to-blue-700',
    badge: 'PORTFÖY',
  },
  {
    id: 'fintables-pro',
    title: 'Fintables PRO',
    subtitle: 'Hisse + fon detay analizi, gelişmiş ekran, EVO ile filtreleme',
    cta: 'Ücretsiz Dene',
    url: 'https://fintables.com',
    gradient: 'from-violet-700 via-purple-700 to-fuchsia-700',
    badge: 'ANALİZ',
  },
  {
    id: 'paribu',
    title: 'Türkiye\'nin Kripto Borsası',
    subtitle: 'Paribu ile BTC, ETH, USDT — TL ile anlık alım',
    cta: 'Üye Ol',
    url: 'https://www.paribu.com',
    gradient: 'from-amber-600 via-orange-600 to-red-600',
    badge: 'KRİPTO',
  },
];

interface Props {
  /** Görünüm: tam-en banner (Panel/Günlük Analiz üstü) vs küçük satır (yan menü) */
  variant?: 'wide' | 'compact';
  className?: string;
}

export function AdBanner({ variant = 'wide', className }: Props) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % ADS.length), 8000);
    return () => clearInterval(id);
  }, []);

  const ad = ADS[idx];

  if (variant === 'compact') {
    return (
      <a
        href={ad.url}
        target="_blank"
        rel="noopener sponsored noreferrer"
        className={cn(
          'group block rounded-lg bg-gradient-to-r p-3 transition hover:brightness-110',
          ad.gradient,
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/80">{ad.badge ?? 'Sponsor'}</div>
            <div className="mt-0.5 text-sm font-bold text-white truncate">{ad.title}</div>
          </div>
          <ExternalLink size={14} className="shrink-0 text-white/80 transition group-hover:translate-x-0.5" />
        </div>
      </a>
    );
  }

  return (
    <a
      href={ad.url}
      target="_blank"
      rel="noopener sponsored noreferrer"
      className={cn(
        'group relative block overflow-hidden rounded-xl bg-gradient-to-r shadow-md transition hover:shadow-lg hover:brightness-110',
        ad.gradient,
        className,
      )}
    >
      {/* Dekoratif blob */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-black/10 blur-3xl" />

      <div className="relative flex flex-wrap items-center gap-4 p-4 sm:p-5">
        {ad.badge && (
          <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
            {ad.badge}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-white sm:text-lg">{ad.title}</h3>
          <p className="mt-0.5 text-xs text-white/85 sm:text-sm">{ad.subtitle}</p>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/90 px-3 py-2 text-xs font-bold text-slate-900 transition group-hover:bg-white sm:text-sm">
          {ad.cta}
          <ExternalLink size={12} />
        </span>
      </div>

      {/* Banner alt indicator (sıralı reklamlar) */}
      <div className="relative flex justify-center gap-1 pb-2">
        {ADS.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 rounded-full transition-all',
              i === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/40',
            )}
          />
        ))}
      </div>

      <span className="absolute right-2 top-2 rounded bg-black/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/80 backdrop-blur-sm">
        Sponsor
      </span>
    </a>
  );
}
