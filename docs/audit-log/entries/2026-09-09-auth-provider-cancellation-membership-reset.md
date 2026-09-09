# Audit: 2026-09-09 — AuthProvider ignores stale profile and membership responses

**Trigger:** Phase 3 pilot Packet P7-D continuation; asynchronous profile and
membership reads could complete after sign-out or an auth-user change and
overwrite the current context with stale authorization state.

## Change

- `src/hooks/useAuth.tsx` now tracks mounted state and an auth-generation token.
- Late profile or membership responses are ignored after cleanup or a newer
  auth state, and membership state is cleared when a new session begins.
- Membership read errors clear the membership list rather than retaining stale
  grants. Existing profile-error recovery and public AuthContext signatures are
  preserved.

## Evidence

- Added a focused authentication regression test proving a late profile result
  after sign-out cannot repopulate the context.
- Full frontend, Edge, typecheck, build, and lint/documentation gates passed
  for the PR. No schema, RLS, migration, Edge Function, or production data
  changed.

## Disposition

This closes the cancellation/error-handling slice of P7-D. Broader separation
of session, profile, membership, and authorization concerns remains open.
