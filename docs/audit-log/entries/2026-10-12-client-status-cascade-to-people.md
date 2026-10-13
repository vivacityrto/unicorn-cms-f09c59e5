# Audit: 2026-10-12 — Deactivate a client's people when the client leaves "active"

**Trigger:** request from Dave (via Carl): when a client's status moves away from active, its users and contacts should no longer read as active. Part 2 of 2; part 1 is `2026-10-12-contact-directory-tenant-status.md`.
**Scope:** a trigger on `tenants`, two functions, one ledger table, and a fix to the legacy `update_tenant_status()` trigger. The migration itself changes no existing person; cleaning up people at clients that are already non-active is a separate, reviewed step.

## Findings

- Nothing disabled a client's people when the client's status changed. The lifecycle function (suspend / close) only set `tenants.access_status`; a user's own `disabled` flag was untouched, and the app's login gate reads only that flag.
- A legacy trigger, `update_tenant_status()` (on `users` insert/delete/update of `disabled`, `archived`, `tenant_id`), rewrote `tenants.status` to `active` or `inactive` for ANY client based on whether the client had an enabled user. That explains the 324 clients reading "inactive". It would have fought this feature: disabling the people of a cancelled client flips it to `inactive`; enabling one person flips it to `active`.
- 34 users belong to more than one client. `tenant_users` and `users.tenant_id` also disagree for some people (45 `tenant_users` rows differ from the user's `users.tenant_id`; 29 users have a `tenant_id` with no matching `tenant_users` row), so membership is the union of the two.
- Contacts (`tenant_contacts`) are RTO contact-list entries with no login. Their `status` (`active` / `archived`) is a soft-delete flag: a contact is archived, never deleted, for example when promoted to a user. Archiving is therefore the contact equivalent of disabling a user.
- Dry run of who is affected today (people at clients that are already non-active, applying the rules below): 47 users and 6 contacts at 24 cancelled clients; 5 users at 2 on-hold clients; 4 users at 4 inactive clients; 4 users at 2 completed clients; 1 user each at an in-arrears, a disabled and a terminated client. **The list includes the QA fixtures "Test RTO", "Test RTO A" and "Test RTO B" (all currently `cancelled`) and their QA users**, which the e2e personas rely on.

## Code changes

- Migration `20261012040000_client_status_cascade_to_people.sql` (written; applied only after Carl's approval):
  - `tenant_status_cascade_actions`: restore ledger (who the cascade changed, and when restored). Staff-only SELECT; writes only through the functions or the service role.
  - `cascade_deactivate_tenant_people(tenant, new_status, dry_run)`: disables the client's users and archives its active contacts, recording each in the ledger and one counts-only row in `client_audit_log`. Never touches Vivacity internal staff or Super Admins, and never a person who also belongs to another client that is still active. `dry_run` returns the ids without changing anything.
  - `cascade_restore_tenant_people(tenant)`: re-enables only people the ledger shows the cascade disabled (for any client) who belong to this client, and un-archives only ledger contacts that were not promoted to a user.
  - Trigger `trg_cascade_tenant_status_to_people` (AFTER UPDATE OF status ON `tenants`): `active` to anything else deactivates; anything else to `active` restores, but only on a direct status change (`pg_trigger_depth() = 1`), so the legacy trigger flipping a client back to active when one person is re-enabled does not restore everyone.
  - `update_tenant_status()` now only moves a client between `active` and `inactive` and never overwrites another status. Previous definition, for rollback: it ran the same `UPDATE public.tenants t SET status = CASE WHEN EXISTS (enabled, unarchived users with users.tenant_id = t.id) THEN 'active' ELSE 'inactive' END WHERE t.id = COALESCE(NEW.tenant_id, OLD.tenant_id)` with no `AND t.status IN ('active','inactive')` guard.
  - The cascade functions are revoked from `PUBLIC`, `anon` and `authenticated`; only `service_role` (a deliberate, reviewed clean-up) and the trigger can run them.
- Static safety test `src/test/migrations/client-status-cascade.test.ts` guards the properties above.
- Dry run of the behaviour in a rolled-back transaction against the hosted project (objects absent afterwards, confirmed): cancelling a client with one single-client user and two contacts disabled that user and archived both contacts, left the client `cancelled`, wrote one audit row and three ledger rows; reactivating it re-enabled and un-archived all three, closed the ledger and left the client `active`. A person in two active clients stayed enabled when the first was cancelled, was disabled when the second was too, and was re-enabled when the first was reactivated. Disabling and re-enabling a person at an already-cancelled client left it `cancelled` (previously it would flip).

## Decisions

- Disable users and archive contacts; never delete. Reversible through the ledger.
- Only `active` is an active client: cancelled, on hold, in arrears, completed, disabled, terminated and inactive all deactivate their people.
- Reactivation restores only what the cascade changed; anyone disabled for another reason stays disabled.
- Existing people at non-active clients are not changed by this migration. A one-off clean-up will use `cascade_deactivate_tenant_people` per client after the dry-run list is reviewed.

## Open questions parked

- Exempt the QA fixture clients (Test RTO, Test RTO A, Test RTO B) from the one-off clean-up, and decide whether they should be permanently exempt from the cascade.
- Any bulk or automated change of `tenants.status` (an import, a billing sync) will now deactivate people. Every code path that sets a client's status (the status dropdown, the lifecycle function, the import and any sync) has not been individually audited for this; worth watching after release.
- Whether the Teams event registration should also skip people at non-active clients (deliberately left out for now).

## Applied

- Applied to the Unicorn project (`yxkgdalkbrriasiyyrwk`) on 12 October 2026 via the Supabase MCP as `client_status_cascade_to_people`, **before** the PR merged. Verified afterwards: the ledger table exists empty with RLS on and `authenticated` holding SELECT only; the trigger `trg_cascade_tenant_status_to_people` is enabled; the three new functions are executable by `postgres` and `service_role` only; the legacy `update_tenant_status()` now carries the `status IN ('active','inactive')` guard. **No existing person changed**: disabled users (394) and archived contacts (18) are identical to the counts taken immediately before. The one-off clean-up of people at clients that are already non-active has not been run.

## One-off clean-up (run 12 October 2026, Carl-approved)

- Carl reviewed the dry-run list and approved the clean-up, excluding the QA fixture clients "Test RTO" (7533), "Test RTO A" (7517) and "Test RTO B" (7546).
- Dry run first (`cascade_deactivate_tenant_people(..., dry_run => true)` per client): 47 users and 6 contacts across 32 clients, matching the reviewed list minus the 16 QA users.
- Run: `cascade_deactivate_tenant_people(client, client_status, false)` for every client whose status is not `active`, excluding the three QA clients, in one transaction.
- Result: disabled users 394 -> 438 (+44) and archived contacts 18 -> 24 (+6). 44 rather than 47 because three people belong to two non-active clients (counted once per client in the dry run, disabled once). The ledger holds 44 user rows and 6 contact rows across 30 clients, all unrestored, so reactivating a client restores exactly them.
- Checks after the run: no client's status changed (counts identical: active 58, cancelled 29, inactive 324, completed 2, disabled 4, on hold 2, in arrears 1, terminated 1, archived 1); zero enabled users remain whose only clients are non-active; the QA fixtures still have 16 enabled users and no ledger rows.
- Still open: whether the QA fixture clients should be permanently exempt from the cascade. They are `cancelled` today, so nothing will happen to them unless one is moved to active and back out again.
