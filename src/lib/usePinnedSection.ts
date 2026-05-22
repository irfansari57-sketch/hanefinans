/**
 * usePinnedSection — kullanıcıya özel "pin" edilmiş açık/kapalı bölüm hook'u.
 *
 * Pin'lenince localStorage'da `fa.panel.accordion-pin.<id>.<userId>` anahtarında
 * saklanır (PinnableAccordion ile aynı namespace). Kullanıcı pin'lediği bölümleri
 * sonraki sayfa açılışında otomatik açık görür.
 *
 * Pin'siz durum: defaultOpen prop'u ile başlangıç açıklığı belirlenir, kullanıcı
 * akordeon başlığına tıklayıp kapatabilir/açabilir.
 */

import { useState, useEffect, useCallback, type MouseEvent } from 'react';
import { useAuth } from '@/store/auth';

function pinKey(id: string, userId: string | number | null | undefined): string {
  return `fa.panel.accordion-pin.${id}.${userId ?? 'anon'}`;
}

export interface PinnedSectionState {
  /** Şu an pinli mi. */
  pinned: boolean;
  /** Şu an açık mı. */
  open: boolean;
  /** <details> onToggle handler. */
  onToggle: (e: React.SyntheticEvent<HTMLDetailsElement>) => void;
  /** Pin tuşunun onClick handler'ı. */
  togglePin: (e: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * @param defaultOpen Desktop'ta varsayılan açıklık (md ve üzeri).
 * @param mobileDefaultOpen Mobilde varsayılan açıklık (md altı). Belirtilmezse
 *   defaultOpen kullanılır. Mobilde kompakt görünüm için çoğunlukla `false`.
 */
export function usePinnedSection(
  id: string,
  defaultOpen = true,
  mobileDefaultOpen?: boolean,
): PinnedSectionState {
  const user = useAuth((s) => s.user);
  const userId = user?.id ?? 'anon';
  const key = pinKey(id, userId);

  // Tek seferlik mobil tespiti — SSR güvenli, sonradan değişimi dinlemiyoruz
  // çünkü kullanıcı pencereyi resize ederse zaten state'i yönetir.
  const isMobile = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 767px)').matches;
  const initialDefault = isMobile && mobileDefaultOpen !== undefined ? mobileDefaultOpen : defaultOpen;

  const [pinned, setPinned] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(initialDefault);

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      const isPinned = v === '1';
      setPinned(isPinned);
      // Pin'liyse aç; değilse initialDefault'a göre davran.
      setOpen(isPinned || initialDefault);
    } catch {
      /* localStorage erişiminde sorun varsa default'a düş */
    }
  }, [key, initialDefault]);

  const onToggle = useCallback((e: React.SyntheticEvent<HTMLDetailsElement>) => {
    setOpen((e.currentTarget as HTMLDetailsElement).open);
  }, []);

  const togglePin = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !pinned;
    setPinned(next);
    try {
      localStorage.setItem(key, next ? '1' : '0');
    } catch {
      /* yoksay */
    }
    // Pin'lerken kart kapalıysa otomatik aç.
    if (next) setOpen(true);
  }, [pinned, key]);

  return { pinned, open, onToggle, togglePin };
}
