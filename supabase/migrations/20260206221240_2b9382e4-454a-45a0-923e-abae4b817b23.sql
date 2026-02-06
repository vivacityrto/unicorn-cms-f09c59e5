-- ============================================================
-- RLS Standardization: time_entries
-- Phase A: Clean up overlapping policies, add WITH CHECK
-- ============================================================

-- 1. DROP legacy policies with `public` role
DROP POLICY IF EXISTS "Users view own time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Managers view tenant time entries" ON public.time_entries;

-- 2. DROP existing standardized policies to recreate with updates
DROP POLICY IF EXISTS "time_entries_select" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_update" ON public.time_entries;

-- 3. CREATE standardized SELECT policy
-- Owner OR SuperAdmin OR Vivacity team (aligns with "own time only" + consulting access)
CREATE POLICY "time_entries_select"
ON public.time_entries
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

-- 4. CREATE standardized UPDATE policy with WITH CHECK clause
-- Prevents ownership changes during updates
CREATE POLICY "time_entries_update"
ON public.time_entries
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

-- Note: INSERT and DELETE policies remain unchanged (already standardized)
-- time_entries_insert: user_id = auth.uid() AND has_tenant_access_safe()
-- time_entries_delete: is_super_admin_safe() OR user_id = auth.uid()