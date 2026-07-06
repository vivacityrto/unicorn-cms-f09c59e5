
# Findings report — `tenants.churned_at` never populated, Retention KPI stuck at 0% churn

Read-only investigation only. No code changed.

## 1. Root cause confirmed

`kpi_csc_retention_rows()` (migration `20260702033006_...`) treats a client as churned when `tenants.churned_at` falls inside the period. Nothing writes to that column:

- The column is added in `20260623055418_...` with a comment saying "set when `lifecycle_status = 'churned'`", but `'churned'` is not a valid value for `lifecycle_status`. The CHECK constraint (`chk_lifecycle_status`, added in `20260217045450_...`) restricts it to `active | suspended | closed | archived`.
- `sync_tenant_lifecycle_status()` (BEFORE UPDATE) maps `status → lifecycle_status` and never touches `churned_at`.
- `trg_tenant_lifecycle_audit()` (AFTER UPDATE) writes to `client_audit_log` only.
- No other trigger, function, or application code writes `churned_at` (grep of `supabase/`, `src/`, and `pg_proc` clean).

Live data confirms: **0 tenants** have a non-null `churned_at`. Retention therefore reports 0% churn regardless of reality.

## 2. Trigger extension feasibility

Extending `trg_tenant_lifecycle_audit` directly is **not viable as written**: it is `AFTER UPDATE FOR EACH ROW`, so it cannot assign to `NEW.churned_at`. Doing an `UPDATE public.tenants SET churned_at = ... WHERE id = NEW.id` from inside the trigger would recurse through this same trigger and through the BEFORE trigger `trg_sync_tenant_lifecycle_status`.

Two clean options — recommendation is **Option A**:

- **Option A (recommended):** put `churned_at` maintenance in the existing BEFORE UPDATE trigger `sync_tenant_lifecycle_status()` (or a sibling BEFORE UPDATE function). It already fires on every UPDATE and can safely assign `NEW.churned_at`. No recursion, no extra write.
- **Option B:** keep the AFTER trigger, add a guarded `UPDATE ... WHERE id = NEW.id AND churned_at IS DISTINCT FROM ...` with a `pg_trigger_depth() = 1` check to prevent recursion. Works but adds a second write per lifecycle change and pollutes `updated_at`.

Semantic rules to encode in whichever function is chosen:

- OLD.lifecycle_status = 'active' AND NEW.lifecycle_status IN ('suspended','closed','archived') AND `churned_at IS NULL` → `NEW.churned_at := now()`.
- OLD.lifecycle_status IN ('suspended','closed','archived') AND NEW.lifecycle_status = 'active' → `NEW.churned_at := NULL`.
- All other transitions leave `churned_at` untouched (preserves the original churn timestamp on suspended→closed→archived progressions).

No other write path touches `churned_at`, so no conflict.

## 3. Backfill coverage (live counts)

Non-active tenants with `churned_at IS NULL`:

| lifecycle_status | total | backfillable from `client_audit_log` | needs fallback |
|---|---:|---:|---:|
| suspended | 324 | 3 | 321 |
| closed    |  19 | 18 | 1 |
| archived  |   3 | 0 | 3 |
| **Total** | **346** | **21** | **325** |

Only 21 of 346 tenants have an audit row recording the `active → non-active` transition. The remaining 325 predate the audit trigger (created 2026-02-17) or were mass-migrated from the legacy `status` column in that same migration (`inactive → suspended` was applied wholesale in the initial backfill and never fired the audit trigger).

**Fallback options for the 325 without audit history — needs a design decision (see §9):**

