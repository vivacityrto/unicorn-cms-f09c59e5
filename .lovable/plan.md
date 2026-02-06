
# Fix: Sidebar Menu Text Color (Purple Instead of White)

## Problem Analysis

The sidebar menu text appears purple on the live (production) site instead of white. This happens only in production, not in preview/development.

### Root Cause

**Two issues are combining to cause this:**

1. **PurgeCSS is stripping white color classes** - The `vite.config.ts` uses PurgeCSS in production builds, but the safelist doesn't include `text-white` or related utility classes. This means classes like `text-white/80`, `text-white/70`, and `text-white` are being removed from the production CSS bundle.

2. **Missing sidebar CSS variables** - The `tailwind.config.ts` references sidebar CSS variables (`--sidebar-foreground`, `--sidebar-background`, etc.) that are never defined in `index.css`. When these are undefined, the browser falls back to the default foreground color (purple/acai).

---

## Solution

### Change 1: Add white color classes to PurgeCSS safelist

**File:** `vite.config.ts`

Add patterns to preserve white text colors and other common utility colors:

```typescript
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
    // ADD THESE:
    /^text-white/,     // Preserve text-white, text-white/80, etc.
    /^bg-white/,       // Preserve bg-white variants
    /^border-white/,   // Preserve border-white variants
    /^hover:text-/,    // Preserve hover text colors
    /^hover:bg-/,      // Preserve hover backgrounds
  ],
  // ... rest unchanged
}
```

### Change 2: Define missing sidebar CSS variables

**File:** `src/index.css`

Add the sidebar CSS variables that Tailwind expects (inside the `:root` block):

```css
/* Sidebar colors - for gradient purple-to-pink sidebar */
--sidebar-background: 270 55% 41%;           /* Purple gradient start */
--sidebar-foreground: 0 0% 100%;             /* White text */
--sidebar-primary: 330 86% 51%;              /* Fuchsia */
--sidebar-primary-foreground: 0 0% 100%;     /* White */
--sidebar-accent: 0 0% 100% / 0.1;           /* White with 10% opacity */
--sidebar-accent-foreground: 0 0% 100%;      /* White */
--sidebar-border: 0 0% 100% / 0.2;           /* White with 20% opacity */
--sidebar-ring: 187 74% 50%;                 /* Cyan */
```

---

## Summary

| File | Change |
|------|--------|
| `vite.config.ts` | Add `/^text-white/`, `/^bg-white/`, `/^border-white/`, `/^hover:text-/`, `/^hover:bg-/` to PurgeCSS safelist |
| `src/index.css` | Add missing `--sidebar-*` CSS variables to `:root` |

---

## Expected Outcome

After these changes:
- White text classes will be preserved in production builds
- Sidebar menu items will display with white text on the gradient background
- Both preview and live sites will render identically
