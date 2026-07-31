/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc8fc',
          400: '#36abfa',
          500: '#0c8ef2',
          60: '#0066ff',
          600: '#026ed9',
          700: '#0357b0',
          800: '#074a91',
          900: '#0c3e78',
          950: '#09274f',
        },
        accent: {
          cyan: '#00F0FF',
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#F43F5E',
          purple: '#8B5CF6',
        },
        dark: {
          bg: '#0B0F17',
          card: '#131B2A',
          border: '#1E293B',
          hover: '#1E293B',
          subtle: '#0F172A',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-blue': '0 0 20px -5px rgba(0, 102, 255, 0.4)',
        'glow-cyan': '0 0 20px -5px rgba(0, 240, 255, 0.4)',
        'glow-emerald': '0 0 20px -5px rgba(16, 185, 129, 0.4)',
        'glow-rose': '0 0 20px -5px rgba(244, 63, 94, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 102, 255, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 102, 255, 0.6)' },
        }
      }
    },
  },
  plugins: [],
}
