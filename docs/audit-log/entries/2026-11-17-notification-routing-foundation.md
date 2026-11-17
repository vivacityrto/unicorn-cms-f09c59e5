# Audit: 2026-11-17 — notification-routing-foundation

**Trigger:** ad-hoc. Rollout step 1 of the notification redesign ([design doc](../../kb/reference/notification-redesign-2026-11-17.md)): ownership-based recipient routing, delegates for assistants, and a per-user preference matrix.
**Scope:** one migration that adds tables, functions, RLS and grants. **No behaviour change**: nothing calls the new resolver, and `fn_tm_on_message_insert`, `emit_notification` and every existing table, policy and trigger are untouched.
**Status:** applied to `unicorn-qa` and proven, then applied to production on 17 November 2026 (project `yxkgdalkbrriasiyyrwk`, version `20261117043730`, Carl's explicit go-ahead) with a read-only postflight that matched the design. The data step (AJ and Ezel delegate links, exempt accounts) was applied the same day.

## What changed

**Migration `supabase/migrations/20261117140000_notification_routing_foundation.sql`** (rollback in `supabase/migrations/rollback/20261117140000_notification_routing_foundation.down.sql`):

- `notification_category`: seven categories (client message, support ticket, note, package alert, risk flag, task, platform alert) with a default audience of `owner`, `assignee` or `super_admin`.
- `notification_role_defaults`: per role (CSC, Super Admin, Team Member, Integrator, BGT), category and channel. In-app and Teams on, email off, scope `my_and_delegated` (so a default alone never makes a non-owner a recipient).
- `notification_preferences` and `notification_client_overrides`: a person's own matrix and per-client watch or mute. RLS: own rows, staff only; Super Admins can read all preferences.
- `staff_notification_delegates`: assistant links (`user` principal or `all_csc`), optional tenant and category limits, a start and end. RLS read only; **no direct write grant**, so every change goes through the two RPCs.
- `notification_exempt_users`: accounts that are never a recipient. A table rather than a column on `users`: **`users` has table-wide INSERT, UPDATE and DELETE grants for signed-in users**, so a column there could be set by the user themselves (found while checking grants on production before applying; QA and production both showed it).
- `notification_effective_pref(uuid, text, text)` and `resolve_notification_recipients(category, tenant, actor, subject)`: who is told and why (`primary_csc`, `delegate`, `opted_in`, `watching`, `unassigned`, `assignee`, `platform_alert`) with the channels each person has on. Excludes the actor, archived and disabled users, `System Account` role and `is_system_account` users, and exempt accounts. `service_role` only.
- `create_notification_delegate(...)` and `end_notification_delegate(uuid)`: Super Admins manage anyone's links; a CSC only links where they are the principal, for tenants where they hold an active assignment (decision 3); `all_csc` links are Super Admin only. The delegate must be an active internal user (not a system or exempt account). Every create and end writes an `audit_events` row (`entity = 'notification_delegate'`).
- All functions `SECURITY DEFINER` with `SET search_path TO ''`, schema-qualified, `REVOKE ALL … FROM PUBLIC`.

**Safety allowlist:** one entry in `supabase/migration-safety-allowlist.json` (expires 17 December 2026). The flagged lines are the two lookup-table seeds and the INSERT and keyed UPDATE inside the two delegate RPCs; the migration changes no existing row.

## Evidence

- `node scripts/audit-migrations.mjs --changed-only --base-ref origin/main`: all findings allowlisted, exit 0.
- **`unicorn-qa` (project `qfpxvumcrnzrjyvqkicq`, confirmed before each write).** Migration applied through the Supabase MCP. One revision was made after the first QA apply: the first draft put `notification_exempt` on `users`; the grant check above showed that was unsafe, so QA was reset and the final file applied from scratch. Final state: one overload of each function, table privileges are `authenticated` only (none for `anon`), seeds are 7 categories and 105 role defaults.
- **`supabase/qa-checks/notification_routing_tests.sql`: 40 checks, all passing, rolled back** (a count of delegate, preference, override, exempt and audit rows afterwards was 0). They cover: only the primary CSC is told for an owned tenant; the actor is excluded; an unassigned tenant escalates to Super Admins only; unknown category raises; task and platform audiences; an `all_csc` delegate is notified with the owner and gets nothing for an unassigned tenant; a CSC can add and end their own assistant only for a tenant they own and cannot add for someone else, create `all_csc`, end an `all_csc` link or write the table directly; a CSC sees only their own links; ending a link stops delivery; creates and ends are audited; a client user and `anon` are refused; a client, system account or disabled user cannot be a delegate; unknown category and duplicate active link are refused; a category-limited delegate gets only its categories; scope `off`, per-client mute, watch and opt-in all behave; default channels are in-app and Teams, not email; exempt and system accounts are never recipients; own-row RLS on preferences and the exempt list is Super Admin only.
- **Not proven on QA:** behaviour against production data volumes, real CSC assignments (QA has two), and the `System Account` role value (QA has no such role, so the check used `is_system_account`).

## Production

**Done, 17 November 2026 (Carl's go-ahead: "Apply both, inert").**

1. **Preflight, read-only.** Target confirmed as `yxkgdalkbrriasiyyrwk` (the same ref as `supabase/config.toml` and the migration's target marker). None of the new tables or functions existed; `pg_cron` installed; helper functions present; live `fn_tm_on_message_insert` md5 `f18ffa14c565d4d73ec93cb3d9050d03`.
2. **Applied** through the Supabase MCP (`apply_migration`), text identical to the file on the PR branch. Recorded as `20261117043730 notification_routing_foundation`.
3. **Postflight, read-only, matched the design:** six tables, all with RLS on; one overload of each of the four functions; `anon` has no table grant; `authenticated` has SELECT on the lookup, delegate and exempt tables and SELECT, INSERT, UPDATE, DELETE only on preferences and overrides (RLS limits those to own rows); `authenticated` can execute only `create_notification_delegate` and `end_notification_delegate`; seeds are 7 categories and 105 role defaults, 0 delegates, 0 exempt; the live `fn_tm_on_message_insert` md5 is unchanged (nothing calls the resolver yet).

**Data step, done 17 November 2026 (Carl's go-ahead: "Yes, add them").** One transaction on `yxkgdalkbrriasiyyrwk`, after resolving each name to exactly one active internal user:

- Two `all_csc` delegate links (decision 5): AJ and Ezel, no tenant or category limit, `created_by` the authorising Super Admin (Carl).
- Three exempt accounts: `Test` (test account), `Carl (CST)` and `Carl (Reviewer)` (duplicate accounts).
- Five `audit_events` rows (`entity` = `notification_delegate` or `notification_exempt_user`, `action` = `created`).
- Written as direct INSERTs rather than through `create_notification_delegate()`, because that function needs a signed-in caller; the rows have the same shape as the RPC writes. Re-running the statement adds nothing (it is idempotent).
- Rollback: `UPDATE public.staff_notification_delegates SET ended_at = now() WHERE created_by = '<Carl>' AND ended_at IS NULL AND principal_kind = 'all_csc'` and `DELETE FROM public.notification_exempt_users WHERE reason IN ('Test account (Test CSC)', 'Duplicate account (Carl (CST))', 'Duplicate account (Carl (Reviewer))')`.

**Read-only check against real assignments afterwards.** Mode is still `legacy`, so nothing a user sees has changed. Running the resolver for `client_message` over all 67 tenants with an active CSC assignment: 65 tenants return their primary CSC; every tenant returns 2 to 3 recipients (average 2.8: the primary CSC plus AJ and Ezel); 190 rows (65 `primary_csc`, 125 `delegate`); 3 exempt and 2 delegate accounts as intended.

**Finding, to fix before cutover.** Two tenants have an active primary CSC who cannot be notified: tenant 7492 (a disabled, archived Super Admin) and tenant 7564 (the `Angela` System Account). The resolver counts that assignment as an owner, so for these tenants it returns only the two delegates and does not escalate to Super Admins as "unassigned". Two actions: (1) correct those two assignments in `tenant_csc_assignments` (a data decision for the team); (2) change the resolver so an assignment only counts as an owner when that person is an eligible recipient, so such a tenant is treated as unassigned. Item 2 is a small `CREATE OR REPLACE` of `resolve_notification_recipients` (same signature, so no overload) with a new QA check, and the resolver is not live until the mode is `resolver`.

## Rollback

`supabase/migrations/rollback/20261117140000_notification_routing_foundation.down.sql` drops everything the migration added. Nothing existing was altered. Export the delegate, preference and override tables first if they have been used; `audit_events` history is left in place.

## Decisions

- Exempt accounts live in their own table, not on `users` (grants finding above).
- Role defaults deliberately leave non-owners at `my_and_delegated`; "all clients" is an explicit opt-in.
- The resolver is `service_role` only. Triggers and the escalation job (step 2) call it as `SECURITY DEFINER` owners.

## Open questions parked

- Production roles only: QA has a role `Team Leader` that is not in `notification_role_defaults`; it falls back to enabled with the default scope, which matches the intent.
- Generated types (`src/integrations/supabase/types.ts`) are not regenerated here; the UI step (rollout step 3) needs them.
