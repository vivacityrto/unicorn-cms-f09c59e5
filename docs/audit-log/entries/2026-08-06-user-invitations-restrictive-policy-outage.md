# Audit: 2026-08-06 — user_invitations RESTRICTIVE policy outage

**Trigger:** ad-hoc (Carl reported Manage Invites and the Tenant Users tab
broken in production)
**Scope:** Root-caused and fixed a live outage introduced by the same-day
`user_invitations_restrict_scope` RESTRICTIVE policy (from the earlier
Cursor-agent security migrations reconciliation). Did not re-audit the rest
of that reconciliation — see the prior entries for that.

## Findings
- The RESTRICTIVE policy added by `20260805045842_user_invitations_restrict_scope.sql`
  referenced `auth.users` directly in its email-match fallback clause — a
  plain RLS clause, not wrapped in a `SECURITY DEFINER` helper like every
  other check in the same policy (`is_super_admin_safe`,
  `has_tenant_admin_safe`, `is_vivacity_team_safe` all are).
- `authenticated` has no grant on `auth.users`. Because the policy is
  `FOR ALL` (not scoped to one command), Postgres relation-permission-checks
  every table referenced anywhere in it for every query against
  `user_invitations` — including plain `SELECT` — regardless of whether that
  particular OR-branch would have short-circuited. Result: every query
  against `user_invitations` as `authenticated` failed with `42501
  permission denied for table users`, for every caller including superadmin,
  not just a narrowed result set.
- The pre-existing permissive policy (`user_invitations_accept`) has the
  exact same `auth.users` reference but is scoped to `UPDATE` only, so it
  was never permission-checked on a `SELECT` — that's why this exact pattern
  had shipped safely before and went unnoticed until a `FOR ALL` policy
  carried it into a command it hadn't been exercised against.
- Confirmed live via browser network inspection against `/manage-invites`
  (403, `42501`, `"permission denied for table users"`), before and after
  the fix, using a local dev server against the prod backend.
- Verification gap that let this ship: the reconciliation session tested the
  invitee-facing RPC path (`accept_invitation_v2`, `validate_invitation_token`
  — both `SECURITY DEFINER`, unaffected by any RLS on this table) thoroughly,
  but never empirically tested the staff/admin direct-query path
  (`ManageInvites.tsx`, `TenantUsersTab.tsx`) against the new policy before
  applying it to prod.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- `20260806070000_fix_user_invitations_restrict_scope_auth_users_permission.sql`:
  replaces the `auth.users` fallback with `auth.jwt() ->> 'email'` (a JWT
  claim read, no table access, no permission dependency). Applied to prod
  first via Supabase MCP, then written back to this migration file so git
  matches what's live.
- Re-verified clean (zero console errors, real data loading) against
  `/manage-invites`, the Client Detail → Users tab, `/admin/team-users`, and
  `/admin/bulk-invite` after the fix.

## Decisions
- No further changes to the `user_invitations_restrict_scope` policy scope
  needed — the fix is a like-for-like replacement of the one broken clause.

## Open questions parked
- Whether any other RLS policy in this codebase has the same
  "plain-RLS-clause references a table the role lacks a grant on" pattern,
  masked the same way (scoped to a command that happens not to get
  exercised yet). Not swept this session — would need a project-wide check
  of every policy referencing `auth.users` or other restricted tables.
