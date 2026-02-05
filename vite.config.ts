import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import purgecss from "vite-plugin-purgecss";
import type { PluginOption } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "production" && (purgecss({
      content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
      ],
      safelist: {
        standard: [
          /^data-/,
          /^aria-/,
          /^::/,
          /dark/,
          /animate-/,
          /transition-/,
          /transform/,
          /scale-/,
          /opacity-/,
          /translate-/,
          /rotate-/,
          /skew-/,
          /origin-/,
          /duration-/,
          /ease-/,
          /delay-/,
        ],
        deep: [
          /radix/,
          /cmdk/,
          /sonner/,
          /vaul/,
        ],
        greedy: [
          /\[data-state/,
          /\[data-side/,
          /\[data-orientation/,
        ],
      },
    }) as PluginOption),
  ].filter(Boolean) as PluginOption[],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
