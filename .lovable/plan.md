

## Fix: Topbar content overlap + align topbar height with sidebar header

### Problem 1 -- Content hidden behind sticky topbar
The topbar (`ClientTopbar.tsx`) is `sticky` positioned, but the `<main>` content area directly below it has no padding-top to account for the topbar height. The sticky bar sits on top of the page content, clipping the "Calendar" heading as seen in the screenshot.

**Fix**: Remove `sticky` positioning from the topbar entirely. Since it lives inside the flex column flow of the main content wrapper, it will naturally sit above `<main>` without overlapping. The topbar does not need to be sticky -- it should scroll with the page like a normal in-flow element.

### Problem 2 -- Topbar height does not match sidebar header
The sidebar header area ("CLIENT PORTAL / AHMRC Training") is taller than the topbar (`h-14` = 56px). The sidebar header uses `pt-4 pb-3` with two lines of text, making it roughly 64-68px. The topbar should match this height so they visually align.

**Fix**: Change the topbar from `h-14` to a matching height. Increase to `h-16` (64px) or use the same padding approach as the sidebar header (`py-3 pt-4`) to produce a visually aligned bar.

### Changes

**1. `src/components/client/ClientTopbar.tsx` (line 58)**
- Remove `sticky z-20` from the header className
- Change `h-14` to `h-16` to match sidebar header height
- Remove the inline `top` style since it is no longer sticky

**2. `src/components/layout/ClientLayout.tsx`**
- No changes needed -- once the topbar is not sticky, content will flow naturally below it without padding hacks

