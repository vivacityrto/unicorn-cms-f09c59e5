# Audit: 2026-11-17 — notification-resolver-eligible-owners

**Trigger:** drift-surfaced. The read-only check of the recipient resolver against real production assignments, after the data step ([foundation entry](2026-11-17-notification-routing-foundation.md)), showed a gap.
**Scope:** one migration that replaces `public.resolve_notification_recipients(text, bigint, uuid, uuid)` (same signature, so no second overload). No table, trigger, policy or other function changed.
**Status:** applied to `unicorn-qa` and proven, then applied to production on 17 November 2026 (project `yxkgdalkbrriasiyyrwk`, version `20261117044515`, Carl's go-ahead: "Yes, fix it"). Not live: the routing mode is still `legacy`, so no notification changed.

## The gap

Tenants 7492 (an active primary CSC who is a disabled, archived Super Admin) and 7564 (a `System Account`) have an active primary CSC assignment to someone who can never be notified. The first resolver counted any active assignment as an owner, so for those tenants it returned only the two `all_csc` delegates (AJ and Ezel) and never escalated to Super Admins as "unassigned". Under `resolver` mode a client message for either tenant would have reached two people, and the escalation net would not have fired.

## What changed

**Migration `supabase/migrations/20261117160000_notification_resolver_eligible_owners.sql`** (rollback in `supabase/migrations/rollback/20261117160000_notification_resolver_eligible_owners.down.sql`, which restores the foundation version):

- Owners are now the active primary CSCs who are **eligible**: active internal staff, not archived or disabled, not a `System Account` or `is_system_account` user, not in `notification_exempt_users`. An assignment to anyone else is treated as no owner, so the tenant falls through to the `unassigned` rule and delegates (who depend on an owner) are not told.
- Eligibility is evaluated before the actor is removed. Otherwise an owner who is the actor of an event (for example a CSC adding a note on their own client) would have made their client look unassigned.
- Privileges restated (`service_role` only; revoked from `anon` and `authenticated`). No allowlist entry needed: the migration has no INSERT, UPDATE or DELETE.

## Evidence

- `node scripts/audit-migrations.mjs --changed-only --base-ref <step 2 branch>`: 0 findings.
- **`unicorn-qa`:** applied, then `supabase/qa-checks/notification_routing_tests.sql` re-run in full: **47 checks, all passing, rolled back** (the earlier 40 plus 7 new: an owner who is a system account, disabled or exempt makes the tenant unassigned and Super Admins are told; delegates are not told when the only owner is ineligible; an eligible owner is notified again once restored; an owner who is the actor does not make the tenant unassigned). `notification_message_routing_tests.sql` was **not** re-run: it uses only eligible owners, which behave as before.
- **Production, read-only, before:** both tenants returned `delegate: AJ, delegate: Ezel`. **After:** both return `unassigned` for each of the six active Super Admins (AJ, Dave, Angela, Carl, RJ, Khian). Over all 67 tenants with an active assignment: 65 `primary_csc`, 121 `delegate` (the two ineligible tenants dropped from 125) and 12 `unassigned`; the same 2 tenants have no `primary_csc` recipient. One overload; `authenticated` cannot execute the function; `service_role` can; mode still `legacy`, escalation off.

## Rollback

Run `supabase/migrations/rollback/20261117160000_notification_resolver_eligible_owners.down.sql` (restores the foundation resolver). Nothing depends on the change while the mode is `legacy`.

## Decisions

- Treat an ineligible owner as no owner rather than skipping them silently, so the escalation net catches the tenant.
- Keep the fix as a new migration; the foundation migration was already applied and stays as applied.

## Open questions parked

- **Data decision for the team:** who owns tenants 7492 and 7564. Until reassigned, a client message for either goes to all six Super Admins under `resolver` mode, which is noisy by design; assigning a real CSC removes that.
- Audit other tenants over time for assignments to people who later become disabled or archived (a periodic read-only check against `tenant_csc_assignments` would catch it).
