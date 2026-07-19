/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Semantic tokens — CSS variables defined in src/index.css as channel
        // triplets (e.g. "24 24 27"), wrapped here so Tailwind's opacity
        // modifiers (bg-surface/50) work correctly.
        surface: "rgb(var(--surface) / <alpha-value>)",
        surface2: "rgb(var(--surface2) / <alpha-value>)",
        surface3: "rgb(var(--surface3) / <alpha-value>)",
        surface4: "rgb(var(--surface4) / <alpha-value>)",
        // Named without their utility prefix (subtle/strong/primary/muted/faint)
        // so classes read as border-subtle, text-primary, etc. — not the
        // redundant border-border-subtle / text-text-primary.
        subtle: "rgb(var(--border-subtle) / <alpha-value>)",
        strong: "rgb(var(--border-strong) / <alpha-value>)",
        primary: "rgb(var(--text-primary) / <alpha-value>)",
        muted: "rgb(var(--text-muted) / <alpha-value>)",
        faint: "rgb(var(--text-faint) / <alpha-value>)",
        "accent-violet": "rgb(var(--accent-violet) / <alpha-value>)",
        "accent-blue": "rgb(var(--accent-blue) / <alpha-value>)",
        "accent-cyan": "rgb(var(--accent-cyan) / <alpha-value>)",
        "accent-amber": "rgb(var(--accent-amber) / <alpha-value>)",
        bull: "rgb(var(--bull) / <alpha-value>)",
        "bull-strong": "rgb(var(--bull-strong) / <alpha-value>)",
        bear: "rgb(var(--bear) / <alpha-value>)",
        "bear-strong": "rgb(var(--bear-strong) / <alpha-value>)",
      },
      boxShadow: {
        glow: "0 0 40px -10px rgb(var(--glow-violet) / 0.45)",
        "glow-sm": "0 0 20px -6px rgb(var(--glow-violet) / 0.35)",
        "glow-lg": "0 0 64px -12px rgb(var(--glow-violet) / 0.5)",
        card: "0 1px 2px rgb(0 0 0 / 0.4), 0 0 0 1px rgb(var(--border-subtle) / 0.6)",
        "inner-line": "inset 0 1px 0 0 rgb(255 255 255 / 0.03)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
