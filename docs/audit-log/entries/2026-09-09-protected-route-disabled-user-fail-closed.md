# Audit: 2026-09-09 — ProtectedRoute disabled-user check fails closed

**Trigger:** Phase 3 pilot prerequisite review (Packet P7-D); the disabled
account lookup treated a Supabase error as `disabled: false`, allowing the
client guard to render protected content when account status was unavailable.

## Change

- `src/components/ProtectedRoute.tsx` now distinguishes loading, ready, and
  error states for the disabled-account lookup.
- A lookup error renders an access-unavailable recovery card with Retry and
  Sign Out actions. Protected children are not rendered until a successful
  status check completes.
- Retry reruns the same read-only lookup. The existing disabled-account card,
  route guards, and server-side authorization boundaries are unchanged.

## Evidence

- Added a focused regression test in
  `src/test/rbac/ProtectedRoute.test.tsx` proving the error state fails closed
  and Retry rechecks before children render.
- No schema, RLS, migration, Edge Function, or production-data changes.
- This is a frontend security-boundary correction; the hosted database was not
  contacted by verification beyond mocked unit-test clients.

## Disposition

This closes the disabled-user hotfix prerequisite identified for Packet P7-D.
The broader auth/profile/membership seam remains separately scoped and is not
implemented by this change.
