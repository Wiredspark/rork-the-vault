import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ['"Unbounded"', '"DM Mono"', "sans-serif"],
        sans: ['"Manrope"', "system-ui", "sans-serif"],
        mono: ['"DM Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        vault: {
          ink: "#0B1210",
          panel: "#101815",
          surface: "#151E1A",
          raised: "#1B2621",
          line: "#263230",
          neon: "#CFAB5C",
          neonhi: "#EAD9A8",
          neondeep: "#9A7B3F",
          ice: "#F1EEE3",
          muted: "#8C948B",
          success: "#3FE0A8",
          danger: "#FF5A64",
        },
        round: "rgb(var(--round-rgb) / <alpha-value>)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "digit-flip": {
          "0%": { transform: "perspective(600px) rotateX(92deg)", opacity: "0", filter: "brightness(2)" },
          "55%": { transform: "perspective(600px) rotateX(-14deg)", opacity: "1" },
          "75%": { transform: "perspective(600px) rotateX(6deg)" },
          "100%": { transform: "perspective(600px) rotateX(0deg)", filter: "brightness(1)" },
        },
        "digit-earned": {
          "0%": { boxShadow: "0 0 0 0 rgba(207,171,92,0)" },
          "35%": { boxShadow: "0 0 22px 3px rgba(234,217,168,0.6)" },
          "100%": { boxShadow: "0 0 12px -2px rgba(207,171,92,0.55)" },
        },
        "streak-pop": {
          "0%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(207,171,92,0)" },
          "35%": { transform: "scale(1.28)", boxShadow: "0 0 28px 6px rgba(234,217,168,0.55)" },
          "60%": { transform: "scale(0.94)" },
          "80%": { transform: "scale(1.06)" },
          "100%": { transform: "scale(1)", boxShadow: "0 0 14px 1px rgba(207,171,92,0.35)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "15%": { transform: "translateX(-10px)" },
          "30%": { transform: "translateX(9px)" },
          "45%": { transform: "translateX(-7px)" },
          "60%": { transform: "translateX(5px)" },
          "75%": { transform: "translateX(-3px)" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "round-sweep": {
          from: { transform: "scaleX(0)", opacity: "0" },
          "40%": { opacity: "1" },
          to: { transform: "scaleX(1)", opacity: "1" },
        },
        "round-title": {
          from: { opacity: "0", letterSpacing: "0.06em", filter: "blur(6px)" },
          to: { opacity: "1", letterSpacing: "0", filter: "blur(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 1px rgba(207,171,92,0.5), 0 0 18px 0 rgba(207,171,92,0.18)" },
          "50%": { boxShadow: "0 0 0 1px rgba(234,217,168,0.9), 0 0 34px 4px rgba(207,171,92,0.38)" },
        },
        "door-reveal": {
          "0%": { opacity: "0", transform: "scale(1.25)", filter: "brightness(0.2) blur(6px)" },
          "100%": { opacity: "1", transform: "scale(1)", filter: "brightness(1) blur(0)" },
        },
        "dial-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "timer-urgent": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "digit-flip": "digit-flip 0.75s cubic-bezier(0.2, 0.9, 0.25, 1.2) both",
        "digit-earned": "digit-earned 1.6s ease-out both",
        "streak-pop": "streak-pop 0.7s cubic-bezier(0.3, 1.6, 0.5, 1) both",
        shake: "shake 0.5s ease-in-out",
        "rise-in": "rise-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "round-sweep": "round-sweep 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s both",
        "round-title": "round-title 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) 0.15s both",
        "glow-pulse": "glow-pulse 2.4s ease-in-out infinite",
        "door-reveal": "door-reveal 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "dial-spin": "dial-spin 1.6s cubic-bezier(0.6, 0, 0.2, 1) both",
        "timer-urgent": "timer-urgent 0.6s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
