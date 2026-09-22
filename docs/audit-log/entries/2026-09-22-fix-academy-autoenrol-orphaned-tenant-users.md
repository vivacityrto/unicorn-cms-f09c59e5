# Audit: 2026-09-22 — fix academy auto-enrol trigger blocking package start on orphaned `tenant_users`

**Trigger:** ad-hoc — Carl reported "Failed to start package" for Wells International College Pty Ltd (tenant 7556), flagged urgent
**Scope:** `start_client_package` RPC and its `AFTER INSERT` triggers on `package_instances`; did not review other triggers on that table beyond confirming they weren't the cause

## Findings

- Starting a package via the "Start Package" modal called `start_client_package`, which fires `fn_academy_autoenrol_on_package_instance` (an `AFTER INSERT` trigger on `package_instances`) to auto-enrol the tenant's users into Academy courses tied to the package.
- That trigger's `eligible` subquery joined `tenant_users` directly, with no check that each `user_id` actually exists in `auth.users`. `academy_enrollments.user_id` has a hard FK to `auth.users(id)`.
- Tenant 7556 has two `tenant_users` rows with no matching `auth.users` account: `Annie Wu` and `Sirapha (May) Wunnacharoensri` (the same person shown as the tenant's Primary Contact). The bulk `INSERT ... SELECT` is one statement, so the FK violation on either row aborted the whole insert — which, being inside an `AFTER INSERT` trigger, rolled back the *entire* `start_client_package` transaction. No package instance, stages, or tasks were created; PostgREST returned the FK violation as HTTP 409, and the frontend showed a generic "Failed to start package" toast with no detail (`src/hooks/useClientPackageInstances.tsx:165` falls back to that string whenever the thrown error has no usable message).
- Reproduced directly against production (wrapped in `BEGIN; ... ROLLBACK;`, no data written) before applying any fix, confirming root cause:
  ```
  ERROR: 23503 insert or update on table "academy_enrollments" violates foreign key constraint "academy_enrollments_user_id_fkey"
  DETAIL: Key (user_id)=(35c6dbca-eaed-4735-9b6e-b6e40ca578bd) is not present in table "users".
  ```
- This is not a new failure mode in this codebase — a near-identical trigger, `fn_academy_autoenrol_on_all_clients_publish` (fires on course publish, not package start), was given the exact same `join auth.users au on au.id = ...` defensive fix on 2026-08-07 (migration `academy_fix_autoenrol_orphaned_user_uuid`) after dry-run testing surfaced the same class of orphaned-row problem. `fn_academy_autoenrol_on_package_instance` was never given the equivalent fix, so the same bug existed here independently and blocked real client work today.
- Confirmed via `pg_trigger` that no other `AFTER INSERT` trigger on `package_instances` (`trg_derive_org_type_on_package_insert`, `trg_seed_stage_instances`) references `tenant_users` or has any FK exposure of this kind — this is isolated to the Academy auto-enrol trigger.

## Code changes (if this entry accompanies one)

- Migration `fix_academy_autoenrol_orphaned_tenant_users` (applied 2026-09-22): `CREATE OR REPLACE FUNCTION public.fn_academy_autoenrol_on_package_instance()`, adding `join auth.users au on au.id = tu.user_id` to the eligible-users subquery so a `tenant_users` row with no corresponding `auth.users` account is skipped for auto-enrolment instead of failing the whole batch insert (and, transitively, the whole package start). No signature change, so no `DROP FUNCTION` was needed. Fixes this for every tenant, not just Wells International College.

## Decisions

- None — straightforward defensive-join fix matching an existing precedent in a sibling trigger.

## Open questions parked

- Why `tenant_users` rows for Annie Wu / Sirapha (May) Wunnacharoensri have no matching `auth.users` account (never provisioned vs. deleted auth account) was not investigated — out of scope for unblocking package start, and the fix is correct regardless of the reason.
- Whether any *other* Academy/notification triggers keyed off `tenant_users` (outside the two now-fixed autoenrol triggers) have the same unguarded-FK shape was not swept exhaustively this session.
