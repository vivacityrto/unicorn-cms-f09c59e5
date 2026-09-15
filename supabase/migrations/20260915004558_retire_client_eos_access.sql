-- Retire client-tenant access to EOS (Carl, 2026-09-15).
--
-- Context: RBAC v6 P1 review-ask discussion surfaced that EOS
-- (eos.scorecard.manage / eos.rocks.own.manage / eos.configurations.manage,
-- and related tables) has real per-tenant RLS clauses that grant access to
-- ANY client-tenant user, independent of the frontend's `eos:access`
-- permission (which already correctly restricts the UI to Vivacity Team
-- only). Investigation confirmed:
--   - all 384 rows in eos_user_roles (across 377 tenants) were a single
--     bulk backfill on 2026-01-06 (all identical timestamp, role
--     'participant', assigned_by NULL) -- not real client onboarding;
--   - every row of REAL EOS content (eos_rocks, eos_scorecard,
--     eos_configurations, eos_vto) belongs exclusively to tenant 6372
--     (Vivacity Coaching & Consulting's own internal tenant record);
--   - Vivacity's own tenant (6372) has zero eos_user_roles rows -- its
--     access already flows entirely through is_vivacity_team_user()/
--     is_super_admin(), independent of this table.
-- Carl's decision: retire the client-tenant access path entirely (may
-- re-expand later); clean up the unused bulk-seeded rows. This does not
-- touch eos_configurations/eos_configuration_segments, whose RLS already
-- routes through has_permission('eos.configurations.manage', 'full') --
-- confirmed only internal unicorn_role values (BGT/CET/CSC/Integrator/
-- Super Admin/Team Leader) have any role_permissions row for that key, so
-- no client-tenant role can ever satisfy it.

