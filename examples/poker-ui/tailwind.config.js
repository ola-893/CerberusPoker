/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0f0a',
        surface: '#111811',
        'surface-raised': '#1a2a1a',
        'table-felt': '#1a3a1a',
        'table-border': '#2d5a2d',
        'table-rail': '#3d7a3d',
        gold: '#c9a84c',
        'gold-dim': '#8a6f2e',
        'gold-glow': '#c9a84c33',
        fold: '#c0392b',
        call: '#2980b9',
        raise: '#c9a84c',
        'raise-dim': '#8a6f2e',
        allIn: '#8e44ad',
        check: '#4a4a4a',
        active: '#27ae60',
        waiting: '#f39c12',
        folded: '#4a4a4a',
        allInStatus: '#8e44ad',
        'card-face': '#f5f0e8',
        'card-back': '#1a3a6a',
        'suit-red': '#c0392b',
        'suit-black': '#1a1a1a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'gold-glow': '0 0 20px rgba(201, 168, 76, 0.3)',
      },
    },
  },
  plugins: [],
}
