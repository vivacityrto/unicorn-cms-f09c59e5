-- M3: Guard against the illegal state (lifecycle_status='active' AND churned_at IS NOT NULL).
-- Depends on M2 having backfilled all legacy violations to churned_at=2026-02-17
-- for non-active tenants only. Verified pre-flight: 0 rows currently satisfy
-- (lifecycle_status='active' AND churned_at IS NOT NULL).
--
-- Rollback:
--   ALTER TABLE public.tenants DROP CONSTRAINT chk_tenants_churned_at_consistency;

BEGIN;

ALTER TABLE public.tenants
  ADD CONSTRAINT chk_tenants_churned_at_consistency
  CHECK (NOT (lifecycle_status = 'active' AND churned_at IS NOT NULL))
  NOT VALID;

ALTER TABLE public.tenants
  VALIDATE CONSTRAINT chk_tenants_churned_at_consistency;

COMMIT;

NOTIFY pgrst, 'reload schema';