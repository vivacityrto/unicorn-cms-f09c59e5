-- ============================================================
-- Migration: Close advisor lint on
--   public._tenant_users_contact_backfill_20260512
-- Issue: RLS disabled on a public.* table (PostgREST-exposed)
--
-- Rationale:
--   This is the pre-backfill snapshot captured 12 May 2026
--   during the contact-role-canonicalisation workstream
--   (unicorn-audit/audit/2026-05-12-contact-role-canonicalisation.md).
--   42 rows = 41 Phase 2 backfill targets + 1 Phase 2b residual.
--   Schema: (id bigint, primary_contact bool, secondary_contact
--   bool, captured_at timestamptz) — minimal rollback safety net.
--
--   The canonical lifecycle: 30-day burn-in then drop. Drop
--   no earlier than 2026-06-12. Today is 2026-05-14 — still in
--   burn-in.
--
--   In the meantime, the table is in `public` (PostgREST-exposed)
--   with RLS off, which the advisor correctly flags. Closing
--   the lint with the same deny-all + COMMENT pattern shipped
--   today for tenant_rto_scope_staging and unicorn1.U1_XeroURL.
--
-- Verification (pre-applied, confirmed live):
--   * 42 rows present (matches the canonicalisation audit)
--   * 0 FKs (incoming or outgoing)
--   * 0 frontend code paths reference this table
--   * 0 functions / views / triggers / cron jobs reference it
--   * No reads since the audit's verification queries
--
-- ROLLBACK template (4 statements):
--   DROP POLICY IF EXISTS "deny_anon"
--     ON public._tenant_users_contact_backfill_20260512;
--   DROP POLICY IF EXISTS "deny_authenticated"
--     ON public._tenant_users_contact_backfill_20260512;
--   ALTER TABLE public._tenant_users_contact_backfill_20260512
--     DISABLE ROW LEVEL SECURITY;
--   COMMENT ON TABLE public._tenant_users_contact_backfill_20260512
--     IS NULL;
-- ============================================================

-- 1. Document the table's role + the explicit drop date
COMMENT ON TABLE public._tenant_users_contact_backfill_20260512 IS
  'Pre-backfill snapshot from contact-role-canonicalisation
   session (2026-05-12). 42 rows of (id, primary_contact,
   secondary_contact, captured_at) backing the Phase 2 +
   Phase 2b UPDATEs that fixed boolean/relationship_role drift.
   No application read path. DROP AFTER 2026-06-12 (30-day
   burn-in from backfill date). See
   unicorn-audit/audit/2026-05-12-contact-role-canonicalisation.md.';

-- 2. Enable RLS (currently off)
ALTER TABLE public._tenant_users_contact_backfill_20260512
  ENABLE ROW LEVEL SECURITY;

-- 3. Explicit deny-all for authenticated
CREATE POLICY "deny_authenticated"
  ON public._tenant_users_contact_backfill_20260512
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- 4. Explicit deny-all for anon
CREATE POLICY "deny_anon"
  ON public._tenant_users_contact_backfill_20260512
  FOR ALL TO anon
  USING (false) WITH CHECK (false);