-- ============================================================
-- Migration: Close 8 May 2026 Deployment Readiness Audit P2
-- Target: public.tenant_rto_scope_staging
-- Issue: RLS enabled with zero policies
--
-- Rationale:
--   This table is a transient staging buffer used exclusively
--   by the tga-rto-sync edge function (service-role key).
--   Service role bypasses RLS unconditionally, so the sync
--   write path is unaffected by these policies. Adding explicit
--   deny-all policies for authenticated + anon satisfies the
--   advisor lint with strict, correct semantics and documents
--   the service-role-only design.
--
-- Verification before apply:
--   - 0 frontend code paths read/write this table (types.ts only)
--   - tga-rto-sync is the sole accessor (4 refs, all service-role)
--   - 0 FKs, 0 triggers, 0 views, 0 other functions reference it
--   - 0 rows in table at time of migration
--
-- Rollback template:
--   DROP POLICY IF EXISTS tenant_rto_scope_staging_deny_authenticated
--     ON public.tenant_rto_scope_staging;
--   DROP POLICY IF EXISTS tenant_rto_scope_staging_deny_anon
--     ON public.tenant_rto_scope_staging;
--   COMMENT ON TABLE public.tenant_rto_scope_staging IS NULL;
-- ============================================================

-- Document the service-role-only design
COMMENT ON TABLE public.tenant_rto_scope_staging IS
  'Transient staging buffer for tga-rto-sync edge function.
   Service-role-only by design — RLS denies all authenticated/anon access.
   Rows exist for seconds during a sync (delete-existing → insert-batch → promote-to-final);
   no client-side read use case. See supabase/functions/tga-rto-sync/index.ts.';

-- Explicit deny-all for authenticated (closes RLS-on-no-policy lint)
CREATE POLICY tenant_rto_scope_staging_deny_authenticated
  ON public.tenant_rto_scope_staging
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Explicit deny-all for anon
CREATE POLICY tenant_rto_scope_staging_deny_anon
  ON public.tenant_rto_scope_staging
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);