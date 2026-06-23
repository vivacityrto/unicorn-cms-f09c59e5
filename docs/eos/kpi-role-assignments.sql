-- ============================================================================
-- EOS KPI Module — Phase 7 User Role Assignments
-- ============================================================================
-- Owner:        Carl Matheous Simpao (carl@vivacity.com.au)
-- Purpose:      Assign `users.kpi_role` to internal staff, and grant Nova the
--               `kpi_reviewer` role in `public.user_roles`.
-- Apply via:    Supabase SQL Editor (manual review — do NOT run via migration).
-- Reversible:   See "Rollback" section at the bottom.
-- ============================================================================
--
-- Notes for the reviewer
-- ----------------------
-- * `dd_kpi_role` allowed values: 'csc_consultant', 'cst_assistant', 'developer'.
-- * Angela Connell-Richards (Super Admin) does NOT need a `kpi_reviewer` row —
--   `is_super_admin_safe()` already grants her oversight. She signs as
--   `signoff_type = 'superadmin'`.
-- * Only **Nova Canto (Integrator account: nova@vivacity.com.au)** gets the
--   `kpi_reviewer` row. Her secondary CSC test account (nova+csc@…) does NOT.
-- * `kpi_role` is intentionally left NULL for Super Admins, BGT staff, and
--   Team Members who are not part of CSC / CST / Dev pods. Adjust below if
--   any assignment is wrong before running.
-- * All statements are idempotent — safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. CSC Consultants
-- ----------------------------------------------------------------------------
UPDATE public.users SET kpi_role = 'csc_consultant'
 WHERE user_uuid IN (
   '06f0d653-7bf7-4f47-ba57-d53affc10933',  -- AJ Delostrico
   'fafa40e3-d23e-4293-8363-0f1576ead0c2',  -- Ezel Mae Olores
   'f32f8e34-95b8-4702-8c86-a1815f6bffec',  -- Kelly Xu
   '16467f71-5c00-4b3f-9d1b-35224c2de3eb',  -- Samantha Holtham
   'c8bcf03e-7282-488c-af14-ec3c90208136',  -- Sharwari Rajurkar
   '90c83131-d087-4c1e-abc6-2751f37e3981',  -- Tanya Janklin
   '79ee0985-db92-4cdf-a4f8-e9641cbee365'   -- Nova Canto (nova+csc test account)
 );

-- ----------------------------------------------------------------------------
-- 2. CST Assistants
-- ----------------------------------------------------------------------------
-- TODO (Carl): confirm which Team Members operate as CST Assistants and add
-- their user_uuid(s) below. Leaving the list empty if unsure is safe — the
-- KPI dashboard simply won't list anyone under CST until populated.
--
-- Example:
-- UPDATE public.users SET kpi_role = 'cst_assistant'
--  WHERE user_uuid IN (
--    '00000000-0000-0000-0000-000000000000'  -- <Name>
--  );

-- ----------------------------------------------------------------------------
-- 3. Developers
-- ----------------------------------------------------------------------------
-- TODO (Carl): confirm developer roster. Carl himself is a Super Admin, so
-- whether to also tag him with kpi_role='developer' is a policy call — adding
-- it lets his own KPI dashboard render via `/my/kpi`.
--
-- Example:
-- UPDATE public.users SET kpi_role = 'developer'
--  WHERE user_uuid IN (
--    '6df5fa0f-f266-479f-bbd7-3c56856e9a50'  -- Carl Matheous Simpao
--  );

-- ----------------------------------------------------------------------------
-- 4. Grant Nova the `kpi_reviewer` role
-- ----------------------------------------------------------------------------
-- This is the cross-staff oversight grant. `is_kpi_reviewer_safe()` reads
-- from this table to allow Nova to view every staff member's KPI dashboard
-- and to sign reviews with `signoff_type = 'reviewer'`.
INSERT INTO public.user_roles (user_id, role)
VALUES ('755d843d-8d93-4179-8bb8-50c61a6f21fe', 'kpi_reviewer')  -- Nova Canto (Integrator)
ON CONFLICT (user_id, role) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Verification (run before COMMIT)
-- ----------------------------------------------------------------------------
-- Uncomment to inspect:
-- SELECT user_uuid, full_name, email, unicorn_role, kpi_role
--   FROM public.users
--  WHERE kpi_role IS NOT NULL
--  ORDER BY kpi_role, full_name;
--
-- SELECT ur.user_id, u.full_name, u.email, ur.role
--   FROM public.user_roles ur
--   JOIN public.users u ON u.user_uuid = ur.user_id
--  WHERE ur.role = 'kpi_reviewer';

COMMIT;

-- ============================================================================
-- Rollback (run only if the assignment was wrong)
-- ============================================================================
-- BEGIN;
--   UPDATE public.users SET kpi_role = NULL
--    WHERE user_uuid IN (
--      '06f0d653-7bf7-4f47-ba57-d53affc10933',
--      'fafa40e3-d23e-4293-8363-0f1576ead0c2',
--      'f32f8e34-95b8-4702-8c86-a1815f6bffec',
--      '16467f71-5c00-4b3f-9d1b-35224c2de3eb',
--      'c8bcf03e-7282-488c-af14-ec3c90208136',
--      '90c83131-d087-4c1e-abc6-2751f37e3981',
--      '79ee0985-db92-4cdf-a4f8-e9641cbee365'
--    );
--   DELETE FROM public.user_roles
--    WHERE user_id = '755d843d-8d93-4179-8bb8-50c61a6f21fe'
--      AND role = 'kpi_reviewer';
-- COMMIT;
