## Goal

Mount `ClientAskVivPanel` in `src/components/layout/ClientLayout.tsx` with a local trigger button. Keep the staff/client surfaces fully separated.

## Files

- **Modify**: `src/components/layout/ClientLayout.tsx` — only file touched.
- **Untouched**: `App.tsx`, `src/components/DashboardLayout.tsx`, `ClientTopbar.tsx`, all `ask-viv/*` files, `useAskViv` hook.

## Note on current state

`ClientLayout.tsx` is not a bare `{children}` wrapper — it already composes `ClientSidebar`, `ClientTopbar`, `ClientFooter`, `ClientChatbotLauncher`, banners, and a request modal inside `ClientLayoutInner`. The change goes in `ClientLayoutInner` (the component with the actual JSX), not the outer `ClientLayout` provider wrapper.

## Changes

1. **Imports** (top of file): add
   - `ClientAskVivPanel` from `@/components/ask-viv/ClientAskVivPanel`
   - `Button` from `@/components/ui/button`
   - `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip`
   - `vivIcon` from `@/assets/viv-icon.png`

2. **State** in `ClientLayoutInner`:
   ```ts
   const [isAskVivOpen, setIsAskVivOpen] = useState(false);
   ```

3. **Trigger button**: render at the bottom of `ClientLayoutInner`'s JSX (just after `DocumentRequestModal`). Visual matches the staff `AskVivButton` (round, vivIcon, success-coloured status dot, tooltip "Ask Viv"), but as a fixed floating launcher in the client surface — `fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg`. `onClick` sets `isAskVivOpen` to true. We don't use `AskVivButton` itself because it depends on `useAskViv()` and `useRBAC()` — neither belongs in the client layout.

4. **Mount panel**: render
   ```tsx
   <ClientAskVivPanel
     isOpen={isAskVivOpen}
     onClose={() => setIsAskVivOpen(false)}
   />
   ```
   as a sibling to the trigger, inside the same outer `<div>` (so it overlays the page; the panel itself uses `fixed` positioning).

## Why a floating launcher (not in `ClientTopbar`)

Spec says "match the visual pattern used in DashboardLayout for AskVivPanel". DashboardLayout mounts both `<AskVivPanel />` and `<AskVivFloatingLauncher />` at the layout level — a fixed floating entry point alongside the panel. Mirroring that here keeps the change scoped to `ClientLayout.tsx` (no edit to `ClientTopbar.tsx`) and matches the staff-side mount pattern. The button visually matches `AskVivButton` (round, vivIcon, status dot, "Ask Viv" tooltip).

## Z-index note

`ClientChatbotLauncher` already exists as a floating element in this layout. The new Ask Viv launcher uses `z-40` and the panel itself uses `z-50` (set inside `ClientAskVivPanel`), so the panel always sits above both launchers. If they visually collide we'll nudge the position in a follow-up — both are `bottom-6 right-6`-style absolutes, so verification step #2 below catches it.

## Hard constraints (preserved)

- `AskVivPanel` is NOT mounted in client layout.
- `ClientAskVivPanel` is NOT mounted in `DashboardLayout`.
- No `useAskViv()` / `useRBAC()` / context usage added to the client layout.
- `App.tsx` is not opened.

## Verification (after switching to Build mode)

1. TypeScript passes.
2. Load a client route, confirm:
   - Floating Ask Viv button is visible (and doesn't overlap the existing `ClientChatbotLauncher`).
   - Clicking it opens `ClientAskVivPanel` (bottom-right, 420×600).
   - Closing returns to normal; state resets correctly on reopen (history persists per spec — that's the panel's local state).
3. `rg "AskVivPanel|useAskViv" src/components/layout/ClientLayout.tsx` → no matches (only `ClientAskVivPanel`).
4. `src/components/DashboardLayout.tsx` byte-identical.
