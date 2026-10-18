/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#000000',
          900: '#09090B',
          850: '#0D0D11',
          800: '#111115',
          750: '#16161D',
          700: '#1B1B22',
          600: '#23232A',
          500: '#2A2A33',
          400: '#3A3A45',
        },
        muted: '#8E8E93',
        brand: {
          50: '#E8F7FF',
          400: '#3B82F6',
          500: '#2563EB',
          600: '#1D4ED8',
        },
        hot: '#EF4444',
        warm: '#F59E0B',
        cold: '#3B82F6',
        win: '#10B981',
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
