
## Goal
Make the TopBar’s right-side controls (Ask Viv + Facilitator Mode + Notifications + Avatar) always remain visible (never clipped) even when the parent wrapper uses `overflow-x-hidden`.

## What’s happening (confirmed from screenshot + current code)
- `DashboardLayout` wraps the entire content area in `overflow-x-hidden`.
- `TopBar` uses `justify-between`. If the combined width of left + right clusters exceeds the available width, the overflow is clipped (no horizontal scroll), so the avatar can disappear off the right edge.
- The previous fix set the right cluster to `flex-shrink-0`, which prevents it from shrinking; this can still cause clipping when the cluster is wider than the available space.

## Strategy
Instead of forcing the right cluster to never shrink, we will:
1. Guarantee the avatar remains visible by **constraining and shrinking the “wide” item (Facilitator Mode pill)** and, when needed, **collapsing labels earlier** (e.g., show label only on larger breakpoints).
2. Ensure the flex layout has the correct `min-w-0` and shrinking rules so that truncation happens inside components, not by pushing items off-canvas.
3. Apply the same approach to `AcademyTopBar` for consistency.

---

## Planned code changes

### A) `src/components/layout/TopBar.tsx`
**1) Make left side shrink correctly**
- Change the left container to take remaining space and allow shrink:
  - Add `flex-1 min-w-0` so it becomes the “shrinkable” side.
- Ensure the title already truncates (it does), but it needs the parent `min-w-0` (already added in your diff) plus left cluster being allowed to shrink (we’ll strengthen this).

**2) Make right side fit without pushing avatar off-screen**
- Replace the current `flex-shrink-0` on the right cluster with a safer approach:
  - Use `flex items-center gap-2 min-w-0` for the right container.
  - Ensure each item has predictable sizing:
    - AskVivButton: fixed icon button (already).
    - NotificationDropdown: icon button (already).
    - Avatar button: fixed 40px (already).
    - FacilitatorModeToggle: this is the “expanding” item; we will constrain it via its own component (see section B).

**Expected outcome**
- When space is tight, the Facilitator Mode label truncates/collapses, not the avatar.

---

### B) `src/components/eos/FacilitatorModeToggle.tsx`
This component is currently the main width risk. We’ll make it “self-contained” width-wise.

**1) Constrain the toggle pill width**
- Add `min-w-0` to the outer pill container.
- Add a `max-w-*` so it cannot grow indefinitely and force overflow.
  - Example intent: cap it around ~180–220px on desktop, smaller on mid screens.

**2) Truncate label inside the toggle**
- Wrap the label text with:
  - `truncate` and a `max-w-*` so “Facilitator Mode” becomes “Facilitator…” instead of pushing the avatar away.
- Change breakpoints so the label shows later:
  - Instead of `hidden lg:inline`, use `hidden xl:inline` (or even `2xl:inline` if needed).
  - This matches the reality that `lg` can still be tight once the sidebar is open.

**3) Keep switch/icon non-shrinking**
- Keep `flex-shrink-0` on the icon and switch (good from your diff).
- Ensure the label is the only shrink/truncate element.

**Expected outcome**
- On widths like 1280–1440 with sidebar open, the label won’t expand enough to clip the avatar.

---

### C) `src/components/layout/AcademyTopBar.tsx`
Currently it still has the “old” layout behavior:
- Left container lacks `min-w-0` / shrink rules.
- Center search is always visible and can steal width from the right.

**Changes**
1. Make left container shrinkable:
   - Add `flex-shrink min-w-0` (and/or `flex-1 min-w-0`) similar to TopBar.
2. Hide or reduce center search earlier:
   - `hidden lg:flex` (or `hidden md:flex`) depending on what you want, but the goal is to preserve the avatar.
3. Ensure right container stays visible:
   - Same approach as TopBar: `min-w-0`, and right items fixed where appropriate.

---

## Implementation sequence (minimal-risk)
1. Update `FacilitatorModeToggle.tsx` first (it’s the main source of width pressure).
2. Update `TopBar.tsx` flex rules and remove the “right cluster must never shrink” approach.
3. Update `AcademyTopBar.tsx` to match the same layout contract.
4. Verify no regressions on other pages that use the TopBar.

---

## Testing / Acceptance checklist
Test with sidebar open and closed at:
- 1024px, 1280px, 1366px, 1440px, 1920px.

Confirm:
- Avatar is always visible and clickable (dropdown opens).
- Facilitator Mode pill:
  - Shows icon+switch on smaller widths.
  - Shows truncated label on larger widths without pushing avatar off-screen.
- No horizontal scrollbar appears.
- No content is clipped in the TopBar area.

---

## Files that will be changed
- `src/components/layout/TopBar.tsx`
- `src/components/eos/FacilitatorModeToggle.tsx`
- `src/components/layout/AcademyTopBar.tsx`
