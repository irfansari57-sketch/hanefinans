/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Theme — CSS variable bazlı, dark default + light alternatif
        bg: {
          DEFAULT: 'rgb(var(--c-bg) / <alpha-value>)',
          soft: 'rgb(var(--c-bg-soft) / <alpha-value>)',
          card: 'rgb(var(--c-bg-card) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--c-border) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          fg: 'rgb(var(--c-accent-fg) / <alpha-value>)',
        },
        success: 'rgb(var(--c-success) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        neutral: 'rgb(var(--c-neutral) / <alpha-value>)',
        fg: {
          DEFAULT: 'rgb(var(--c-text-1) / <alpha-value>)',
          2: 'rgb(var(--c-text-2) / <alpha-value>)',
          3: 'rgb(var(--c-text-3) / <alpha-value>)',
        },
        viz: {
          1: 'rgb(var(--viz-1) / <alpha-value>)', 2: 'rgb(var(--viz-2) / <alpha-value>)', 3: 'rgb(var(--viz-3) / <alpha-value>)',
          4: 'rgb(var(--viz-4) / <alpha-value>)', 5: 'rgb(var(--viz-5) / <alpha-value>)', 6: 'rgb(var(--viz-6) / <alpha-value>)',
        },
      },
      height: { row: 'var(--row-h)', chip: 'var(--chip-h)' },
      fontSize: { table: ['var(--table-fs)', { lineHeight: 'var(--table-lh)' }] },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
