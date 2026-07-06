-- M2: Backfill tenants.churned_at for legacy non-active tenants missing that
-- timestamp, and close the corresponding open tenant_csc_assignments stint
-- using a LITERAL FLOOR DATE.
--
-- Scope: 20 tenants satisfying ALL of:
--   lifecycle_status IN ('suspended','closed')
--   churned_at   IS NULL
--   closed_at    IS NULL
--   archived_at  IS NULL
--   AND has exactly-one open CSC stint (ended_at IS NULL AND superseded_at IS NULL)
--
-- Source of truth for the backfilled timestamp: LITERAL FLOOR DATE
--   '2026-02-17T00:00:00+00'::timestamptz
-- Rationale: per M1 audit, tenants.updated_at is unreliable as a churn proxy
-- because it is bumped by unrelated row touches after the actual lifecycle
-- transition. The floor date is a conservative, deterministic sentinel that
-- does not falsely imply a precise churn moment we cannot verify.
-- tenants.updated_at is still captured in the audit table as
-- updated_at_source for debugging reference only; it is NOT written into
-- churned_at or ended_at.
--
-- Rollback (manual):
--   UPDATE public.tenants t
--      SET churned_at = NULL
--     FROM public._churned_backfill_audit_20260706 a
--    WHERE t.id = a.tenant_id AND t.churned_at = a.churned_after;
--   UPDATE public.tenant_csc_assignments c
--      SET ended_at = NULL
--     FROM public._churned_backfill_audit_20260706 a
--    WHERE c.id = a.csc_assignment_id AND c.ended_at = a.csc_ended_after;
--   DROP TABLE public._churned_backfill_audit_20260706;

BEGIN;

-- 1. Audit / staging table
CREATE TABLE public._churned_backfill_audit_20260706 (
  tenant_id            bigint       PRIMARY KEY,
  tenant_name          text,
  lifecycle_status     text         NOT NULL,
  status               text,
  churned_before       timestamptz,
  churned_after        timestamptz,
  updated_at_source    timestamptz  NOT NULL,
  csc_assignment_id    bigint       NOT NULL,
  csc_ended_before     timestamptz,
  csc_ended_after      timestamptz,
  captured_at          timestamptz  NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public._churned_backfill_audit_20260706 FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public._churned_backfill_audit_20260706 TO service_role;
ALTER TABLE public._churned_backfill_audit_20260706 ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role / superuser can read this staging table.

-- 2. Capture the 20 target rows (before-values). Predicates are the exact
--    target set; the JOIN LATERAL enforces "has an open CSC stint".
INSERT INTO public._churned_backfill_audit_20260706
  (tenant_id, tenant_name, lifecycle_status, status,
   churned_before, updated_at_source,
   csc_assignment_id, csc_ended_before)
SELECT
  t.id,
  t.name,
  t.lifecycle_status,
  t.status,
  t.churned_at        AS churned_before,
  t.updated_at        AS updated_at_source,
  a.id                AS csc_assignment_id,
  a.ended_at          AS csc_ended_before
FROM public.tenants t
JOIN LATERAL (
  SELECT a.id, a.ended_at, a.assigned_since
    FROM public.tenant_csc_assignments a
   WHERE a.tenant_id     = t.id
     AND a.ended_at      IS NULL
     AND a.superseded_at IS NULL
   ORDER BY a.assigned_since DESC
   LIMIT 1
) a ON TRUE
WHERE t.lifecycle_status IN ('suspended','closed')
  AND t.churned_at   IS NULL
  AND t.closed_at    IS NULL
  AND t.archived_at  IS NULL;

-- Assert exactly 20 target rows captured.
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public._churned_backfill_audit_20260706;
  IF v_count <> 20 THEN
    RAISE EXCEPTION 'M2 abort: expected 20 target tenants, captured %', v_count;
  END IF;
END $$;

-- 3. Backfill tenants.churned_at to the LITERAL FLOOR DATE. The BEFORE trigger
--    sync_tenant_lifecycle_status will NOT overwrite churned_at here because
--    lifecycle_status is unchanged (the trigger only sets churned_at on
--    lifecycle transitions).
--    NOTE: because OLD.churned_at IS NULL and NEW.churned_at IS NOT NULL, the
--    trigger's stint-3 branch WILL fire and close the open CSC stint to the
--    same NEW.churned_at value. Step 4 below is an idempotent reassertion so
--    the audit table records a deterministic after-value even if the trigger
--    were ever disabled.
UPDATE public.tenants t
   SET churned_at = '2026-02-17T00:00:00+00'::timestamptz
  FROM public._churned_backfill_audit_20260706 a
 WHERE t.id                = a.tenant_id
   AND t.churned_at        IS NULL
   AND t.lifecycle_status IN ('suspended','closed')
   AND t.closed_at         IS NULL
   AND t.archived_at       IS NULL;

-- 4. Fallback close of the open CSC stint using the LITERAL FLOOR DATE.
UPDATE public.tenant_csc_assignments c
   SET ended_at = '2026-02-17T00:00:00+00'::timestamptz
  FROM public._churned_backfill_audit_20260706 a
 WHERE c.id             = a.csc_assignment_id
   AND c.superseded_at  IS NULL
   AND (c.ended_at IS NULL OR c.ended_at = '2026-02-17T00:00:00+00'::timestamptz);

-- 5. Record after-values in the audit table.
UPDATE public._churned_backfill_audit_20260706 a
   SET churned_after   = t.churned_at,
       csc_ended_after = c.ended_at
  FROM public.tenants t,
       public.tenant_csc_assignments c
 WHERE t.id = a.tenant_id
   AND c.id = a.csc_assignment_id;

-- 6. Final assertions: every target row was backfilled to the floor date.
DO $$
DECLARE
  v_bad_tenants int;
  v_bad_csc     int;
BEGIN
  SELECT COUNT(*) INTO v_bad_tenants
    FROM public._churned_backfill_audit_20260706
   WHERE churned_after IS NULL
      OR churned_after <> '2026-02-17T00:00:00+00'::timestamptz;
  IF v_bad_tenants <> 0 THEN
    RAISE EXCEPTION 'M2 abort: % tenants failed churned_at backfill', v_bad_tenants;
  END IF;

  SELECT COUNT(*) INTO v_bad_csc
    FROM public._churned_backfill_audit_20260706
   WHERE csc_ended_after IS NULL
      OR csc_ended_after <> '2026-02-17T00:00:00+00'::timestamptz;
  IF v_bad_csc <> 0 THEN
    RAISE EXCEPTION 'M2 abort: % CSC stints failed ended_at backfill', v_bad_csc;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';