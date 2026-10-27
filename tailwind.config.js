/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#090A0B',
          900: '#0B0C0E',
          850: '#111317',
          800: '#141619',
          750: '#16181C',
          700: '#1B1E22',
          600: '#1B1E22',
          500: '#2A2E35',
          400: '#454B55',
        },
        muted: '#8E8E93',
        brand: {
          50: '#E8F7FF',
          400: '#3B82F6',
          500: '#2563EB',
          600: '#1D4ED8',
        },
        hot: '#E54848',
        warm: '#E09228',
        cold: '#5B8DEF',
        win: '#27C272',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.45)',
        glow: '0 0 0 1px rgba(59,130,246,0.25), 0 8px 24px rgba(59,130,246,0.15)',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideRight: { from: { opacity: '0', transform: 'translateX(-8px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out',
        slideUp: 'slideUp 0.35s ease-out',
        slideRight: 'slideRight 0.3s ease-out',
        pulseSoft: 'pulseSoft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
