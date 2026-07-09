import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--primary)",
        paper: "var(--paper)",
        surface: "var(--surface)",
        ink: "var(--ink)",
      },
    },
  },
  plugins: [],
};
export default config;
