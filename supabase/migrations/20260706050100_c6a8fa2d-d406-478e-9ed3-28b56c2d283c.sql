-- M4: Enforce one currently-active tenant_csc_assignments row per tenant.
--
-- Predicate: superseded_at IS NULL AND ended_at IS NULL
--   Rationale: After M2, "superseded_at IS NULL" alone no longer means
--   "currently active" — the 20 backfilled churned tenants have
--   ended_at = '2026-02-17' but superseded_at still NULL, and every future
--   M1-driven churn will produce the same shape. The two existing
--   reassignment functions used on reactivation (verified 2026-07-06):
--     - public.admin_set_tenant_csc_assignment
--     - public.bulk_reassign_primary_csc
--   both locate the row to demote/update using AND ended_at IS NULL, so
--   they would NOT supersede a historical closed-but-not-superseded row on
--   reactivation. Under a stricter WHERE superseded_at IS NULL predicate
--   that would produce two superseded_at-NULL rows for the same tenant and
--   the insert would fail. This predicate matches the actual "currently
--   active stint" semantics and is safe against the reassignment path.
--
--   Follow-up (tracked separately, NOT part of M4):
--     - Patch admin_set_tenant_csc_assignment and bulk_reassign_primary_csc
--       to also supersede the historical closed row on reactivation, at
--       which point the stricter WHERE superseded_at IS NULL invariant
--       becomes reachable.
--     - kpi_csc_communication_rows filters only on superseded_at (ignores
--       ended_at) — same deferred bucket.
--
-- Depends on M1 (trigger closes open stint on churn) and M2 (backfill of
-- 20 legacy open stints with ended_at = 2026-02-17, superseded_at still NULL).
--
-- Pre-flight invariant re-verified via read_query immediately before this
-- migration (2026-07-06 04:42 UTC):
--   0 tenants have more than one row with superseded_at IS NULL AND ended_at IS NULL.
--   (125 total rows; 83 with superseded_at IS NULL; of those, 63 with
--    ended_at IS NULL, one row per tenant.)
-- The DO block below re-asserts the invariant one more time inside the
-- migration transaction so a race between plan-time and index build aborts
-- cleanly rather than failing mid-CREATE.
--
-- Lock profile: CREATE UNIQUE INDEX (non-concurrent) takes ShareLock on the
-- 125-row table for the duration of the build. Imperceptible.
--
-- Rollback:
--   DROP INDEX public.uq_tenant_csc_assignments_one_active_per_tenant;

BEGIN;

DO $$
DECLARE v_dupes int;
BEGIN
  SELECT COUNT(*) INTO v_dupes
    FROM (
      SELECT tenant_id
        FROM public.tenant_csc_assignments
       WHERE superseded_at IS NULL
         AND ended_at IS NULL
       GROUP BY tenant_id
      HAVING COUNT(*) > 1
    ) x;
  IF v_dupes <> 0 THEN
    RAISE EXCEPTION 'M4 abort: % tenants already have multiple rows with superseded_at IS NULL AND ended_at IS NULL', v_dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX uq_tenant_csc_assignments_one_active_per_tenant
    ON public.tenant_csc_assignments (tenant_id)
 WHERE superseded_at IS NULL
   AND ended_at IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';