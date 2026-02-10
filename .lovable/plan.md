

## Fix: Topbar height alignment with sidebar header + enlarge Vivacity logo

### Problem 1 -- Height mismatch
The sidebar header uses `px-3 pt-4 pb-3` with two lines of text ("CLIENT PORTAL" + tenant name), producing roughly 68-72px of height. The topbar is set to `h-16` (64px), which is shorter, creating a visible misalignment at the junction point.

### Problem 2 -- Logo too small
The Vivacity logo uses `h-7` (28px), which looks tiny in the available `h-16` topbar space.

### Changes

**`src/components/client/ClientTopbar.tsx`**
- Change `h-16` to `h-[72px]` to match the sidebar header's rendered height (pt-4 + two text lines + pb-3 = ~72px)
- Increase the logo from `h-7` to `h-10` (40px) so it fills the taller bar proportionally

**`src/components/client/ClientSidebar.tsx`**
- No changes needed -- the sidebar header height is the reference target

### Technical detail
Two single-line edits in `ClientTopbar.tsx`:
1. Line 63: `h-16` becomes `h-[72px]`
2. Line 70: `h-7` becomes `h-10`

