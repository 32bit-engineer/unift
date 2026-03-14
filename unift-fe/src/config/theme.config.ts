/**
 * Theme Configuration
 * Industrial design color scheme and styling
 */

export const THEME = {
  colors: {
    primary: '#E07B39',
    'background-light': '#f8f7f6',
    'background-dark': '#1C1E1A',
    'surface': '#232620',
    'surface-hover': '#2C2F28',
    'card-bg': '#232620',
    'input-bg': '#1C1E1A',
    'accent-text': '#E8E4DC',
    'border-muted': '#3a3a34',
    'recessed': '#161814',
    'warm-white': '#E8E4DC',
  },
  fonts: {
    display: '"Space Grotesk", sans-serif',
    ui: '"IBM Plex Sans", sans-serif',
    mono: '"IBM Plex Mono", monospace',
  },
  fontSize: {
    xs: '10px',
    sm: '13px',
    base: '15px',
    md: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
  },
  borderRadius: {
    none: '0px',
    sm: '0.125rem',
    md: '0.25rem',
    lg: '0.5rem',
    full: '0.75rem',
  },
} as const;

export const BREAKPOINTS = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;
