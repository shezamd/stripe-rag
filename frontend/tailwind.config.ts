import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas:   '#F5F4EE',
        surface:  '#FFFFFF',
        brand:    '#635BFF',
        primary:  '#1A1A1A',
        secondary:'#5F5E5A',
        tertiary: '#888780',
        'success-default': '#1D9E75',
        'success-bg':      '#E1F5EE',
        'success-fg':      '#0F6E56',
        'warning-bg':      '#FAEEDA',
        'warning-fg':      '#854F0B',
        'danger-bg':       '#FCEBEB',
        'danger-fg':       '#791F1F',
        'purple-bg':       '#EEEDFE',
        'purple-fg':       '#3C3489',
        'code-bg':         '#0A0A0F',
        'code-path':       '#B5D4F4',
        'code-value':      '#EF9F27',
        'code-muted':      '#888780',
        'code-green':      '#4DC77A',
        'code-purple':     '#A78BFA',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
