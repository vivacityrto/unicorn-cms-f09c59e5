# Audit: 2026-05-11 — bug-011-019-login-routing-timeout

**Trigger:** ad-hoc — bug fix shipped; recording closure of BUG-011 and BUG-019
**Author:** Khian (Brian)
**Scope:** Post-sign-in routing for staff and full-access users incorrectly falling back to Academy after a 5-second timeout. One file patched via Lovable prompt on 11 May 2026.

---

## Findings

- **BUG-011 & BUG-019** (`src/hooks/useUserAccess.ts`): Staff and full-access users were being routed to the Academy fallback page after a 5-second timeout in `PostSignInRedirect`. The root cause was that the routing decision was being made before the user's profile had fully resolved from Supabase — the hook was reading an incomplete auth state and treating it as "no access", triggering the fallback.
- Fix: changed the hook to wait for the profile to fully resolve before making the routing decision. Single-line logic change; no schema change, no migration required.
- Both bugs shared the same root cause (race condition in profile loading) and were resolved in one Lovable prompt.

## KB changes shipped

- No KB changes this session.

## Codebase observations (read-only)

- Fix committed to `unicorn-cms-f09c59e5` main branch on 11 May 2026.
- Commit `893fc01a` — "Fixed profile loading in useUserAccess".

## Decisions

- No ADRs drafted.

## Tag

`audit-2026-05-11-bug-011-019-login-routing-timeout`
