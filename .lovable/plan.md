## Backfill 7 security migrations from the 12–13 Jul remediation

Pure reconciliation. Each block was applied directly to production in mid-July, is already live, and has been independently verified by you as a safe no-op. This task gives each one a real file under `supabase/migrations/` and a `schema_migrations` row via the normal tooling.

### Approach

Apply each block as its own migration via `supabase--migration`, in the order below, under today's date (22 Jul 2026). SQL is used verbatim from the prompt — no reformatting, no scope changes, no folding in of adjacent-but-separate decisions (PR #29 cohort tightening, `set_user_organisation`, etc.).

Between each application, confirm the change was a true no-op against live state (policy/grant/table already matches). If any step reports an actual behavioral delta, stop and surface it before continuing.

### Migrations (in order)

| # | Timestamp (planned) | File | Content |
|---|---|---|---|
| 1 | `20260722030001` | `reconcile_c2_users_no_privilege_escalation.sql` | RESTRICTIVE UPDATE policy on `public.users` guarding protected columns |
| 2 | `20260722030002` | `reconcile_h1_drop_emails_authenticated_select.sql` | DROP stale world-readable `emails_authenticated_select` policy |
| 3 | `20260722030003` | `reconcile_h3_internal_onboarding_admin_only.sql` | Scope storage read/update/delete on `internal-onboarding` to `admin.team_users.manage:full` |
| 4 | `20260722030004` | `reconcile_m2_restrictive_backstops.sql` | RESTRICTIVE ALL policies on `emails`, `auth_tokens`, `oauth_tokens`, `cohort_send_jobs`, `cohort_send_job_items` — mirrors 12–13 Jul scope (`is_vivacity_staff` on cohort tables); PR #29's `admin.cohort.send` tightening is deliberately out of scope |
| 5 | `20260722030005` | `reconcile_m3_revoke_anon_execute_15_fns.sql` | REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated, service_role on the 15 listed functions. Excludes `delete_document_cascade`, `bulk_reassign_primary_csc` (already committed) and `set_user_organisation` (separate follow-up) |
| 6 | `20260722030006` | `reconcile_l1_l3_drop_backfill_and_lock_cron_run_details.sql` | DROP stale `_tenant_users_contact_backfill_20260512`; REVOKE SELECT on `cron.job_run_details` from PUBLIC/anon/authenticated |
| 7 | `20260722030007` | `reconcile_pr36_lock_cron_job.sql` | Reissue PR #36 verbatim: REVOKE SELECT on `cron.job` from PUBLIC/authenticated/anon + assertion DO block |

### Verification

- After each `supabase--migration` returns, note whether the operation was structurally a no-op (policies/grants already match). Expected outcome: all 7 are no-ops.
- Confirm 7 new files appear under `supabase/migrations/` with the planned timestamps.
- No source code, edge functions, or non-migration files are touched.
- No follow-up lint/build/test runs — these are DB-only reconciliations.

### Explicitly out of scope (per your note)

- PR #29 cohort tables tightening to `admin.cohort.send`.
- `set_user_organisation` anon EXECUTE revoke.
- Any other findings from the 12–13 Jul pass not listed in the 7 blocks above.
