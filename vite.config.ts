import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import purgecss from "vite-plugin-purgecss";
import type { PluginOption } from "vite";
// @ts-ignore - critters types issue with package.json exports
import Critters from "critters"; 
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

// Custom plugin to inline critical CSS using Critters
function criticalCssPlugin(): PluginOption {
  return {
    name: "critical-css",
    apply: "build",
    enforce: "post",
    closeBundle: async () => {
      const distPath = resolve(__dirname, "dist");
      const htmlPath = join(distPath, "index.html");
      
      if (!existsSync(htmlPath)) return;
      
      const critters = new Critters({
        path: distPath,
        publicPath: "/",
        inlineThreshold: 0,
        minimumExternalSize: 0,
        pruneSource: false,
        reduceInlineStyles: true,
        mergeStylesheets: true,
        preload: "swap",
        noscriptFallback: true,
      });
      
      try {
        const html = readFileSync(htmlPath, "utf-8");
        const processed = await critters.process(html);
        writeFileSync(htmlPath, processed);
        console.log("✓ Critical CSS inlined successfully");
      } catch (err) {
        console.warn("Critical CSS extraction skipped:", err);
      }
    },
  };
}

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
    mode === "production" && criticalCssPlugin(),
  ].filter(Boolean) as PluginOption[],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