-- 1) Defense-in-depth: gate the two eos_user_roles-backed helper functions
--    to Vivacity's own tenant only, even though step 3 empties the table.
CREATE OR REPLACE FUNCTION public.has_any_eos_role(_user_id uuid, _tenant_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _tenant_id = 6372 AND EXISTS (
    SELECT 1
    FROM public.eos_user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_facilitate_eos(_user_id uuid, _tenant_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _tenant_id = 6372 AND EXISTS (
    SELECT 1
    FROM public.eos_user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role IN ('admin', 'facilitator')
  )
$function$;

-- 2) Remove the raw tenant-match / tenant-member clauses baked directly
--    into policies (these do not route through the functions above, so
--    step 1 alone would not close them).

-- eos_rocks
DROP POLICY IF EXISTS eos_rocks_delete ON public.eos_rocks;
CREATE POLICY eos_rocks_delete ON public.eos_rocks
  FOR DELETE TO public
  USING (
    is_super_admin()
    OR is_vivacity_team_user((SELECT auth.uid()))
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
  );

DROP POLICY IF EXISTS eos_rocks_insert ON public.eos_rocks;
CREATE POLICY eos_rocks_insert ON public.eos_rocks
  FOR INSERT TO public
  WITH CHECK (
    is_super_admin()
    OR (is_vivacity_team_user((SELECT auth.uid())) AND (workspace_id IS NULL OR workspace_id = get_vivacity_workspace_id()))
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
  );

DROP POLICY IF EXISTS eos_rocks_select ON public.eos_rocks;
CREATE POLICY eos_rocks_select ON public.eos_rocks
  FOR SELECT TO authenticated
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR is_super_admin()
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
  );

DROP POLICY IF EXISTS eos_rocks_update ON public.eos_rocks;
CREATE POLICY eos_rocks_update ON public.eos_rocks
  FOR UPDATE TO public
  USING (
    is_super_admin()
    OR owner_id = (SELECT auth.uid())
    OR is_vivacity_team_user((SELECT auth.uid()))
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
  )
  WITH CHECK (
    is_super_admin()
    OR owner_id = (SELECT auth.uid())
    OR is_vivacity_team_user((SELECT auth.uid()))
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
  );

-- eos_todos
DROP POLICY IF EXISTS eos_todos_delete ON public.eos_todos;
CREATE POLICY eos_todos_delete ON public.eos_todos
  FOR DELETE TO public
  USING (
    has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR is_super_admin()
    OR is_vivacity_team_user((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS eos_todos_insert ON public.eos_todos;
CREATE POLICY eos_todos_insert ON public.eos_todos
  FOR INSERT TO public
  WITH CHECK (
    has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR is_super_admin()
    OR (is_vivacity_team_user((SELECT auth.uid())) AND (workspace_id IS NULL OR workspace_id = get_vivacity_workspace_id()))
  );

DROP POLICY IF EXISTS eos_todos_select ON public.eos_todos;
CREATE POLICY eos_todos_select ON public.eos_todos
  FOR SELECT TO public
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR is_super_admin()
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR assigned_to = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS eos_todos_update ON public.eos_todos;
CREATE POLICY eos_todos_update ON public.eos_todos
  FOR UPDATE TO public
  USING (
    has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR is_super_admin()
    OR assigned_to = (SELECT auth.uid())
    OR is_vivacity_team_user((SELECT auth.uid()))
  )
  WITH CHECK (
    has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR is_super_admin()
    OR assigned_to = (SELECT auth.uid())
    OR is_vivacity_team_user((SELECT auth.uid()))
  );

-- eos_vto (delete policy already had no raw tenant clause; left unchanged)
DROP POLICY IF EXISTS eos_vto_insert ON public.eos_vto;
CREATE POLICY eos_vto_insert ON public.eos_vto
  FOR INSERT TO public
  WITH CHECK (
    is_super_admin()
    OR (is_vivacity_team_user((SELECT auth.uid())) AND (workspace_id IS NULL OR workspace_id = get_vivacity_workspace_id()))
    OR is_eos_admin((SELECT auth.uid()), tenant_id)
  );

DROP POLICY IF EXISTS eos_vto_select ON public.eos_vto;
CREATE POLICY eos_vto_select ON public.eos_vto
  FOR SELECT TO public
  USING (
    is_vivacity_team_user((SELECT auth.uid()))
    OR has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR is_eos_admin((SELECT auth.uid()), tenant_id)
    OR is_super_admin()
  );

DROP POLICY IF EXISTS eos_vto_update ON public.eos_vto;
CREATE POLICY eos_vto_update ON public.eos_vto
  FOR UPDATE TO public
  USING (
    is_super_admin()
    OR is_vivacity_team_user((SELECT auth.uid()))
    OR is_eos_admin((SELECT auth.uid()), tenant_id)
  )
  WITH CHECK (
    is_super_admin()
    OR is_vivacity_team_user((SELECT auth.uid()))
    OR is_eos_admin((SELECT auth.uid()), tenant_id)
  );

-- eos_scorecard
DROP POLICY IF EXISTS eos_scorecard_delete ON public.eos_scorecard;
CREATE POLICY eos_scorecard_delete ON public.eos_scorecard
  FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR is_vivacity_team_safe((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS eos_scorecard_insert ON public.eos_scorecard;
CREATE POLICY eos_scorecard_insert ON public.eos_scorecard
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR is_vivacity_team_safe((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS eos_scorecard_select ON public.eos_scorecard;
CREATE POLICY eos_scorecard_select ON public.eos_scorecard
  FOR SELECT TO public
  USING (
    is_super_admin()
    OR is_vivacity_team_safe((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS eos_scorecard_update ON public.eos_scorecard;
CREATE POLICY eos_scorecard_update ON public.eos_scorecard
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR is_vivacity_team_safe((SELECT auth.uid()))
  )
  WITH CHECK (
    is_super_admin()
    OR is_vivacity_team_safe((SELECT auth.uid()))
  );

-- 3) Clean up the unused 2026-01-06 bulk backfill. Tenant 6372 (Vivacity's
--    own tenant) has zero rows here already, so this affects no real access.
DELETE FROM public.eos_user_roles;
