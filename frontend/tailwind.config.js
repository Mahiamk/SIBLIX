/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Lexend', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Lexend', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas: {
          light: '#F8F9FA',
          subtle: '#F1F3F5',
          dark: '#0E1116',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#161922',
        },
        // Luma-style muted colors
        slate: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },
        // Tempest Monolith - Violent Storm Monochromatic Palette
        brand: {
          50: '#F0F4F8',   // Ozone Glare / Diffuse Cloud Flash
          100: '#D3DCE6',  // Cold Lightning Halo
          200: '#A5B4C7',  // Cirrus Haze
          300: '#7F8EA3',  // Misty Gale
          400: '#606E84',  // Downpour Slate
          500: '#323B4A',  // Turbulent Squall
          600: '#171B24',  // Thunderhead Pitch (Signature Primary Action & Headline Accent)
          700: '#0F1218',  // Obsidian Nimbus
          800: '#07080B',  // Abyssal Vortex
          900: '#030406',  // Deep Singularity
          // Monochromatic Undertone Accents
          ozone: '#1E2836',   // Ionized Steel Slate
          sulfur: '#262320',  // Warm Ash Turbulence
          strobe: '#CBD7E5',  // Electrified Edge Silver
        },
        logo: {
          DEFAULT: '#717486',
          light: '#888B9C',
          dark: '#5C5F70',
        },
        sage: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
        },
        coral: {
          50: '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          300: '#FDA4AF',
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
          700: '#BE123C',
        },
        amber: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        teal: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E',
        },
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        card: '0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 4px 16px -4px rgba(15, 23, 42, 0.06)',
        lift: '0 8px 30px -6px rgba(15, 23, 42, 0.1)',
        popover: '0 12px 36px -8px rgba(15, 23, 42, 0.14)',
      },
    },
  },
  plugins: [],
}
