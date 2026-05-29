## Goal
Move the scroll-to-top button out of `ClientGovernanceDocumentsPage` and make it a reusable component wired into both `ClientLayout` and `DashboardLayout`, so it watches the real scroll container (`<main>`) and doesn't overlap the Ask Viv button.

## Files

### 1. `src/components/client/ClientGovernanceDocumentsPage.tsx` — remove
- Delete `showScrollTop` state and the `useEffect` window scroll listener.
- Delete the floating scroll-to-top `<Button>` JSX.
- Remove `ChevronUp` from the lucide-react imports (assuming it's only used by the scroll button — will verify on read; if used elsewhere, leave it).
- No other changes — query logic, framework column, filters all untouched.

### 2. `src/components/ui/ScrollToTopButton.tsx` — new
```tsx
type Props = { scrollRef: React.RefObject<HTMLElement> };
```
- `useState` for `visible`.
- `useEffect`: attach `scroll` listener to `scrollRef.current`; set visible when `scrollTop > 50`. Cleanup on unmount/ref change.
- Click handler: `scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })`.
- Render existing `<Button variant="outline" size="sm">` with `ChevronUp` icon, classes: `fixed bottom-20 right-6 z-40 rounded-full shadow-md transition-opacity duration-300` plus `opacity-100` or `opacity-0 pointer-events-none` based on `visible`.
- `aria-label="Scroll to top"`.

### 3. `src/components/layout/ClientLayout.tsx` — wire up
- `import { useRef }`, `import { ScrollToTopButton } from "@/components/ui/ScrollToTopButton"`.
- Inside `ClientLayoutInner`: `const mainRef = useRef<HTMLElement>(null);`
- Attach `ref={mainRef}` to the existing `<main className="flex-1 ...">`.
- Render `<ScrollToTopButton scrollRef={mainRef} />` as a sibling of the Ask Viv `<Tooltip>` block.
- Ask Viv button untouched.

### 4. `src/components/DashboardLayout.tsx` — wire up
- Same pattern: add `useRef` import + `ScrollToTopButton` import.
- `const mainRef = useRef<HTMLElement>(null);`
- Attach to existing `<main>` element.
- Render `<ScrollToTopButton scrollRef={mainRef} />` next to `<AskVivFloatingLauncher />`.
- `AskVivFloatingLauncher` untouched.

## Non-goals
- No edge function, DB, migration, or query changes.
- No changes to Ask Viv styling/positioning.
- No changes to any other pages or components.

## Risk
Low. New component is isolated; layout edits are additive (ref + sibling render). The only deletion is the broken scroll-to-top in the governance page, which currently does nothing useful because it listens to `window.scrollY`.
