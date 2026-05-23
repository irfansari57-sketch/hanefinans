import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Radix Dialog tabanlı modal. Public API geriye dönük uyumlu:
 *   <Modal open onClose={...} title="..." size="md">...</Modal>
 *
 * Radix ücretsiz olarak şunları sağlar:
 *   - Focus trap (modal içinde Tab dolanir, dışarı çıkamaz)
 *   - Focus restoration (kapanınca trigger element'ine geri dön)
 *   - Escape ile kapatma
 *   - Outside click ile kapatma
 *   - Body scroll lock
 *   - role="dialog" + aria-modal + aria-labelledby otomatik bağlanır
 *   - Portal — DOM'da en uste taşır, z-index kavgaları azalır
 */
interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Header'da gösterilir; ayrıca aria-labelledby ile bağlanır. */
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Açıklama metni — varsa aria-describedby ile bağlanır (görünmez). */
  description?: string;
}

export function Modal({ open, onClose, title, children, size = 'md', description }: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-bg-card shadow-2xl focus:outline-none',
            size === 'sm' && 'sm:max-w-sm',
            size === 'md' && 'sm:max-w-md',
            size === 'lg' && 'sm:max-w-3xl',
            size === 'xl' && 'sm:max-w-5xl',
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg-card px-4 py-3">
            {title ? (
              <Dialog.Title className="pr-2 text-sm font-semibold text-slate-100">
                {title}
              </Dialog.Title>
            ) : (
              <Dialog.Title className="sr-only">İletişim kutusu</Dialog.Title>
            )}
            {description && (
              <Dialog.Description className="sr-only">{description}</Dialog.Description>
            )}
            <Dialog.Close asChild>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-bg-soft hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <div className="p-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
