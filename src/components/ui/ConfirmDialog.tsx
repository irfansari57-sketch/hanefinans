import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';

/**
 * Radix AlertDialog tabanlı onay kutusu — role="alertdialog" semantik bağlamı
 * verir (Modal'dan farklı: AT'lar daha güçlü duyurur, otomatik focus'u
 * Cancel butonuna verir, Escape ile sadece Cancel tetiklenir).
 *
 * Mevcut API geriye dönük uyumlu:
 *   <ConfirmDialog open message="..." onConfirm={...} onCancel={...} />
 */
interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title = 'Emin misin?',
  message,
  confirmText = 'Onayla',
  cancelText = 'Vazgeç',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(o) => {
        // ESC veya overlay click — cancel olarak işle
        if (!o) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <AlertDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-bg-card shadow-2xl focus:outline-none sm:max-w-sm',
          )}
        >
          <div className="border-b border-border px-4 py-3">
            <AlertDialog.Title className="text-sm font-semibold text-slate-100">
              {title}
            </AlertDialog.Title>
          </div>
          <div className="p-4">
            <AlertDialog.Description className="text-sm text-slate-300">
              {message}
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <button type="button" className="btn-secondary" onClick={onCancel}>
                  {cancelText}
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className={destructive ? 'btn-danger' : 'btn-primary'}
                  onClick={onConfirm}
                >
                  {confirmText}
                </button>
              </AlertDialog.Action>
            </div>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
