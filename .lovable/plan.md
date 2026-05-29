## Problem
Both layouts use `min-h-screen flex-col` outer containers, so the browser scrolls via `window`. The `<main>` element with `overflow-y-auto` has no fixed-height parent, so its `scrollTop` stays 0 and no scroll events fire. The `ScrollToTopButton` (which listens to a `scrollRef`) never becomes visible.

## Changes

### 1. `src/components/ui/ScrollToTopButton.tsx`
- Remove the `scrollRef` prop and `ScrollToTopButtonProps` interface.
- Change `useEffect` to attach to `window.addEventListener("scroll", onScroll, { passive: true })`.
- Show button when `window.scrollY > 50`.
- On click, call `window.scrollTo({ top: 0, behavior: "smooth" })`.
- Keep all existing visual styling, positioning (`bottom-20 right-6 z-40`), opacity transition, and `aria-label` exactly as-is.

### 2. `src/components/layout/ClientLayout.tsx`
- Remove `const mainRef = useRef<HTMLElement>(null)`.
- Remove `ref={mainRef}` from the `<main>` element.
- Change `<ScrollToTopButton scrollRef={mainRef} />` to `<ScrollToTopButton />`.
- Remove `useRef` from the React import if it becomes unused.

### 3. `src/components/DashboardLayout.tsx`
- Remove `const mainRef = useRef<HTMLElement>(null)`.
- Remove `ref={mainRef}` from the `<main>` element.
- Change `<ScrollToTopButton scrollRef={mainRef} />` to `<ScrollToTopButton />`.
- Leave `useRef` in the import because `navRef` still uses it.

## Non-goals
- No changes to Ask Viv button positioning or styling.
- No changes to any other components, pages, edge functions, or database objects.
- No changes to the scroll button's visual styling.