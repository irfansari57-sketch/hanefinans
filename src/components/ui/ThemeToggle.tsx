import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/store/theme';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Aydinlik / karanlik mod switch'i.
 * Tek tikla theme'i toggle eder. localStorage'a persist eder.
 */
export function ThemeToggle({ className, size = 'md' }: ThemeToggleProps) {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const isDark = theme === 'dark';

  const dim = size === 'sm' ? 'h-7 w-12' : 'h-8 w-14';
  const knob = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  const iconSize = size === 'sm' ? 11 : 13;

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'relative inline-flex items-center rounded-full border border-border transition-colors',
        isDark ? 'bg-bg-soft' : 'bg-accent/15',
        dim,
        className,
      )}
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? 'Aydinlik moda gec' : 'Karanlik moda gec'}
      title={isDark ? 'Aydinlik moda gec' : 'Karanlik moda gec'}
    >
      {/* Sun (light hedef) */}
      <span
        className={cn(
          'absolute left-1.5 flex items-center justify-center transition-opacity',
          isDark ? 'opacity-40 text-slate-400' : 'opacity-0',
        )}
        aria-hidden
      >
        <Sun size={iconSize} />
      </span>
      {/* Moon (dark hedef) */}
      <span
        className={cn(
          'absolute right-1.5 flex items-center justify-center transition-opacity',
          isDark ? 'opacity-0' : 'opacity-40 text-slate-700',
        )}
        aria-hidden
      >
        <Moon size={iconSize} />
      </span>
      {/* Knob */}
      <span
        className={cn(
          'absolute top-1 grid place-items-center rounded-full shadow-md transition-all',
          knob,
          isDark
            ? 'left-1 bg-slate-700 text-warning'
            : 'left-[calc(100%-1.5rem-0.25rem)] bg-white text-accent',
        )}
      >
        {isDark ? <Moon size={iconSize} /> : <Sun size={iconSize} />}
      </span>
    </button>
  );
}