- (a) Use `tenants.updated_at` as an approximation. Fast, deterministic, but wrong whenever the row has been touched for unrelated reasons since the transition.
- (b) Use `tenants.closed_at` when populated (only meaningful for `closed`), else `archived_at` for `archived`, else fall back to `updated_at` or a fixed sentinel for `suspended`.
- (c) Set `churned_at = '2026-02-17'::timestamptz` (the lifecycle-column release date) for the audit-less rows — honest and clearly a floor value; every KPI period after that date will still count them as churned in the correct period only if they actually transitioned before it. Bad for CSC attribution because these are historical anyway.
- (d) Leave `churned_at` NULL for the 325 and treat them as "pre-KPI baseline"; they never enter the CSC retention denominator (which is scoped by `s.assigned_since`/`superseded_at` on `tenant_csc_assignments` anyway, so most will naturally fall outside any assignment window).

Recommendation: **(b) + (d) hybrid** — use `closed_at`/`archived_at` where available (all 18+3 closed/archived audit-less rows can likely be resolved that way), and leave the 321 legacy-suspended rows NULL, because `tenant_csc_assignments` assignment windows will already exclude them from current-period retention math. Do **not** silently pick `updated_at`.

## 4. Downstream consumers of `churned_at`

Full grep results (`supabase/`, `src/`, `pg_proc` via schema):

- `kpi_csc_retention_rows()` — the only SQL consumer.
- `src/components/kpi-v2/KpiDrillDownSheet.tsx` — reads `r.churned_at` off the RPC result to render `ended_at`. Behaviour improves automatically once the column is populated; no code change needed.
- `src/integrations/supabase/types.ts` — generated types only.

No other code path assumes `churned_at` is NULL. Safe to populate.

## 5. RLS / permissions

- `trg_tenant_lifecycle_audit()` is `SECURITY DEFINER` and inserts into `client_audit_log` — unaffected by the SELECT-only `client_audit_log_superadmin_select` policy. The write policy `client_audit_log_superadmin_insert` has `with_check = NULL` (i.e. `TRUE` in a permissive INSERT), and definer context bypasses it anyway.
- The new/extended trigger function will also be `SECURITY DEFINER SET search_path = ''` with all references fully schema-qualified — no RLS interaction, no invoker context.
- The backfill migration runs as the migration role (bypasses RLS on `public.tenants`). It only needs to read `client_audit_log` (allowed) and write `public.tenants`.

No blockers.

## 6. Lock impact

