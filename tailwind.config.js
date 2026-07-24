/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Inter Display"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // "Precision Intelligence" system — neutral white/slate foundation,
        // Indigo-500 primary, Violet-500 reserved for AI/generative content.
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        // Safety-net dark tokens (kept blue, never black/neutral) for any
        // remaining solid-dark-card usage.
        ink: '#4338CA',
        'ink-2': '#4F46E5',
        primary: '#6366F1',
        'on-primary': '#ffffff',
        'primary-container': '#E0E7FF',
        'on-primary-container': '#3730A3',
        // AI accent lane — reserved for generative/ML-labeled content only.
        secondary: '#8B5CF6',
        'on-secondary': '#ffffff',
        'secondary-container': '#EDE9FE',
        'on-secondary-container': '#5B21B6',
        'surface-main': '#F8FAFC',
        'surface-card': '#FFFFFF',
        'surface-container-low': '#F8FAFC',
        'surface-container': '#F1F5F9',
        'surface-container-high': '#E2E8F0',
        'on-surface': '#111827',
        'on-surface-variant': '#6B7280',
        'border-subtle': '#E5E7EB',
        'outline-variant': '#E5E7EB',
        'indigo-tint': '#EEF2FF',
        'red-tint': '#FEF2F2',
        'orange-tint': '#FFFBEB',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#DC2626',
      },
      boxShadow: {
        // Level 1 (cards): dual-stage — tight stroke-like shadow + soft ambient drop.
        'soft':       '0 1px 2px 0 rgb(0 0 0 / 0.08), 0 12px 24px -8px rgb(0 0 0 / 0.04)',
        'soft-md':    '0 2px 4px 0 rgb(0 0 0 / 0.08), 0 16px 28px -8px rgb(0 0 0 / 0.06)',
        // Level 2 (dropdowns/popovers): higher elevation for temporary interaction.
        'soft-lg':    '0 10px 25px 0 rgb(0 0 0 / 0.10)',
        'soft-xl':    '0 20px 25px -5px rgb(0 0 0 / 0.12), 0 8px 10px -6px rgb(0 0 0 / 0.06)',
        'glow-blue':  '0 0 0 3px rgb(99 102 241 / 0.15)',
        'glow-red':   '0 0 0 3px rgb(220 38 38 / 0.15)',
        'inner-soft': 'inset 0 1px 2px 0 rgb(0 0 0 / 0.06)',
      },
      backgroundImage: {
        'gradient-brand':    'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
        'gradient-success':  'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'gradient-danger':   'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
        'gradient-warning':  'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        'gradient-mesh':     'radial-gradient(at 20% 0%, rgba(99,102,241,0.10) 0px, transparent 50%), radial-gradient(at 100% 50%, rgba(139,92,246,0.08) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(99,102,241,0.06) 0px, transparent 50%)',
      },
      keyframes: {
        'fade-in':         { '0%': { opacity: '0' },                                  '100%': { opacity: '1' } },
        'fade-in-up':      { '0%': { opacity: '0', transform: 'translateY(8px)' },    '100%': { opacity: '1', transform: 'translateY(0)' } },
        'scale-in':        { '0%': { opacity: '0', transform: 'scale(0.96)' },        '100%': { opacity: '1', transform: 'scale(1)' } },
        'slide-up':        { '0%': { transform: 'translateY(100%)' },                 '100%': { transform: 'translateY(0)' } },
        'shimmer':         { '0%': { backgroundPosition: '-1000px 0' },               '100%': { backgroundPosition: '1000px 0' } },
        'pulse-soft':      { '0%, 100%': { opacity: '1' },                            '50%': { opacity: '0.6' } },
      },
      animation: {
        'fade-in':    'fade-in 0.2s ease-out',
        'fade-in-up': 'fade-in-up 0.25s ease-out',
        'scale-in':   'scale-in 0.18s ease-out',
        'slide-up':   'slide-up 0.25s ease-out',
        'shimmer':    'shimmer 2s linear infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
