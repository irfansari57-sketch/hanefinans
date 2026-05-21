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

export function usePinnedSection(id: string, defaultOpen: boolean = true): PinnedSectionState {
  const user = useAuth((s) => s.user);
  const userId = user?.id ?? 'anon';
  const key = pinKey(id, userId);

  const [pinned, setPinned] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(defaultOpen);

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      const isPinned = v === '1';
      setPinned(isPinned);
      // Pin'liyse aç; değilse defaultOpen'a göre davran.
      setOpen(isPinned || defaultOpen);
    } catch {
      /* localStorage erişiminde sorun varsa default'a düş */
    }
  }, [key, defaultOpen]);

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
