# Fix: "Go to Academy" button redirects to wrong route

## Problem
On the "Academy access only" fallback screen, the **Go to Academy** button links to `/client/academy`, which does not exist. The actual Academy dashboard route is `/academy` (see `src/App.tsx:1111`).

## Root cause
`src/components/client/AcademyOnlyFallback.tsx` line 17:
```tsx
<Link to="/client/academy" ...>
```

No route is registered for `/client/academy`, so the SPA falls through (or routes to a 404/empty client surface).

## Change
Single one-line edit in `src/components/client/AcademyOnlyFallback.tsx`:
- Line 17: change `to="/client/academy"` → `to="/academy"`

## Out of scope
- No other files touched
- No router/guard changes
- No styling or copy changes

## Verification
After edit, click **Go to Academy** from the fallback screen → lands on `/academy` (AcademyDashboardWrapperNew renders).
