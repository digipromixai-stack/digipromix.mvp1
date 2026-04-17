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
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      boxShadow: {
        // Soft, modern shadows
        'soft':       '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'soft-md':    '0 4px 6px -1px rgb(15 23 42 / 0.06), 0 2px 4px -2px rgb(15 23 42 / 0.05)',
        'soft-lg':    '0 10px 15px -3px rgb(15 23 42 / 0.08), 0 4px 6px -4px rgb(15 23 42 / 0.05)',
        'soft-xl':    '0 20px 25px -5px rgb(15 23 42 / 0.10), 0 8px 10px -6px rgb(15 23 42 / 0.06)',
        'glow-blue':  '0 0 0 4px rgb(59 130 246 / 0.12)',
        'glow-red':   '0 0 0 4px rgb(239 68 68 / 0.12)',
        'inner-soft': 'inset 0 1px 2px 0 rgb(15 23 42 / 0.06)',
      },
      backgroundImage: {
        'gradient-brand':    'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
        'gradient-success':  'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'gradient-danger':   'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        'gradient-warning':  'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        'gradient-mesh':     'radial-gradient(at 20% 0%, rgba(59,130,246,0.10) 0px, transparent 50%), radial-gradient(at 100% 50%, rgba(99,102,241,0.10) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(168,85,247,0.08) 0px, transparent 50%)',
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
