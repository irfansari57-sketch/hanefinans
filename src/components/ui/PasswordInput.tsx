import { useState, forwardRef } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Sol ikonu göster (varsayılan: true). Lock ikonu */
  showLockIcon?: boolean;
  /** Wrapper sınıfı override */
  containerClassName?: string;
}

/**
 * Şifre input'u — yanında göz ikonu ile aç/kapa toggle.
 * AuthPage, hesap silme, ileride şifre değiştirme gibi yerlerde kullanılır.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ showLockIcon = true, containerClassName, className, ...inputProps }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className={cn('relative', containerClassName)}>
        {showLockIcon && (
          <Lock size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        )}
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('input pr-10', showLockIcon && 'pl-9', className)}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 transition hover:bg-bg-card hover:text-slate-200"
          aria-label={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';
