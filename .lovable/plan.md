## Objective
When a Vivacity staff member exits the "View as Client" preview session, redirect them back to the page they were on before entering preview instead of always sending them to `/dashboard`.

## Files to modify

### 1. src/contexts/ClientPreviewContext.tsx
- Add `returnPath: string | null` to the preview state and context value.
- Add `returnPath` to the `StoredPreviewSession` interface and the sessionStorage/localStorage persistence.
- Update `startPreview` signature to accept `returnPath?: string` and persist it.
- Update `endPreview` cleanup / `clearPreviewState` to clear `returnPath`.
- Update the restore `useEffect` to read `returnPath` from stored sessions and set it in state.

### 2. src/components/client/ViewAsClientButton.tsx
- Import `useLocation` from react-router-dom.
- Capture `location.pathname` before calling `startPreview` in both:
  - The direct portal flow (`handleViewClient` for `mode === "portal"`)
  - The academy dialog confirmation flow (`handleStartPreview`)
- Pass the captured pathname as `returnPath` to `startPreview`.

### 3. src/components/client/ImpersonationBanner.tsx
- Import `returnPath` from the preview context.
- In `handleExit`, after `await endPreview()`, navigate to `returnPath ?? "/dashboard"` when `isVivacityStaff` is true.
- Leave the non-staff fallback (`/`) unchanged.

## Technical constraints
- No database or migration changes.
- Store only `pathname`, not query strings or hashes.
- If `returnPath` is missing or empty (legacy session), fall back to `/dashboard` for staff.
- No other logic changes.

## Acceptance criteria
- Staff entering preview from any internal page (e.g. `/dashboard`, `/manage-clients`) returns to that exact page on exit.
- Academy and portal modes both capture the correct return path.
- The change survives a page refresh during preview.
- Non-staff exit behaviour is unchanged.
- Legacy preview sessions without a stored `returnPath` still fall back to `/dashboard`.