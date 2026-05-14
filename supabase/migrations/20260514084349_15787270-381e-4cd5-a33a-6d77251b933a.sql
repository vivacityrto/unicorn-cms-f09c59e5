-- ============================================================
-- Migration: Close 8 May 2026 Deployment Readiness Audit P2
-- Target: unicorn1."U1_XeroURL"
-- Issue: RLS enabled with zero policies
--
-- Rationale:
--   unicorn1."U1_XeroURL" was the Unicorn 1.0 source for
--   Xero contact URLs. Migration 20260228063003 (Feb 2026)
--   backfilled the 122 rows into public.tenants.xero_contact_url.
--   Table has been frozen since: 0 writes, 0 reads from app
--   code, edge functions, RPCs, views, triggers, or cron.
--
--   The lint is closed by ADDING POLICIES, not by moving the
--   table. unicorn1 is already a legacy holding schema with
--   stronger access protection than archive (no role has
--   schema USAGE on unicorn1, vs archive where authenticated
--   does). Moving to archive was considered and rejected — it
--   would have traded schema-USAGE-denied + RLS-on for
--   schema-USAGE-granted + RLS-on-with-policies, a strict
--   defense-in-depth downgrade.
--
--   Pattern: explicit deny-all policies for authenticated +
--   anon (matching tenant_rto_scope_staging shipped earlier
--   today) + COMMENT ON TABLE documenting the legacy /
--   forensic-only role.
--
-- Verification (pre-applied, all confirmed live):
--   * 0 FKs reference the table
--   * 1 codebase reference (migration 20260228063003 — historical)
--   * 0 functions / views / triggers / cron jobs reference it
--   * pg_stat: 122 inserts (initial), 0 updates, 0 deletes,
--     ~44 reads total (all forensic audit queries; no app reads)
--   * unicorn1 schema: USAGE denied for anon/authenticated/
--     service_role — schema-grant denial is the existing
--     security gate; per-table policies layer on top
--
-- ROLLBACK template:
--   DROP POLICY IF EXISTS "U1_XeroURL_deny_anon"
--     ON unicorn1."U1_XeroURL";
--   DROP POLICY IF EXISTS "U1_XeroURL_deny_authenticated"
--     ON unicorn1."U1_XeroURL";
--   COMMENT ON TABLE unicorn1."U1_XeroURL" IS NULL;
-- ============================================================

-- 1. Document the legacy / forensic-only role
COMMENT ON TABLE unicorn1."U1_XeroURL" IS
  'Legacy Unicorn 1.0 source for Xero contact URLs. Consumed
   by migration 20260228063003 (Feb 2026), which backfilled
   122 rows into public.tenants.xero_contact_url. Frozen since;
   no application read path. Defense-in-depth: schema-USAGE
   denied for anon/authenticated/service_role; these per-table
   deny-all policies layer on top.';

-- 2. Explicit deny-all for authenticated (closes the RLS-on-
--    no-policy advisor lint)
CREATE POLICY "U1_XeroURL_deny_authenticated"
  ON unicorn1."U1_XeroURL"
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- 3. Explicit deny-all for anon
CREATE POLICY "U1_XeroURL_deny_anon"
  ON unicorn1."U1_XeroURL"
  FOR ALL TO anon
  USING (false) WITH CHECK (false);