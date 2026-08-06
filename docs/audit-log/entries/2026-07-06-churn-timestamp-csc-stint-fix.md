# Audit: 2026-07-06 — Churn Timestamp & CSC Stint Consistency Fix

**Trigger:** ad-hoc — Client Retention KPI on `/kpi` (CSC role) was structurally stuck, always showing ~100% retention regardless of actual churn.
**Scope:** `tenants.churned_at` derivation, `tenant_csc_assignments` open-stint closure on churn, `kpi_csc_retention_rows`/`kpi_csc_tasks_rows` consumption of both. Did not touch `kpi_csc_communication_rows`, `admin_set_tenant_csc_assignment`, or `bulk_reassign_primary_csc` internals (all three deferred — see Open questions parked). Did not audit client-facing flows outside the CSC KPI surface.

---

## Findings

- **Root cause:** `tenants.churned_at` was added in a prior migration with the stated intent of being set when `lifecycle_status = 'churned'` — but `'churned'` was never a valid value in `dd_lifecycle_status` (only `active | suspended | closed | archived`). Nothing in the schema ever wrote to `churned_at`; live data confirmed 0 tenants had a non-null value. `kpi_csc_retention_rows()` keys churn entirely off this column, so the Retention KPI has been silently wrong for every CSC since the column was introduced.
- **A second, deeper structural gap surfaced mid-fix:** even after `churned_at` is populated correctly, `kpi_csc_retention_rows()`'s "stints" CTE keeps counting a tenant in the denominator for every period after the one it churned in, as long as its `tenant_csc_assignments` row is never superseded/ended — which nothing did automatically. Without addressing this, a churned client would show correctly-churned for exactly one quarter, then silently revert to "retained" forever after. Fixed by having the same trigger close the tenant's open assignment stint (`ended_at`) atomically with setting `churned_at`.
- **Backfill scope was narrower than first assumed.** Of 343 legacy non-active tenants missing `churned_at`, only 20 (15 closed + 5 suspended) had a currently-open CSC assignment stint that would actively distort retention math; the other 323 have already-superseded stints and are cosmetically stale only. Backfilled the 20 to a floor date (`2026-02-17`, the `lifecycle_status` column's release date) rather than `tenants.updated_at` — `updated_at` was explicitly rejected as a proxy since it reflects any unrelated edit, not the actual lifecycle transition.
- **Two Lovable migration drafts for M2 contained real bugs caught in review, not just style issues:** one silently substituted the rejected `updated_at` timestamp back in after being told to use the floor date; the next "minimal diff" resubmission introduced non-existent column references (`tenants.tenant_id` instead of `tenants.id`; `tenant_csc_assignments.started_at` instead of `assigned_since`) and widened the target-row `JOIN` from inner to `LEFT JOIN`, which would have inflated the backfill beyond the confirmed 20-row scope. Both were rejected and corrected before anything was applied.
- **A genuinely new security finding (lint 0029, `authenticated_security_definer_function_executable`)** appeared after M1 promoted `sync_tenant_lifecycle_status()` to `SECURITY DEFINER` (required for the new cross-table write). Lovable initially reported "no new findings" by checking only against the general function-hardening checklist (lint 0028) and missing 0029. Fixed by revoking `EXECUTE` from `authenticated` on the trigger-only function (M1b) — no functional impact, since trigger functions fire regardless of grants.
- **The partial unique index (M4) needed a predicate change caught by tracing real function bodies, not the original plan.** The consolidated plan specified `WHERE superseded_at IS NULL`, but `admin_set_tenant_csc_assignment` and `bulk_reassign_primary_csc` both locate "the row to supersede" via `ended_at IS NULL`, not `superseded_at IS NULL`. Under the original predicate, reactivating any of the 20 backfilled tenants (or any future churned tenant) would fail on a unique-constraint violation, because the reassignment functions would never find the historical closed row to supersede. Shipped with `WHERE superseded_at IS NULL AND ended_at IS NULL` instead (Option B), matching the reassignment functions' actual semantics.
- **Verified live in production**, not just via linter/constraint state: for a real CSC with 3 of the 20 backfilled tenants, `kpi_csc_retention_rows` for Q1 2026 correctly returns 5 of 11 tenants as `churned_in_period = true`; the same 5 tenants are correctly absent from the Q2 2026 denominator entirely; `kpi_csc_tasks_rows` shows zero task attribution to those 5 tenants post-churn.

---

## KB changes shipped

- No changes. This audit doc is the durable record; no standing KB doc was judged to need updating as a result.

---

## Codebase observations (read-only)

- unicorn-cms-f09c59e5 @ `3c1a077f` (origin/main) — state at start of the DB-change workflow (post audit-report save, pre-implementation).
- unicorn-cms-f09c59e5 @ `553228bb` (origin/main) — state after all five migrations landed. Migration files, in order:
  - M1 — `supabase/migrations/20260706023505_4c97d810-2548-4c89-8fe9-79dd73c24ea0.sql` (commit `a522b159`): extended `sync_tenant_lifecycle_status()` to stamp/clear `churned_at` on lifecycle transitions and close the open CSC stint atomically; promoted to `SECURITY DEFINER SET search_path = ''`.
  - M1b — `supabase/migrations/20260706025616_330007b6-236a-4ab9-b322-855cb45c33d9.sql` (commit `863c3204`): `REVOKE EXECUTE ... FROM authenticated` on the same function, closing lint 0029.
  - M2 — `supabase/migrations/20260706042406_f05a91c9-8d71-4497-934e-4ba94a773966.sql` (commit `83582dec`): backfilled `churned_at`/`ended_at` to `2026-02-17` for the 20 target tenants; created `_churned_backfill_audit_20260706` staging table (RLS enabled, no policies, service_role-only).
  - M3 — `supabase/migrations/20260706043253_3cefc374-34a2-4454-bc55-42b14ca1b2d5.sql` (commit `6e2daa73`): added `chk_tenants_churned_at_consistency` CHECK constraint (`NOT VALID` → `VALIDATE`).
  - M4 — `supabase/migrations/20260706050100_c6a8fa2d-d406-478e-9ed3-28b56c2d283c.sql` (commit `553228bb`): added `uq_tenant_csc_assignments_one_active_per_tenant` partial unique index.
  - Note: several unrelated commits from concurrent Lovable activity are interleaved in this range (e.g. `ClientLayout` offset, group-label units, client task ID capture) — not part of this fix, called out here only to avoid mis-attributing them.

---

## Decisions

- **Churn definition:** any `lifecycle_status` transition away from `active` (`suspended`, `closed`, `archived`) counts as churn.
- **Capture mechanism:** extend the existing `BEFORE UPDATE` trigger (`sync_tenant_lifecycle_status`) rather than the `AFTER UPDATE` audit trigger — avoids a `NEW.churned_at` assignment recursion issue identified during the audit phase.
- **Backfill scope:** only the 20 tenants with an open CSC stint got a real timestamp (floor date `2026-02-17`); the remaining 323 legacy non-active tenants with already-superseded stints were left `NULL` rather than fabricating a churn date with no evidence behind it.
- **Reactivation semantics:** `churned_at` clears to `NULL` on reactivation; the historical `tenant_csc_assignments.ended_at` is **not** auto-reopened — a reactivated tenant gets a fresh assignment through the normal UI flow, preserving the churn record as history.
- **M4 index predicate:** `WHERE superseded_at IS NULL AND ended_at IS NULL` (Option B), chosen over the originally-planned `WHERE superseded_at IS NULL` (Option A) after confirming Option A would break reactivation given the current reassignment function bodies.
- **`kpi_csc_communication_rows` left untouched** — it has the same `ended_at`-blind-spot as the pre-fix retention function, but fixing it was scoped out as a separate, unrelated KPI tile.

---

## Open questions parked

- **Harden `admin_set_tenant_csc_assignment` and `bulk_reassign_primary_csc`** to also set `superseded_at` on the historical closed row when creating a new assignment on reactivation. Once done, M4's index can be tightened back to the stricter `WHERE superseded_at IS NULL` predicate in a follow-up migration.
- **Fix `kpi_csc_communication_rows`** to filter on `ended_at IS NULL` alongside `superseded_at IS NULL`, for consistency with `kpi_csc_retention_rows`/`kpi_csc_tasks_rows`.
- **Drop `public._churned_backfill_audit_20260706`** after ~30 days of confirmed KPI stability (target ~2026-08-05). Rollback SQL for the backfill is embedded in the M2 migration header if needed before then.

---

## Tag

`audit-2026-07-06-churn-timestamp-csc-stint-fix`
