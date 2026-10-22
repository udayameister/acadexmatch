import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Maroon / ivory / muted-gold identity. "brand" = maroon, "gold" = muted gold.
        brand: {
          950: "#3A0A14",
          900: "#800000",
          800: "#5A1020",
          700: "#8E1B2B",
          600: "#A3283A",
          500: "#B84A57",
          400: "#D48A92",
          300: "#E0A8AE",
          200: "#EBC4C7",
          100: "#F4DEDF",
          50: "#F9EEEE",
        },
        gold: {
          900: "#46340F",
          800: "#5E461D",
          700: "#7A5B26",
          600: "#94702F",
          500: "#B48A3E",
          400: "#C6A15B",
          300: "#D9BD85",
          200: "#E8D5AC",
          100: "#F3E8D2",
          50: "#FBF6EC",
        },
        // Warm neutrals replace the cool slate greys site-wide; dark shades are maroon for headings.
        slate: {
          950: "#3A0A14",
          900: "#5A1020",
          800: "#6E2230",
          700: "#4E3B3F",
          600: "#5F4D51",
          500: "#76656A",
          400: "#A48F8D",
          300: "#D6C5BB",
          200: "#EADFD6",
          100: "#F4ECE5",
          50: "#F8F3EF",
        },
        ivory: "#FFFDF8",
        cream: "#F8F3EF",
        blush: "#F9EEEE",
        emerald: {
          800: "#065F46",
          700: "#047857",
          600: "#059669",
          500: "#10B981",
          100: "#D1FAE5",
          50: "#ECFDF5",
        },
        crimson: {
          700: "#B91C1C",
          600: "#DC2626",
          500: "#EF4444",
          100: "#FEE2E2",
          50: "#FEF2F2",
        },
      },
      fontFamily: {
        // DM Sans everywhere: serif/mono utilities are mapped to it too.
        sans: ["var(--font-dm-sans)", "DM Sans", "system-ui", "sans-serif"],
        serif: ["var(--font-dm-sans)", "DM Sans", "system-ui", "sans-serif"],
        mono: ["var(--font-dm-sans)", "DM Sans", "system-ui", "sans-serif"],
      },
      boxShadow: {
        'academic': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'academic-card': '0 4px 6px -1px rgba(90, 16, 32, 0.05), 0 2px 4px -2px rgba(90, 16, 32, 0.05)',
        'academic-hover': '0 10px 15px -3px rgba(90, 16, 32, 0.08), 0 4px 6px -4px rgba(90, 16, 32, 0.04)',
        'glow-gold': '0 0 20px -3px rgba(198, 161, 91, 0.35)',
        'glow-blue': '0 0 20px -3px rgba(128, 0, 0, 0.22)',
      },
    },
  },
  plugins: [],
};
export default config;
