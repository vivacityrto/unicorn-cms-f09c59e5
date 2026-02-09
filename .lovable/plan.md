

## Fix: Remove Redundant PurgeCSS Plugin

### Problem

Every time we fix one set of missing classes on production, another set breaks. This is because PurgeCSS runs **after** Tailwind's own purging, and it does not understand Tailwind's class generation — it strips classes that Tailwind correctly included.

Examples currently broken on production:
- `sm:inline` (tab labels show as icons only, no text)
- `lg:grid-cols-3` / `lg:col-span-2` (form layout breaks to single column)
- `h-fit`, `h-auto`, `flex-wrap` (minor layout issues)

### Root Cause

Tailwind CSS already removes unused classes based on the `content` paths in your Tailwind config. The PurgeCSS Vite plugin is a second, conflicting pass that does not understand Tailwind's dynamic class patterns. No matter how large the safelist grows, new classes will keep getting stripped.

### Solution

Remove the `vite-plugin-purgecss` plugin from the production build. Tailwind's built-in purging is sufficient and handles all responsive prefixes (`sm:`, `md:`, `lg:`) and dynamic classes correctly.

### Changes

**File: `vite.config.ts`**

1. Remove the `purgecss` import
2. Remove the entire PurgeCSS plugin block (including the safelist) from the plugins array
3. Keep the Critical CSS plugin (it inlines above-the-fold CSS, which is a separate optimisation)

**No other files change.**

### Technical Detail

The PurgeCSS block to remove spans approximately 60 lines (the `purgecss({...})` call with its content paths and safelist). The import `import purgecss from "vite-plugin-purgecss"` is also removed.

The `critters` / critical CSS plugin is unrelated and stays — it inlines critical CSS for faster first paint, it does not remove classes.

### After Publishing

Once deployed, all Tailwind utility classes used in the source code will be present in the production CSS bundle. The tab labels, grid layouts, and responsive breakpoints will work identically to the developer preview.

