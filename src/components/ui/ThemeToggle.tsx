import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/store/theme';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * FVT tarzi kompakt tema butonu (2026-09-08 rewrite):
 * Buyuk pill switch yerine kucuk kare buton — Sun (aydinlik) veya Moon (karanlik).
 * Header'da minimum yer kaplar, mobilde de ayni davranista kalir.
 */
export function ThemeToggle({ className, size = 'md' }: ThemeToggleProps) {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const isDark = theme === 'dark';

  const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const iconSize = size === 'sm' ? 15 : 17;

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border border-border',
        'text-slate-500 hover:text-accent hover:bg-bg-card hover:border-accent/40',
        'transition-colors active:scale-95',
        dim,
        className,
      )}
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? 'Aydinlik moda gec' : 'Karanlik moda gec'}
      title={isDark ? 'Aydinlik moda gec' : 'Karanlik moda gec'}
    >
      {isDark ? <Sun size={iconSize} /> : <Moon size={iconSize} />}
    </button>
  );
}
