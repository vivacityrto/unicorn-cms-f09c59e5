import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import type { PluginOption } from "vite";
// @ts-expect-error - beasties types issue with package.json exports
import Beasties from "beasties";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

// One build ID per build invocation. Injected into the bundle via `define`
// and written to dist/version.json so the runtime poll can detect new deploys.
const BUILD_ID = Date.now().toString(36);

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
      
      const critters = new Beasties({
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

// Overwrite dist/version.json with the real build ID so the runtime
// deploy-detection poll (src/utils/versionCheck.ts) has something real to compare against.
function versionJsonPlugin(): PluginOption {
  return {
    name: "version-json",
    apply: "build",
    enforce: "post",
    closeBundle: () => {
      const distPath = resolve(__dirname, "dist");
      const versionPath = join(distPath, "version.json");
      try {
        writeFileSync(versionPath, JSON.stringify({ buildId: BUILD_ID }));
        console.log(`✓ Wrote dist/version.json with buildId=${BUILD_ID}`);
      } catch (err) {
        console.warn("Failed to write version.json:", err);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Nested git worktrees under this repo (.claude/worktrees/, .worktrees/,
    // worktrees/) each carry a full copy of index.html + node_modules. Vite's
    // watcher must not walk them — see optimizeDeps.entries below for why.
    watch: {
      ignored: ["**/worktrees/**", "**/.worktrees/**", "**/.claude/worktrees/**"],
    },
  },
  // Without an explicit entry, Vite's dependency scanner globs **/*.html from
  // the project root to find crawl entries. Nested worktrees (see above) each
  // contain their own index.html and node_modules, so the scanner ends up
  // crawling every worktree's full dependency tree too — this is what hangs
  // `npm run dev` forever at "[optimizer] scanning dependencies...". Pinning
  // the real entry point avoids the runaway glob entirely.
  optimizeDeps: {
    entries: ["index.html"],
  },
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    mcpPlugin(),
    mode === "development" && componentTagger(),
    mode === "production" && criticalCssPlugin(),
    mode === "production" && versionJsonPlugin(),
  ].filter(Boolean) as PluginOption[],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
