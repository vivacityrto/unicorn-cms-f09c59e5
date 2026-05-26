## Fix 1 — Remove duplicate PDP page title
**File:** `src/pages/academy/pdp/index.tsx`
Remove `title`, `subtitle`, and `icon` props from the `AcademyPageWrapper` call (lines 50–52). Keep the wrapper component as the layout container — just strip those three props so `PdpHeaderBand` is the sole heading source. Remove the now-unused `Target` import from line 2.

## Fix 2 — Rename "Open my PDP cycle" button
**File:** `src/components/academy/pdp/PdpActionRow.tsx`
Change line 33 button text from `Open my PDP cycle` to `Open my PDP`. All existing behaviour, icon, and styling remain unchanged.

## Fix 3 — Top bar shows lesson ID number instead of blank on lesson pages
**File:** `src/components/layout/AcademyTopBar.tsx`
Add an early guard in `titleFromPath` (line 45): if pathname matches `/academy/course/*/lesson/*`, return `""` immediately. This suppresses the raw lesson ID from appearing in the Academy top bar. Leave all other route handling untouched.
