

## What's actually happening

The screenshot shows the **published site** (`unicorn-cms.au/eos/meetings`) stuck on the white centred spinner. That spinner is `LazyLoadFallback` — the `<Suspense>` placeholder shown **while a lazy-loaded JS chunk is being fetched**. The page is therefore failing/hanging *before* `EosMeetings.tsx` ever mounts. None of our query/RLS code has run yet.

There are also two real, separate problems sitting underneath that I want to fix at the same time, because together they explain "some users can't access EOS meetings":

### Problem 1 — Stale lazy chunks after deploy (blank white spinner forever)
- `EosMeetings`, `EosMeetingSummary`, `LiveMeetingView` are all `lazy()` imports in `App.tsx`.
- After a new deploy, old browser tabs / cached `index.html` reference chunk filenames that no longer exist on the CDN. `import()` rejects, but `<Suspense fallback={<LazyLoadFallback />}>` has no error boundary, so it just spins forever.
- Symptom matches the screenshot exactly: white screen, cyan spinner, URL still on `/eos/meetings`.
- This hits "some users" — specifically anyone who had the app open before the last deploy, or who landed on a stale cached HTML.

### Problem 2 — Non-Vivacity users get 0 meetings, silently
- RLS on `eos_meetings` only has `vivacity_*` policies (`is_vivacity_team_safe(auth.uid())`). There is **no** tenant-scoped SELECT policy.
- So any user whose `unicorn_role` is `Admin` / `User` / `General User` (462 users in DB) returns an empty list with no error. The UI renders an empty state, which can look like "the page doesn't load" too.
- This is by design (EOS is Vivacity-only) but it's worth confirming the people who reported the issue are actually staff. If they are clients, the correct fix is the redirect/toast that `ProtectedRoute` already does — but only when `unicorn_role` resolves correctly (see Problem 3).

### Problem 3 — `useEosMeetings` query stays "loading" forever for users with no tenant and no Vivacity role
- In `useEos.tsx`:
  ```
  enabled: isSuper || isVivacityTeam || !!profile?.tenant_id
  ```
- If a profile loads with `unicorn_role = null` (or anything outside the 3 staff roles) AND `tenant_id = null`, the query is permanently disabled. React Query then reports `isLoading: true` for a disabled query, so the in-page spinner ("Loading meetings…") never resolves.
- Today there are several staff with `tenant_id = null` who *are* Vivacity (e.g. AJ, beverly, jose), so they're fine because `isVivacityTeam = true`. But any user where the profile fetch fails or returns a stale shape will hit this trap.

## Fix plan

1. **Recover from stale lazy chunks** (kills the white-spinner-forever case)
   - Wrap the `<Suspense>` in `App.tsx` with an error boundary that catches `ChunkLoadError` / dynamic import failures and triggers a one-time `window.location.reload()` (or shows a "New version available — reload" card with a button).
   - This is the standard fix for Vite + React Router + lazy routes after a redeploy and resolves the exact symptom in the screenshot.

2. **Make `useEosMeetings` and `useMeetingSeries` fail-safe**
   - Change the `enabled` guard so the query is only disabled while the profile is still loading, not when the user simply isn't Vivacity.
   - When the user is not Vivacity, return `meetings: []` immediately and `isLoading: false`, instead of spinning forever.
   - Apply the same change to the three queries in `useMeetingSeries.tsx` (`series`, `upcoming`, `past`).

3. **Show a clear "EOS is Vivacity-only" message instead of an infinite spinner**
   - In `EosMeetings.tsx`, if the profile is loaded and `canAccessEOS()` is false, render the existing "EOS is available to Vivacity Team only" toast/redirect path instead of the loading state. (The redirect already exists in `ProtectedRoute` — confirm it actually fires for the affected users by checking `unicorn_role` in the DB for the people who reported the issue.)

4. **Improve diagnosability**
   - Add a one-line console.warn in `useEosMeetings` when the query is skipped because of missing role/tenant, so future "I can't see meetings" reports are debuggable from console logs.

## Files to change

- `src/App.tsx` — wrap `<Suspense>` with a chunk-error boundary
- `src/components/LazyLoadFallback.tsx` (or new `ChunkErrorBoundary.tsx`) — error boundary component
- `src/hooks/useEos.tsx` — fix `enabled` + return `[]` for non-Vivacity, add warn log
- `src/hooks/useMeetingSeries.tsx` — same treatment for the 3 queries

## What I need from you to confirm

To be sure we're solving the right "some users":
- Which user(s) reported it? If they're internal Vivacity staff → Problem 1 (stale chunks) is almost certainly it. If they're client users → Problem 2 (EOS is staff-only by design) is the answer and we just need a clearer message + redirect.

