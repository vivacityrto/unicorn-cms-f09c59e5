## Fix: Suggestions dialog overflow on expand + drag clamp

**File:** `src/components/layout/FloatingSuggestionsDialog.tsx`

### Change 1 — Expand/minimize button (line ~123)
Replace the existing `onClick={() => setExpanded(!expanded)}` on the expand Button with a handler that also clamps `position` into the viewport when switching to the expanded size (680×600 + 16px margin).

### Change 2 — Drag clamp (lines ~57–60)
Inside `handleMouseDown`'s `handleMouseMove`, replace the hardcoded `innerWidth - 200` / `innerHeight - 100` clamps with `innerWidth - width` / `innerHeight - height`, using the `width` / `height` already computed before the return.

### Technical note
`width` and `height` are `const`s in the same component-render scope. `handleMouseDown` is recreated each render (via `useCallback` with `[position]`), and `handleMouseMove` only runs after mousedown, by which point both consts are initialised — so the closure reference is safe despite the lexical order.

No other edits: no styling, z-index, portal, or logic changes.