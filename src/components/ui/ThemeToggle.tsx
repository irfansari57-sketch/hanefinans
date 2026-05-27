import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/store/theme';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Aydinlik / karanlik mod switch'i — belirgin renkli pill.
 */
export function ThemeToggle({ className, size = 'md' }: ThemeToggleProps) {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const isDark = theme === 'dark';

  const dim = size === 'sm' ? 'h-8 w-16' : 'h-9 w-20';
  const knob = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
  const iconSize = size === 'sm' ? 13 : 15;
  const knobOffset = '0.25rem';
  const knobWidth = size === 'sm' ? '1.5rem' : '1.75rem';

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'group relative inline-flex shrink-0 items-center rounded-full border-2 transition-all',
        'shadow-md hover:shadow-lg active:scale-95',
        isDark
          ? 'border-accent/60 bg-gradient-to-r from-slate-800 to-slate-900 shadow-accent/20'
          : 'border-accent bg-gradient-to-r from-sky-100 to-sky-50 shadow-accent/30',
        dim,
        className,
      )}
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? 'Aydinlik moda gec' : 'Karanlik moda gec'}
      title={isDark ? 'Aydinlik moda gec' : 'Karanlik moda gec'}
    >
      {/* Sol arkaplan icon — light hedef gosterimi */}
      <span
        className={cn(
          'absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center transition-opacity',
          isDark ? 'opacity-70 text-warning' : 'opacity-0',
        )}
        aria-hidden
      >
        <Sun size={iconSize} />
      </span>
      {/* Sag arkaplan icon — dark hedef gosterimi */}
      <span
        className={cn(
          'absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center transition-opacity',
          isDark ? 'opacity-0' : 'opacity-70 text-accent',
        )}
        aria-hidden
      >
        <Moon size={iconSize} />
      </span>
      {/* Knob — dikeyde her zaman tam ortali (border-2 hesabini bertaraf eder) */}
      <span
        className={cn(
          'absolute grid place-items-center rounded-full shadow-lg ring-1 transition-all duration-300',
          knob,
          isDark
            ? 'bg-gradient-to-br from-slate-100 to-slate-300 text-slate-900 ring-white/40'
            : 'bg-gradient-to-br from-accent to-sky-600 text-white ring-accent/40',
        )}
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          left: isDark ? knobOffset : `calc(100% - ${knobWidth} - ${knobOffset})`,
        }}
      >
        {isDark ? <Moon size={iconSize} /> : <Sun size={iconSize} />}
      </span>
    </button>
  );
}
