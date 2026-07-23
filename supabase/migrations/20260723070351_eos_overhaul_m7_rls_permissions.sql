-- ============================================================
-- EOS Meeting Overhaul — Migration 7 (RLS + permission model)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). Apply in the 22:00-04:00 AEST off-peak window per
-- project convention (policy replace takes a brief ACCESS EXCLUSIVE
-- lock on the two tables).
--
-- Adds real PERMISSIVE policies onto eos_configurations and
-- eos_configuration_segments, which have carried zero policies (deny-all
-- by default) since M1 - deliberately, so this step needed nothing to
-- drop first (see M1's own reasoning for never adding a placeholder
-- RESTRICTIVE policy).
--
-- New public.has_permission(feature_key, min_level) SQL function mirrors
-- src/hooks/usePermission.ts EXACTLY (same role_permissions + user_roles
-- union, same level ordinals, same Super-Admin short-circuit) so RLS and
-- the frontend enforce the identical rule - this is the third of the
-- three surfaces (button visibility, in-dialog actions, RLS) the plan
-- wants unified onto one feature key. Deliberately does NOT filter
-- user_roles.expires_at even though that column exists, because the
-- live hook doesn't either - matching the actual enforced behavior
-- exactly matters more than fixing that independently and creating a
-- UI/RLS mismatch.
--
-- eos.configurations.manage granted to Super Admin + Integrator only,
-- per the plan ("who gets the permission doesn't change, just which
-- system decides it") - explicit 'none' rows added for the other roles
-- to match the fully-populated-per-role convention already used for
-- every other feature_key (confirmed live on eos.meetings.l10.create
-- etc).
--
-- Deliberately OUT OF SCOPE here: the 4 pre-existing eos.meetings.*
-- permission keys (l10.create, l10.participate, samepage, quarterly)
-- flagged in M1 as having inconsistent per-type role grants (e.g.
-- quarterly grants Integrator:none but Team Leader:full - the reverse
-- of l10.create). Those gate meeting SCHEDULING in the current
-- MeetingScheduler.tsx, not Configuration management - reconciling them
-- belongs with Stage 2's frontend rebuild (which replaces the
-- component that reads them), not this RLS migration. Changing their
-- grants now, before that frontend work lands, would alter live access
-- to the current scheduling UI with no corresponding code change to
-- justify it.
-- ============================================================

BEGIN;

-- 1. SQL mirror of usePermission.ts, for use in RLS policies.
CREATE OR REPLACE FUNCTION public.has_permission(p_feature_key text, p_min_level text DEFAULT 'limited')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      WHERE rp.feature_key = p_feature_key
        AND (CASE rp.level WHEN 'full' THEN 3 WHEN 'limited' THEN 2 WHEN 'owner_only' THEN 1 ELSE 0 END)
            >= (CASE p_min_level WHEN 'full' THEN 3 WHEN 'limited' THEN 2 WHEN 'owner_only' THEN 1 ELSE 0 END)
        AND rp.role IN (
          SELECT unicorn_role FROM public.users WHERE user_uuid = auth.uid() AND unicorn_role IS NOT NULL
          UNION
          SELECT role FROM public.user_roles WHERE user_uuid = auth.uid()
        )
    );
$function$;

REVOKE ALL ON FUNCTION public.has_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text, text) TO authenticated, service_role;

-- 2. Grant eos.configurations.manage — Super Admin + Integrator only.
--    Explicit rows for every role, matching the fully-populated
--    convention already used for other feature_keys.
INSERT INTO public.role_permissions (role, feature_key, level)
VALUES
  ('Super Admin', 'eos.configurations.manage', 'full'),
  ('Integrator', 'eos.configurations.manage', 'full'),
  ('Team Leader', 'eos.configurations.manage', 'none'),
  ('BGT', 'eos.configurations.manage', 'none'),
  ('CET', 'eos.configurations.manage', 'none'),
  ('CSC', 'eos.configurations.manage', 'none')
ON CONFLICT (role, feature_key) DO NOTHING;

-- 3. RLS: broad Vivacity-staff read, narrow manage-permission write.
--    Vivacity-only tables per project convention (only is_vivacity()
--    needed - no tenant-read policy, since this feature only ever
--    applies to tenant 6372 and no client tenant reaches these tables).
CREATE POLICY eos_configurations_staff_read
  ON public.eos_configurations
  FOR SELECT TO authenticated
  USING (public.is_vivacity());

CREATE POLICY eos_configurations_manage_write
  ON public.eos_configurations
  FOR ALL TO authenticated
  USING (public.has_permission('eos.configurations.manage', 'full'))
  WITH CHECK (public.has_permission('eos.configurations.manage', 'full'));

CREATE POLICY eos_configuration_segments_staff_read
  ON public.eos_configuration_segments
  FOR SELECT TO authenticated
  USING (public.is_vivacity());

CREATE POLICY eos_configuration_segments_manage_write
  ON public.eos_configuration_segments
  FOR ALL TO authenticated
  USING (public.has_permission('eos.configurations.manage', 'full'))
  WITH CHECK (public.has_permission('eos.configurations.manage', 'full'));

NOTIFY pgrst, 'reload schema';

COMMIT;
