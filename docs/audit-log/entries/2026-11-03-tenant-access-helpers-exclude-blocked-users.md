# Audit: 2026-11-03 — tenant-access helpers now refuse disabled and archived users

**Trigger:** drift-surfaced (read-only investigation parked in [2026-11-03-evidence-portal-research-access-hardening](2026-11-03-evidence-portal-research-access-hardening.md))
**Scope:** the four membership helpers behind most tenant row-level security, plus the portal audit-event check. Not covered: policies that read `tenant_users` or `tenant_members` directly, edge functions that query them, and the auth accounts themselves (see "Open questions parked").

## Findings
- `is_vivacity_team_safe()` and `is_super_admin_safe()` already refuse users flagged `disabled` or `archived` in `public.users`, but the tenant-membership helpers did not: `has_tenant_access_safe()` (used by 171 policies), `user_has_tenant_access()` (31), `app.user_can_access_tenant()` (10) and `user_has_full_tenant_access()` (added earlier today). Disabling a user does not revoke their Supabase Auth session, so a disabled or archived client user with a surviving membership row could still read and write tenant data through row-level security.
- Before the change, on production: 578 active `tenant_members` rows, 399 of them belonging to disabled or archived users, and all 399 passed `has_tenant_access_safe`. Only 30 of those users have an auth account (all unbanned, all flagged disabled, none signed in within 90 days, the latest sign-in on 2026-07-27); the rest cannot sign in.

## Code changes
- Migration `20261103030000_tenant_access_helpers_exclude_blocked_users.sql`, applied to `unicorn-qa` and then production (version `20261103020039`): adds `NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = <caller> AND (u.disabled OR u.archived))` to the membership branch of each helper, and to the member branch of `log_portal_document_event()`. Same signatures (`CREATE OR REPLACE`, one overload each, owners and grants unchanged). Restrictive only: a caller with no `public.users` row is not newly refused, and the staff and Super Admin branches are unchanged. Rollback: `supabase/migrations/rollback/20261103030000_tenant_access_helpers_exclude_blocked_users.down.sql`.

## Verification
- `unicorn-qa`, rolled-back transaction: for one client user moved through active, disabled, archived and restored, all four helpers and the audit-event check returned allowed, refused, refused, allowed; an active staff user was unaffected. No residue.
- Production, aggregate counts before and after: blocked rows passing `has_tenant_access_safe` 399 to 0; normal rows passing 179 of 179 before and after; 17 active-staff membership rows still pass; one overload per function; owners and ACLs identical before and after.
- Browser: `npm run e2e:personas` with the real Demo RTO client and Super Admin sessions: 23 passed, 1 skipped, 0 failed, after the change.

## Decisions
- Disabled and archived are treated as an explicit refusal for tenant access, matching the staff helpers. Re-enabling a user (clearing the flag) restores access with no other change.

## Open questions parked
- **Direct policy and function checks.** 51 policies read `tenant_users` and 48 read `tenant_members` directly, and some edge functions (for example `upload-portal-document`'s member check) query `tenant_users` with the service role; none of these consult the disabled or archived flags yet. A disabled user can still pass those.
- **Auth accounts.** The 30 disabled users with auth accounts are unbanned and their sessions are not revoked; one refreshed a token in the last 90 days. Banning them or forcing a sign-out is an account-lifecycle decision for Carl, separate from this change.
- **Public execute on two helpers.** `has_tenant_access_safe` and `user_has_tenant_access` carry EXECUTE for PUBLIC and `anon` on production (unchanged here). Both only evaluate the caller's own identity or an explicit user id, but the grants are broader than the other helpers and should be reviewed.
- **Unicorn 1 import.** 399 of 578 active membership rows belong to flagged users; this looks like legacy accounts carried in with the flags set, and deserves a data review before any bulk change to those rows.
