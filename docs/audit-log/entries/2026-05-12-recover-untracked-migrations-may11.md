# Audit: 2026-05-12 — Recover untracked migrations from 11 May 2026

**Trigger:** NEW-006 from deployment status audit 2026-05-12. Two migrations applied to Unicorn 2.0-dev on 11 May 2026 existed in `supabase_migrations.schema_migrations` but had no corresponding `.sql` files in the git repository. Discovered during the standing deployment status audit.
**Author:** Carl
**Scope:** `unicorn-cms-f09c59e5` migrations only. No RLS policy behaviour changes. No application code changes. No data changes.

---

## End state

| Artefact | Status |
|---|---|
| `20260511004501_fix_users_update_own_policy_recursion.sql` | Committed to repo — matches live |
| `20260511004744_add_audit_user_events_and_harden_is_vivacity_team_safe.sql` | Committed to repo — matches live |
| `audit_user_events` policies | Recreated with `(SELECT auth.uid())` subquery form (perf cleanup, semantically identical) |
| Git repo vs live DB drift | Resolved for these two versions |

Both versions confirmed in `supabase_migrations.schema_migrations` after apply. `audit_user_events` row count: 0 (unchanged). `is_vivacity_team_safe` function body: unchanged on live. NEW-006 closed.

---

## Findings

### How the gap occurred

Both migrations were applied to the live DB on 11 May 2026 but were never committed to git. The most likely cause is that they were written and executed via the Supabase Studio SQL Editor rather than through Lovable's migration runner. Studio SQL Editor registers applied SQL in `supabase_migrations.schema_migrations` but does not create a `.sql` file in the repository. This is the same mechanism that created the `private` schema and `private.cron_function_jwt()` function during the cron JWT rotation session (also 11 May, see `2026-05-11-cron-jwt-rotation-blocked.md`).

### Migration 1 — `fix_users_update_own_policy_recursion` (20260511004501)

Recreates the `users_update_own` UPDATE policy on `public.users`. The original policy caused an RLS recursion loop: the `WITH CHECK` clause called `user_protected_fields_unchanged_safe`, which internally called `is_vivacity_team_safe`, which queried `public.users` under RLS — triggering the same policy again. The fix was to drop and recreate the policy with a `WITH CHECK` that remains consistent with the live state. The hardening of `is_vivacity_team_safe` in Migration 2 (below) is the permanent fix that breaks the recursion at the function level.

### Migration 2 — `add_audit_user_events_and_harden_is_vivacity_team_safe` (20260511004744)

Two independent changes in one migration:

**`audit_user_events` table.** Created as infrastructure for a user-targeting action log (role grants, access scope changes, impersonation events). Schema: `id uuid PK`, `actor_user_uuid uuid NULL`, `target_user_uuid uuid NOT NULL`, `action text NOT NULL`, `reason text NULL`, `details jsonb NULL`, `created_at timestamptz NOT NULL`. Three supporting indexes on actor+created, target+created, and created. RLS enabled with two SELECT-only policies (own events + superadmin). No INSERT policy and no write path exist — the table is intentionally write-path-free pending future integration with `enrol_as_impersonator` (TICKET-003) and the accept-invitation flow (BUG-005).

**`is_vivacity_team_safe` hardening.** Added `SET row_security TO 'off'` to the function. This is the root fix for the recursion problem: when this function runs, it bypasses RLS on `public.users`, so a policy that calls `is_vivacity_team_safe` cannot trigger further RLS evaluation on `users`, breaking the loop. Also confirms `STABLE SECURITY DEFINER` and `SET search_path TO 'public'` were already in place.

### Policy subquery improvement

The two `audit_user_events` SELECT policies were recreated with `(SELECT auth.uid())` subquery form instead of bare `auth.uid()`. On the live DB the policies used bare `auth.uid()` (applied via Studio). The recovery migration uses the subquery form — semantically identical, avoids a per-row function call. Confirmed via MCP after apply: `qual` column shows `( SELECT auth.uid() AS uid)` form for both policies.

---

## What shipped

- `supabase/migrations/20260511004501_fix_users_update_own_policy_recursion.sql`
- `supabase/migrations/20260511004744_add_audit_user_events_and_harden_is_vivacity_team_safe.sql`
- Codebase at `f913ac1c` ("Applied recovery migrations") after Lovable implementation

---

## What remains open

- **Write path for `audit_user_events`**: intentionally deferred. Wire INSERT calls when TICKET-003 (`enrol_as_impersonator` tenant match) or BUG-005 (accept-invitation `access_scope` verification) are actioned — those are the natural entry points.
- **`audit_user_events` missing `tenant_id`**: noted in deployment status audit (NEW-006). Deferred alongside the write path; adding `tenant_id` before any rows accumulate is low risk. Address in the same Lovable session that wires the write path.

---

## Risk note

Both migrations are idempotent against the live DB — all objects existed before apply. The only live-state change is the `audit_user_events` policies moving from bare `auth.uid()` to subquery form, which Postgres treats identically at execution time. Zero rows in the table means no query plans were cached against the old policy form. No risk.

---

## KB changes shipped

- `unicorn-kb/codebase-state/audit-log-inventory.md` — updated to reflect that `audit_user_events` now exists as a tracked migration and that `is_vivacity_team_safe` carries `SET row_security = off`. See KB branch `kb/audit-log-inventory-update`.

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` at `f913ac1c` ("Applied recovery migrations").
- Local branch was 20 commits behind `origin/main` at session start — fetch performed; local not pulled (awaiting user decision per session start ritual flag).

## Decisions

No new ADRs. Write-path decision for `audit_user_events` deferred to TICKET-003 / BUG-005 sessions.

## Open questions parked

- Should `audit_user_events` receive a `tenant_id` column before or at the same time as the write path is wired? Recommendation: same Lovable session, since adding `tenant_id NOT NULL` to an empty table is trivially low risk and the backfill concern is moot.

## Tag

`audit-2026-05-12-recover-untracked-migrations-may11`
