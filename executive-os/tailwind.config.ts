import type { Config } from 'tailwindcss';
const v = (n: string) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), 'surface-2': v('surface-2'), border: v('border'),
        fg: v('fg'), muted: v('muted'), navy: v('navy'), 'navy-2': v('navy-2'), charcoal: v('charcoal'),
        gold: v('gold'), 'gold-soft': v('gold-soft'), pos: v('pos'), neg: v('neg'), warn: v('warn'), info: v('info'),
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'], mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)' },
    },
  },
  plugins: [],
} satisfies Config;
