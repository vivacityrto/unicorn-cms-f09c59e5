

## Fix: Production Layout Clipping Caused by PurgeCSS Stripping Critical Classes

### Root Cause

The **PurgeCSS plugin** in `vite.config.ts` is stripping the responsive padding classes `md:pl-64` and `md:pl-20` from the production CSS bundle. These classes are used dynamically in `DashboardLayout.tsx`:

```tsx
sidebarOpen ? "md:pl-64" : "md:pl-20"
```

PurgeCSS scans source files for class names but can fail to detect classes inside ternary expressions or template strings passed through utility functions like `cn()`. The result: the classes exist in the source code but get removed from the production CSS, causing the main content to render at `pl-0` (no left padding) and overlap with or hide behind the fixed sidebar.

This is why the Lovable preview (which runs in development mode without PurgeCSS) looks correct, but the published production site on `unicorn-cms.au` does not.

### Fix

Add the critical sidebar layout classes to the PurgeCSS safelist in `vite.config.ts`.

**File: `vite.config.ts`** -- Add to the `safelist.standard` array:

```
/^md:pl-/
/^pl-/
/^md:p-/
/^p-4/
```

This ensures all padding-left variants used by the layout contract (and responsive content padding) survive the PurgeCSS pass.

Additionally, add `min-w-0` and `overflow-x-hidden` patterns since these are also part of the layout contract and could be stripped:

```
/^min-w-/
/^overflow-/
/^flex-1/
/^flex-col/
/^w-full/
/^min-h-/
```

### Secondary Fix: Remove Stale `App.css` Constraint

The file `src/App.css` contains a legacy Vite boilerplate rule:

```css
#root {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
}
```

While this file is not currently imported (so it should not be active), it is a risk if anyone re-imports it. The `max-width: 1280px` and `padding: 2rem` would constrain the root element and break the full-width layout. This file should be cleaned up to remove the dangerous rules, keeping only the icon-related styles if needed, or deleted entirely.

### Changes Summary

| File | Change |
|---|---|
| `vite.config.ts` | Add layout-critical class patterns to PurgeCSS safelist |
| `src/App.css` | Remove `#root` constraint rules (or delete file) |

### After Publishing

Once these changes are deployed, ask your team to hard-refresh (Ctrl+Shift+R). The sidebar padding will be preserved in the production CSS and the content will no longer clip behind the sidebar.
