-- Replace the legacy `kpi_pod = 'qa'` overload with a dedicated
-- `is_qa_persona` flag (Carl, 2026-09-15). Live query confirmed kpi_pod has
-- only ever held null (622 rows) or 'qa' (5 rows) across the whole database
-- -- it was never used for real "KPI pod" team grouping, only this QA-marker
-- purpose. kpi_pod itself is deliberately NOT dropped here: the DB migration
-- (via MCP) and the frontend deploy (via Vercel on merge) are not
-- synchronized, so dropping it now would break still-live old frontend code
-- querying it during the gap before this PR's frontend changes deploy.
--
-- is_qa_persona is distinct from:
--  - is_system_account (2026-08-25): no real permissions at all, a non-human
--    identity. is_qa_persona keeps full permissions of its unicorn_role.
--  - RBAC v6's future "seat subtype" concept (a bounded capability modifier
--    within a role, not yet built): is_qa_persona has zero permission
--    effect, it is a pure visibility flag for staff-facing pickers/
--    directories, same mechanism as is_system_account.
--
-- Also folds in the RBAC v6 plan's §13 truth-sync baseline (2026-09-10,
-- executed here): Team Leader retires into Integrator, CET retires
-- outright -- both confirmed zero current holders.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_qa_persona boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_qa_persona IS
  'True for a real staff role''s QA/testing persona (e.g. carl+csc@vivacity.com.au) -- keeps full role permissions for its unicorn_role, but is excluded from staff-facing pickers/directories, same as is_system_account. Distinct from is_system_account (no real permissions at all) and from the RBAC v6 "seat subtype" concept (a bounded capability modifier within a role) -- neither of those apply here.';

-- NOTE: the authenticated-role SELECT grant for this column was missed here
-- and applied as a separate follow-up migration
-- (20260915033500_grant_authenticated_select_is_qa_persona.sql) after being
-- caught during this same PR's verification pass -- see that file's header
-- for why, and AGENTS.md's per-column-grant guardrail this repeats.

UPDATE public.users
SET is_qa_persona = true
WHERE kpi_pod = 'qa';

-- Nova (nova@vivacity.com.au) is an Integrator who also runs the CSC seat --
-- confirmed via the already-live check_permission()/user_roles multi-role
-- infrastructure (proven in production via the Bulk Generate Automation
-- supplemental role), not a new mechanism. A separate duplicate account,
-- nova+csc@vivacity.com.au, was found during this work and is deliberately
-- NOT touched here -- deferred per Carl's explicit instruction to handle it
-- separately later.
INSERT INTO public.user_roles (user_uuid, role)
VALUES ('755d843d-8d93-4179-8bb8-50c61a6f21fe', 'CSC')
ON CONFLICT DO NOTHING;

UPDATE public.dd_unicorn_roles
SET is_active = false,
    description = 'Retired 2026-09-15 -- migrates into Integrator per RBAC v6 plan (2026-09-10 baseline). Zero current holders. Kept for historical/backward-compat reference only.'
WHERE value = 'Team Leader';

UPDATE public.dd_unicorn_roles
SET is_active = false,
    description = 'Retired 2026-09-15 -- zero current holders, retired per RBAC v6 plan (2026-09-10 baseline). Kept for historical/backward-compat reference only.'
WHERE value = 'CET';
