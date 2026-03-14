import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'

export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand ──
        primary:        '#E07B39',
        'primary-dim':  '#A0562A',

        // ── Surfaces ──
        'bg-base':      '#1C1E1A',
        'bg-panel':     '#161814',
        'bg-raised':    '#212420',
        surface:        '#232620',
        'surface-hover':'#2C2F28',
        recessed:       '#161814',

        // ── Borders ──
        'border-muted':  'rgba(232,228,220,0.10)',
        'border-medium': 'rgba(232,228,220,0.18)',
        'border-subtle': 'rgba(255,255,255,0.10)',

        // ── Text ──
        'text-warm':    '#E8E4DC',
        'warm-white':   '#E8E4DC',

        // ── Status ──
        'status-ok':    '#5a9e6f',
        'status-err':   '#c03939',
      },
      fontFamily: {
        sans:  ['"IBM Plex Sans"',  'sans-serif'],
        mono:  ['"IBM Plex Mono"',  'monospace'],
      },
      fontSize: {
        'ui-xs': ['10px', { letterSpacing: '0.08em' }],
        'ui-sm': ['12px', { lineHeight: '1.5' }],
        'ui-md': ['13px', { lineHeight: '1.6' }],
        'ui-lg': ['15px', { lineHeight: '1.4' }],
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg:      '0.25rem',
        xl:      '0.5rem',
        full:    '0.75rem',
      },
      boxShadow: {
        'recessed': 'inset 2px 2px 4px rgba(0,0,0,0.4)',
        'panel':    '0 0 0 1px rgba(232,228,220,0.05), 0 10px 30px -10px rgba(0,0,0,0.7)',
      },
    },
  },
  plugins: [forms],
} satisfies Config
