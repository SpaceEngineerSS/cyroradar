/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#050810',
          900: '#0b0f19',
          850: '#0e1525',
          800: '#111a2e',
          700: '#1a2744',
          600: '#24375e',
        },
        neon: {
          cyan: '#22d3ee',
          orange: '#f97316',
          purple: '#a78bfa',
          green: '#34d399',
          red: '#ef4444',
          blue: '#3b82f6',
        },
        ice: {
          100: '#e0f2fe',
          300: '#7dd3fc',
          500: '#22d3ee',
          700: '#0e7490',
        },
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'scan': 'scan 8s linear infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 4px rgba(34, 211, 238, 0.2)' },
          '100%': { boxShadow: '0 0 16px rgba(34, 211, 238, 0.4)' },
        },
        scan: {
          '0%': { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '0% 100%' },
        },
      },
    },
  },
  plugins: [],
};