- **Trigger redefinition** (`CREATE OR REPLACE FUNCTION` + optional `DROP/CREATE TRIGGER`): `CREATE OR REPLACE FUNCTION` takes only an `AccessShareLock` on `pg_proc` and is effectively instant. Recreating the trigger takes a brief `ShareRowExclusive` on `public.tenants` — measured in milliseconds even on a hot table. Safe at any time; no downtime window required.
- **Backfill UPDATE on `public.tenants`**: only ~21 rows are backfillable from audit history and at most ~22 more from `closed_at`/`archived_at`. That's ≤ 50 row updates total — negligible. Even if we widened it to all 346 non-active rows, `tenants` has 408 total rows; a single-statement `UPDATE` is fine.
- Every `UPDATE` on `tenants` fires **six** row triggers (see §7 mitigation), including the newly-extended sync + the audit trigger. To avoid generating 346 spurious `client_audit_log` rows during backfill (lifecycle_status is unchanged, so the audit trigger's `IS DISTINCT FROM` guard already suppresses them — verified) we do not need special handling. The backfill only sets `churned_at`, so the sync trigger's `NEW.status IS DISTINCT FROM OLD.status` branch is skipped too.

Recommendation: run in a single migration, off-peak not required.

## 7. Function hardening (applied to any new/replaced function)

- `LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''`.
- Fully schema-qualify every identifier (`public.tenants`, `public.client_audit_log`, `pg_catalog.now()`, etc.).
- `REVOKE ALL ON FUNCTION public.<fn>() FROM PUBLIC;` then `GRANT EXECUTE ON FUNCTION public.<fn>() TO authenticated, service_role;` — note trigger functions are invoked by the executor regardless of EXECUTE grants, so the REVOKE is defence-in-depth only.
- Include `NOTIFY pgrst, 'reload schema';` at the end of the migration per project standard.

## 8. Rollback

- **Trigger:** keep the previous function body in the migration comment. Rollback = `CREATE OR REPLACE FUNCTION public.sync_tenant_lifecycle_status()` with the pre-change body (already captured in §Root cause above). Trigger binding does not need to be dropped.
- **Backfill:** rollback = `UPDATE public.tenants SET churned_at = NULL WHERE id = ANY($1)` where `$1` is captured from the migration's own preview query. Because rollback is a single UPDATE against a small set, keep the affected id list in a comment inside the migration for auditability.

## 9. Design decisions needed before proceeding

1. **Fallback strategy for the 325 audit-less non-active tenants** — pick from §3 options (a/b/c/d). Recommendation: **(b) + (d) hybrid**. Angela's call.
2. **Trigger placement** — Option A (extend `sync_tenant_lifecycle_status` BEFORE UPDATE, recommended) vs Option B (extend `trg_tenant_lifecycle_audit` AFTER UPDATE with recursion guard). Recommendation: Option A.
3. Whether to also add a **CHECK constraint** forbidding `churned_at IS NOT NULL AND lifecycle_status = 'active'` to prevent future drift. Recommendation: yes, as a NOT VALID constraint validated after backfill.

## Proposed implementation plan

1. **Migration 1 — Trigger extension.** Replace `public.sync_tenant_lifecycle_status()` with a hardened version (`SET search_path = ''`, schema-qualified, `REVOKE ALL … GRANT …`) that additionally maintains `NEW.churned_at` per the rules in §2. No trigger rebind required (function is called by existing trigger binding).
2. **Migration 2 — Backfill.** Single transaction:
   - Preview select of target rows into a temp `_churned_backfill_20260706` table (keep for audit).
   - `UPDATE public.tenants t SET churned_at = COALESCE(a.first_change, t.closed_at, t.archived_at) FROM (…lateral audit lookup…) a WHERE t.lifecycle_status IN ('suspended','closed','archived') AND t.churned_at IS NULL AND COALESCE(a.first_change, t.closed_at, t.archived_at) IS NOT NULL;`
   - Leave the remaining rows (per decision §9.1) untouched.
   - `NOTIFY pgrst, 'reload schema';`
3. **Migration 3 (optional, per §9.3) — Guard constraint.** `ALTER TABLE public.tenants ADD CONSTRAINT chk_churned_consistency CHECK (NOT (lifecycle_status = 'active' AND churned_at IS NOT NULL)) NOT VALID;` then `VALIDATE CONSTRAINT`.
4. **Verification** (read-only SQL run manually after each migration):
   - `SELECT lifecycle_status, COUNT(*) FILTER (WHERE churned_at IS NULL) FROM public.tenants GROUP BY 1;`
   - Sample lifecycle round-trip on a demo tenant: `active → suspended → active` and confirm `churned_at` is set then cleared.
   - Re-open `/kpi` as a CSC subject in a period with a known churn and confirm the tile renders a non-zero denominator.
5. **No frontend change.** `KpiDrillDownSheet.tsx` starts showing `ended_at` correctly as soon as churn data appears.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Recursion via AFTER-trigger option | High if Option B chosen | Infinite loop, migration abort | Pick Option A |
| Backfill using `updated_at` mis-dates a churn into the wrong KPI period | Medium if (a) chosen | Wrong CSC retention numbers this quarter | Recommend (b)+(d); never use `updated_at` blindly |
| Future manual UPDATE bypasses the trigger and leaves `churned_at` stale | Low | Silent drift | Add the CHECK constraint (§9.3) |
| Lock contention on `tenants` | Very low | Momentary | Small row count, no batching needed |
| Existing `trg_tenant_lifecycle_audit` records spurious rows during backfill | None | — | Guard already exists (`IS DISTINCT FROM`), backfill only writes `churned_at` |
| KPI numbers change visibly the moment migration lands | Certain | User-visible | Communicate to Angela before deploy; this is the intended fix |

Awaiting decisions on §9 before writing the migrations.
